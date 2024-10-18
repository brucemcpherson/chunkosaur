// for simulating async operations
const delay = (ms) => new Promise(resolve => {
  Utilities.sleep (ms)
  resolve()
})

/// test using an array
const t1 = async () => {

  // Just some test data
  const items = Array.from({ length: 71 }, (_, i) => i)

  // how big to make each chunk
  const chunkSize = 11

  // user provided fetcher - this would be calling an API in real life
  const fetcher = async ({ stats }) => {

    const values = await delay().then(() => items.slice(stats.items, stats.items + chunkSize))

    return {
      values,
      done: !values.length
    }
  }

  // used to get input items
  const chunker = Exports.newChunker({ fetcher })


  /**
   * now we can simply process one item at a time
   * the iterator will take care of handling input chunking
   */
  const check = []
  for await (const value of chunker.iterator) {
    // do something with value
    // simulate an async op
    await delay().then(() => check.push(value))
  }
  console.log(chunker.stats)
  console.log(JSON.stringify(check) === JSON.stringify(items) ? "all ok" : "failed")

}
