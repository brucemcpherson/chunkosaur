import { Bulker, Chunker } from '../index.mjs';
//import { Bulker, Chunker } from 'chunkosaur';
import test from 'ava';
import delay from 'delay';

// some test data
const fix = Array.from({ length: 71 }, (_, i) => i);



test('every item gets bulked using stats', async (t) => {
  const chunkSize = 1 + Math.round(Math.random() * fix.length);
  const threshold = 1 + Math.round(Math.random() * fix.length);
  const items = fix.slice()
  const outItems = [];
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
  // user supplied flusher - this would normally be to an api - we'll simulate async with a delay
  const flusher = async ({ values }) =>
    delay().then(() => {
      Array.prototype.push.apply(outItems, values);
    });
  const bulker = new Bulker({ flusher, threshold });
  const chunker = new Chunker({ fetcher });
  for await (const value of chunker.iterator) {
    await delay().then(() => bulker.pusher({ values: [value] }));
  }
  const stats = await bulker.done();
  t.is(stats.pushes, stats.items);
  t.deepEqual(outItems, fix);

});


test('test meta and maxitems', async (t) => {
  const maxItems = 51
  const chunkSize = 1 + Math.round(Math.random() * maxItems);
  const threshold = 1 + Math.round(Math.random() * maxItems);
  const items = fix.slice()
  const outItems = [];
  // user provided fetcher - simulate an api call
  const fetcher = async ({ stats, meta }) => {
    const { startAt = 0, limit, url, maxItems = Infinity } = meta
    if (stats.items >= maxItems) {
      return {
        done: true
      }
    }
    const maxLimit = Math.min (limit, maxItems - stats.items)
    const values = await delay(Math.round(Math.random() * 10)).then(() =>
      items.slice(stats.items + startAt, stats.items + maxLimit + startAt),
    );
    return {
      values,
      done: !values.length,
    };
  };
  // user supplied flusher - this would normally be to an api - we'll simulate async with a delay
  const flusher = async ({ values }) =>
    delay().then(() => {
      Array.prototype.push.apply(outItems, values);
    });
  const bulker = new Bulker({ flusher, threshold });
  const chunker = new Chunker({ fetcher, meta: { startAt: 11, limit: chunkSize, maxItems } });
  for await (const value of chunker.iterator) {
    await delay().then(() => bulker.pusher({ values: [value] }));
  }
  const stats = await bulker.done();
  const smallFix = fix.slice (chunker.meta.startAt, chunker.meta.startAt+chunker.meta.maxItems)
  t.is(smallFix.length, outItems.length)
  t.is(stats.pushes, stats.items);
  t.deepEqual(outItems, smallFix);
  t.is(outItems.length, maxItems)
  console.log(stats)
});