import { Bulker, Chunker } from '../index.mjs';
import test from 'ava';
import delay from 'delay';

// some test data
const items = Array.from({ length: 71 }, (_, i) => i);
const fix = items.slice();
// fiddle with these numbers for different pipe sizes
const chunkSize = 11;
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

test('every item gets bulked', async (t) => {
  for await (const value of chunker.iterator) {
    // do something with value
    // simulate an async op
    await delay().then(() => bulker.pusher({ values: [value] }));
  }
  const stats = await bulker.done();
  t.is(stats.pushes, stats.items);
  t.deepEqual(outItems, fix);
});
