/**
 * This can retrieve items passing them 1 at a time via a generator
 * @class Chunker
 */
export class Chunker {
  /**
   * @constructor Chunker
   * @param {function} fetcher how to fetch
   * @param {function} [errHandler] special function to handle detected (err)=> { ... }
   * @param {*} [meta=null] any meta data to be passed through to fetcher
   * @return {Bulker}
   */
  constructor({
    fetcher,
    errHandler = (err) => {
      throw err;
    },
    meta = null,
  }) {
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
        fetched = await fetcher({ stats: this.stats, meta: this.meta });
        let done = !fetched || fetched.done;
        const values = !done && fetched.values;
        const meta = !done && fetched.meta;

        if (!done && !Array.isArray(values)) {
          return this.errHandler(
            new Error(`expected result of type array - got ${typeof values}`),
          );
        }
        // updated meta for next time
        this.meta = meta || this.meta;

        // force no more fetching
        if (!done) {
          this.stats.items += values.length;
          this.stats.fetches++;
          appendToTank(values);
        }
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
