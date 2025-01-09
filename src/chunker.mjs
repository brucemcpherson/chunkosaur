/**
 * This can retrieve items passing them 1 at a time via a generator
 * @class Chunker
 */
export class Chunker {
  /**
   * @constructor Chunker
   * @param {function} fetcher how to fetch
   * @param {boolean} [treatNoResultsAsDone=false] if the fetcher returns an array with zero length, treat as done, otherwise refetch
   * @param {function} [errHandler] special function to handle detected (err)=> { ... }
   * @param {*} [meta={}] any meta data to be passed through to fetcher
   * @return {Chunker}
   */
  constructor({
    fetcher,
    treatNoResultsAsDone = false,
    errHandler = (err) => {
      throw err;
    },
    meta = {},
  }) {
    const self = this
    self.treatNoResultsAsDone = treatNoResultsAsDone
    self.fetcher = fetcher;
    self.tank = [];
    self.meta = meta;
    self.errHandler = errHandler;
    self.stats = {
      fetches: 0,
      items: 0,
      startedAt: 0,
      createdAt: new Date().getTime(),
      finishedAt: 0,
      elapsed: 0,
    };
    self.exhausted = new Promise (resolve=> {
      self.resolveExhausted = resolve
    })
    self.yields = 0

    const gracefulExit = (error = null) => {
      self.resolveExhausted({
        error,
        yields: self.yields
      })
      self.eof = true
      if (error) {
        return self.errHandler(error);
      }
      return self
    }

    self.eof = false;

    // add a chunk to the input tank
    const appendToTank = async (chunk) => {
      Array.prototype.push.apply(self.tank, chunk);
    };
    /**
     * this will be called when there's nothing in the input tank
     * it's a request to get some more somehow
     * @returns void
     */
    const fillTank = async () => {
      if (!self.stats.startedAt) self.stats.startedAt = new Date().getTime();

      try {
        // fetched must return done: false + values or done:true
        const fetched = await fetcher({ stats: self.stats, meta: self.meta, chunker: self });
        let done = !fetched || fetched.done || typeof fetched.values === typeof undefined;
        done = done || (self.treatNoResultsAsDone && Array.isArray(fetched) && !fetched.length)

        // final fetched should return meta , or meta with null to retain existing meta
        // regenerator fails with this syntax
        //const { values, meta } = fetched;

        const values = fetched.values
        const meta = fetched.meta


        if (!done && !Array.isArray(values)) {
          return gracefulExit(
            new Error(`expected result of type array - got ${typeof values}`),
          );
        }
        if (done && Array.isArray(values) && values.length) {
          return gracefulExit(
            new Error(`received done signal along with ${values.length} fetched values - only signal done when there are no more values to fetch`),
          );
        }

        // updated meta for next time
        self.meta = meta || self.meta;
        if (done) return done

        // if we received no values and got here, then it means we're not done, just that page didnt have any qualifying data
        // so go again
        self.stats.fetches++;
        if (!values.length) return await fillTank()

        // force no more fetching
        self.stats.items += values.length;
  
        appendToTank(values);

        return done;
      } catch (err) {
        return gracefulExit(err);
      }
    };
    
    const tank = self.tank;

    // this is the generator
    async function* tanker() {
      // iterate through every item either in the tank
      // or fill it up if there's more
      let eof = null
      do {
        if (!tank.length) {
          eof = await fillTank();
          if (eof) {
            const finishedAt = new Date().getTime();
            self.stats.finishedAt = finishedAt;
            self.stats.elapsed = finishedAt - self.stats.startedAt;
          }
        }
        if (!eof) {
          const value = tank.splice(0, 1)[0];
          self.yields++
          yield value;
        }
      } while (!eof);
      
      // now resolve as it's all over
      return gracefulExit()

    }

    // expose as 
    self.iterator = tanker();
  }

  async done() {
    return Promise.resolve(this.eof);
  }
}
