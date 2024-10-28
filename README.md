# bulk input and output generators

Chunker and Bulker generators and iterators to manage chunking of inputs and bulking of outputs. Limiting the number of operations improves efficiency and helps defeat rate limits.

The chunker yields each item one by one, and output values can be passed to the bulker one by one, which make the transformation processing much simpler to code, especially in asynchronous environments.

The handling of the batching of output (bulker) and debatching of input (chunker) is handled automatically. The chunker and bulker can be used independenly or together, and scenarios with multiple chunkers or bulkers are also supported.

## install

```
npm i chunkosaur
```

## import

```
import {Bulker, Chunker} from 'chunkosaur'
```

## usage

Typically these would be used with an input API or database which supports some kind of paging, and write to an API that supports bulk operations.

### Simple example with input and output to arrays

```

import { Bulker, Chunker } from 'chunkosaur';
import test from 'ava';
import delay from 'delay';

// some test data
const items = Array.from({ length: 71 }, (_, i) => i);
const fix = items.slice();

// size of input chunks to fetch
const chunkSize = 11;

// threshold at which to initiate a flush
const threshold = 7;

// user provided fetcher - simulate an api call
const fetcher = async ({ stats }) => {
  const values = await delay(Math.round(Math.random() * 10)).then(() =>
    items.slice(stats.items, stats.items + chunkSize),
  );
  return {
    values,
    done: !values.length,
  };
};
// used to get input items
const chunker = new Chunker({ fetcher });

// all about bulking out put
const outItems = [];

// user supplied flusher - this would normally be to an api - we'll simulate async with a delay
const flusher = async ({ values }) =>
  delay().then(() => {
    Array.prototype.push.apply(outItems, values);
  });

// the bulker
const bulker = new Bulker({ flusher, threshold });

for await (const value of chunker.iterator) {
  // do something with value
  // simulate an async op
  await delay().then(() => bulker.pusher({ values: [value] }));
}
const stats = await bulker.done();
console.log(stats)


```

## chunker

The constructor for a chunker looks like this

```
   const chunker = new Chunker ({fetcher, errHandler, meta})
```

where fetcher is a function that knows how to get more data, errHandler an optional function to deal with caught errors and meta an optional object you can use to persist data between calls to your fetcher

### fetcher

You supply a fetcher function which must return an object like this.

```
{
  values: [...array of new values to add to the pool],
  done: false
}
```

or

```
{
  done: true
}
```

The fetcher will be called each time the pool is running out of items to yield.

#### Fetcher paging

You'll need to support some kind of paging in your fetcher. There are 3 types of paging supported by the chunker.

#### limit and offset

Your API or database may have a system of limit/offset where you can ask for the next 'n' items. The stats object passed to your fetcher will have progress so far and looks like this.

```
{
  fetches: 2,
  items: 71,
  startedAt: 1729849080839,
  createdAt: 1729849080839,
  finishedAt: 0,
  elapsed: 0
}
```

Where items is the number of items so far processed. You can use it as an offset like this

```
const fetcher = async ({ stats }) => {
  const values = await getFromApiSomehow ({offset: stats.items, limit: yourChunkSize})
  return {
    values,
    done: false
  }
}
```

#### paging

Some Apis might offer up a page at a time. You can use the stats to determine the next page

```
const fetcher = async ({ stats }) => {
  const values = await getFromApiSomehow ({pageNumber: stats.fetches})
  return {
    values,
    done: false
  }
}
```

#### next page token or other custom method

In addition to the stats property, the chunker also has a 'meta' property. This can be used to persist tokens or other any other information between calls.

```
const fetcher = async ({ stats, meta, chunker }) => {
  const {pageToken, values} = await getFromApiSomehow ({nextPageToken: meta.pageToken})
  // store for next time
  chunker.meta = {...meta, pageToken}
  return {
    values,
    done: false
  }
}
```

##### meta in constructor

You can also add meta data in the constructor if there's anything you need to persist and be available to the fetcher. For example

```
const chunker = new Chunker({ fetcher, meta: {startAt: 100, limit: 20, url: 'https://myapi', maxItems: 100 } });
```

and use it like this

```
const fetcher = async ({ stats, meta }) => {
  const {startAt = 0, limit , url, maxItems = Infinity} = meta
  if (stats.items >= maxItems) {
    return {
      done: true
    }
  }
  // we can tweak the upper limit to avoid returning more than we need as per maxLimit supplied
  const maxLimit = Math.min (limit, maxItems - stats.items)

  const values = await getFromApiSomehow (url, {offset: startAt + stats.items, limit: maxLimit})

  return {
    values,
    done: false
  }
}

```

## bulker

The constructor for a bulker looks like this

```
   const bulker = new Bulker ({flusher, threshold, errHandler, meta})
```

where

- flusher is a function that knows how to write a bulk of data
- threshold is the number of pending items to allow to build up before initiating a flush
- errHandler an optional function to deal with caught errors
- meta an optional object you can use to persist data between calls to your fetcher

### flusher

If you are doing bulking as well, you'll need to provide a flusher function which knows how to empty out pending data when it reaches a certain volume threshold and might look something like this.

```
  const flusher = async ({ values }) => {
    return putToApiSomehow (values)
  }
```

#### flusher arguments

The flusher receives other arguments similar to the chunker, which you can use to maintain meta data, examine progress so far and so on, so a full flusher could use any of these to be able to handle edge cases

```
  const flusher = async ({values, stats, meta, bulker})
```

where stats looks like this

```
{
  pushes: 71,
  flushes: 6,
  items: 71,
  startedAt: 1729849080846,
  createdAt: 1729849080839,
  elapsed: 111,
  finishedAt: 1729849080957
}

```

## handling items

With a chunker and optionally a bulker in place we can simply deal with items one by one.

```
  for await (const item of chunker.iterator) {
    const value = doSomethingwith(item)
    bulker.pusher ({values: [value]})
  }
  const stats = bulker.done()
```

#### bulker.pusher

You can push an array of a value (or multiple items) to the bulker as above.

#### bulker.done()

Call bulker.done on completion. This will do a final flush of any pending items

#### how to work with bulker if output API doesn't have bulk capabilities

Even though your output API doesn't support bulk output, you can still improve efficiency by creating multiple parallell updates in your flusher

This example is doing a bunch of parallel graphQL mutations.

```
  const flusher = async ({ values }) => {
    return Promise.all(values.map(f => gqlHelper.generalMutation({
      mutation: gqlQueries.updateFilmMaster,
      variables: {
        id: f.id,
        input: {
          hostModifiedTime: f.hostModifiedTime,
          hostReleaseTime: f.hostReleaseTime,
          hostCreatedTime: f.hostCreatedTime
        }
      }
    })))
  }
```

##### .... and in apps script

Apps Script isn't asychronous, but it does have a UrlFetchApp.fetchAll () method - so you can achieve parallel writes like this, but with the convenience of handling them one by one. I still use the async style coding (Which apps script supports) to minimize differences across platforms.

```
const flusher = async ({ values }) => {
    const requests = values.map (f=> makeRequestsFromValueSomehow (f))
    return UrlFetchApp.fetchAll (url, requests)
  }

```

## testing

if you are running the tests, install ava for test https://github.com/avajs/ava

## Article

for details see https://ramblings.mcpher.com/paging-large-data-sets-and-how-to-make-apps-script-understand-generators/. Also includes information on the Google Apps Script version of this if that's your thing.
