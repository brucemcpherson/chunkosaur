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
    this.treatNoResultsAsDone = treatNoResultsAsDone
    this.fetcher = fetcher;
    this.tank = [];
    this.meta = meta;
    this.errHandler = errHandler;
    this.stats = {
      fetches: 0,
      items: 0,
      startedAt: 0,
      createdAt: new Date().getTime(),
      finishedAt: 0,
      elapsed: 0,
    };

    this.eof = false;

    // add a chunk to the input tank
    const appendToTank = async (chunk) => {
      Array.prototype.push.apply(this.tank, chunk);
    };
    /**
     * this will be called when there's nothing in the input tank
     * it's a request to get some more somehow
     * @returns void
     */
    const fillTank = async () => {
      if (!this.stats.startedAt) this.stats.startedAt = new Date().getTime();

      let fetched = null;
      try {
        // fetched must return done: false + values or done:true
        fetched = await fetcher({ stats: this.stats, meta: this.meta, chunker: this });
        let done = !fetched || fetched.done || typeof fetched.values === typeof undefined;
        done = done || (this.treatNoResultsAsDone && Array.isArray(fetched) && !fetched.length)
        // final fetched should return meta , or meta with null to retain existing meta
        const { values, meta } = fetched;

        if (!done && !Array.isArray(values)) {
          return this.errHandler(
            new Error(`expected result of type array - got ${typeof values}`),
          );
        }
        if (done && Array.isArray(values) && values.length) {
          return this.errHandler(
            new Error(`received done signal along with ${values.length} fetched values - only signal done when there are no more values to fetch`),
          );
        }

        // updated meta for next time
        this.meta = meta || this.meta;
        if (done) return done

        // if we received no values and got here, then it means we're not done, just that page didnt have any qualifying data
        // so go again
        this.stats.fetches++;
        if (!values.length) return await fillTank()

        // force no more fetching
        this.stats.items += values.length;
  
        appendToTank(values);

        return done;
      } catch (err) {
        return this.errHandler(err);
      }
    };
    const self = this;
    const tank = self.tank;

    // this is the generator
    async function* tanker() {
      // iterate through every item either in the tank
      // or fill it up if there's more
      do {
        if (!tank.length) {
          self.eof = await fillTank();
          if (self.eof) {
            const finishedAt = new Date().getTime();
            self.stats.finishedAt = finishedAt;
            self.stats.elapsed = finishedAt - self.stats.startedAt;
          }
        }
        if (!self.eof) {
          const value = tank.splice(0, 1)[0];
          yield value;
        }
      } while (!self.eof);
    }

    // expose as iterator
    this.iterator = tanker();
  }

  async done() {
    return Promise.resolve(this.eof);
  }
}
