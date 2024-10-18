import { Chunker } from '../src/chunker.mjs'
import { Bulker } from '../src/bulker.mjs'
import got from 'got';
import haversine from 'haversine-distance'

// for simulating async operations
const delay = (ms) => new Promise(resolve => {
  setTimeout(resolve, ms || Math.round(Math.random() * 100))
})

/// test using an array
const t1 = async () => {

  // Just some test data
  const items = Array.from({ length: 71 }, (_, i) => i)

  // how big to make each chunk
  const chunkSize = 11

  // user provided fetcher - this would be calling an API in real life
  const fetcher = async ({ stats }) => {

    // stats contains a number of useful progress data
    // including the number of items so far fetched
    // that means we can use it as an offset to get the next page
    // for testing, simulate async with a delay
    const values = await delay().then(() => items.slice(stats.items, stats.items + chunkSize))

    return {
      values,
      done: !values.length
    }
  }

  // used to get input items
  const chunker = new Chunker({ fetcher })


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

  // node 22 + for this to work.
  const brandNew = await Array.fromAsync(new Chunker({ fetcher }).iterator)
  console.log(JSON.stringify(brandNew) === JSON.stringify(items) ? "fromasync ok" : "fromasync failed")

}

// t1()

// these using an api
const breweries = async () => {

  // how to get a uri based on page numbers so far fetched
  const getUri = ({ page, limit }) => `https://api.openbrewerydb.org/v1/breweries?per_page=${limit}&page=${page + 1}`

  // lets get this in chunks of 200
  const chunkSize = 200

  // set this to the maximum number to look at 
  const maxItems = Infinity

  // user provided fetcher
  const fetcher = async ({ stats }) => {
    const values = await got(getUri({ page: stats.fetches, limit: chunkSize })).json()

    return {
      values,
      done: !values.length || stats.items > maxItems
    }
  }

  // get a chunker
  const chunker = new Chunker({ fetcher })

  // were looking for the 10 nearest breweries to the whitehouse 

  const whiteHouse = { lat: 38.897957, lng: -77.036560, name: 'the Whitehouse' }
  const target = whiteHouse
  const nearest = Array.from({ length: 10 }).fill({ brewery: null, distance: Infinity })

  for await (const brewery of chunker.iterator) {
    const distance = haversine(target, brewery)
    const furthest = nearest[0]
    if (distance < furthest.distance) {
      nearest[0] = {
        brewery,
        distance
      }
      nearest.sort((a, b) => b.distance - a.distance)
    }
  }

  console.log(`List of ${nearest.length} nearest breweries to ${target.name}\n` +
    nearest.sort((a, b) => a.distance - b.distance)
      .map((f, i) => [i + 1, f.brewery.name, f.brewery.city, Math.round(f.distance / 1000), "km"].join(" ")).join(`\n`))

  console.log(chunker.stats)
}

//breweries()

const withBulker = async () => {
  // now with a bulker
  // for testing we'll just output values to an array
  // in real life we'd send them to an API of some sort in chunks
  const outItems = []

  // when we have these number of items, then flush output
  const threshold = 20

  // user supplied flusher - this would normally be to an api - we'll simulate async with a delay
  const flusher = async ({ values }) => delay().then(() => {
    Array.prototype.push.apply(outItems, values)
  })

  // the bulker
  const bulker = new Bulker({ flusher, threshold })

  // how to get a uri based on page numbers so far fetched
  const getUri = ({ page, limit }) => `https://api.openbrewerydb.org/v1/breweries?per_page=${limit}&page=${page + 1}`

  // lets get this in chunks of 200
  const chunkSize = 200

  // set this to the maximum number to look at 
  const maxItems = Infinity

  // user provided fetcher
  const fetcher = async ({ stats }) => {
    const values = await got(getUri({ page: stats.fetches, limit: chunkSize })).json()

    return {
      values,
      done: !values.length || stats.items > maxItems
    }
  }

  // get a chunker
  const chunker = new Chunker({ fetcher })

  // were looking for all the breweries within 25 km of the empire state 
  const empireState = { lat: 40.748817, lng: -73.985428, name: 'Empire State' }
  const target = empireState
  const targetDistance = 25 * 1000

  for await (const brewery of chunker.iterator) {
    if (brewery.latitude && brewery.longitude) {
      const distance = haversine(target, brewery)
      if (distance <= targetDistance) bulker.pusher({ values: [{ brewery, distance }] })
    }
  }


  console.log(chunker.stats)
  bulker.done().then((result) => {
    console.log(result)
    console.log(outItems.sort((a, b) => a.distance - b.distance)
      .map(f => [f.brewery.name, f.brewery.city, Math.round(f.distance / 1000), "km"].join(" "))
      .join("\n"))
  })

}
withBulker()
