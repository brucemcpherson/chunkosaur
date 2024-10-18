// for simulating async operations
const delay = (ms = 1) => new Promise(resolve => {
  Utilities.sleep(ms)
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
    const response = await UrlFetchApp.fetch(getUri({ page: stats.fetches, limit: chunkSize }))
    const data = response.getContentText()
    const values = JSON.parse(data)
    return {
      values,
      done: !values.length || stats.items > maxItems
    }
  }

  // get a chunker
  const chunker = Exports.newChunker({ fetcher })

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
  const bulker = Exports.newBulker({ flusher, threshold })

  // how to get a uri based on page numbers so far fetched
  const getUri = ({ page, limit }) => `https://api.openbrewerydb.org/v1/breweries?per_page=${limit}&page=${page + 1}`

  // lets get this in chunks of 200
  const chunkSize = 200

  // set this to the maximum number to look at 
  const maxItems = Infinity

  // user provided fetcher
  const fetcher = async ({ stats }) => {
    const response = await UrlFetchApp.fetch(getUri({ page: stats.fetches, limit: chunkSize }))
    const data = response.getContentText()
    const values = JSON.parse(data)
    return {
      values,
      done: !values.length || stats.items > maxItems
    }
  }

  // get a chunker
  const chunker = Exports.newChunker({ fetcher })

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
const haversine = (a, b) => {
  const asin = Math.asin
  const cos = Math.cos
  const sin = Math.sin
  const sqrt = Math.sqrt
  const PI = Math.PI

  // equatorial mean radius of Earth (in meters)
  const R = 6378137

  function squared(x) { return x * x }
  function toRad(x) { return x * PI / 180.0 }
  function hav(x) {
    return squared(sin(x / 2))
  }

  // hav(theta) = hav(bLat - aLat) + cos(aLat) * cos(bLat) * hav(bLon - aLon)
  function haversineDistance(a, b) {
    const aLat = toRad(Array.isArray(a) ? a[1] : a.latitude ?? a.lat)
    const bLat = toRad(Array.isArray(b) ? b[1] : b.latitude ?? b.lat)
    const aLng = toRad(Array.isArray(a) ? a[0] : a.longitude ?? a.lng ?? a.lon)
    const bLng = toRad(Array.isArray(b) ? b[0] : b.longitude ?? b.lng ?? b.lon)

    const ht = hav(bLat - aLat) + cos(aLat) * cos(bLat) * hav(bLng - aLng)
    return 2 * R * asin(sqrt(ht))
  }
  return haversineDistance(a, b)
}

