/**
 * This can add items to a tank which flushes when it reaches a threshold
 * @class Bulker
 */
class Bulker {
  /**
   * @constructor Bulker
   * @param {function} flusher how to flush
   * @param {number} [threshold=1] number of items in tank at which to initiate a flush
   * @param {function} [errHandler] special function to handle detected (err)=> { ... }
   * @param {*} [meta={}] any meta data to be passed through to flusher
   * @return {Bulker}
   */
  constructor({ flusher, threshold = 1, errHandler, meta = {} }) {
    this.flusher = flusher;
    this.threshold = threshold;
    this.errHandler =
      errHandler ||
      ((err) => {
        throw new Error(err);
      });
    this.tank = [];
    this.meta = meta;
    this.stats = {
      pushes: 0,
      flushes: 0,
      items: 0,
      startedAt: 0,
      createdAt: new Date().getTime(),
      elapsed: 0,
      finishedAt: 0,
    };
  }

  /**
   * add items to be output
   * @param {object} p params
   * @param {*[]} p.values the values to write
   * @return {Promise} to null if not flushed
   */
  async pusher({ values }) {
    if (!this.stats.startedAt) this.stats.startedAt = new Date().getTime();
    if (!Array.isArray(values)) {
      return this.errHandler(
        'values passed to bulker.pusher should be an array- it was',
        typeof values,
      );
    }

    // add values to reservoir
    Array.prototype.push.apply(this.tank, values);
    this.stats.pushes++;

    // if we have too many we need to flush
    if (this.tank.length > this.threshold) {
      return this._flusher(this.tank.splice(0, this.threshold));
    }
    return Promise.resolve(null);
  }

  /**
   * call when done to finally flush tank
   */
  async done() {
    const finishedAt = new Date().getTime();
    return this.flush().then(() => ({
      ...this.stats,
      meta: this.meta,
      finishedAt,
      elapsed: finishedAt - this.stats.startedAt,
    }));
  }
  /**
   * final tank flush
   * @returns {Promise}
   */
  async flush() {
    return this._flusher(this.tank).then((result) => {
      this.tank = [];
      return result;
    });
  }

  /**
   * write these values somehow
   * @param {*} values
   * @returns {Bulker}
   */
  async _flusher(values) {
    if (values.length) {
      return this.flusher({ values, stats: this.stats, meta: this.meta, bulker: this }).then(
        (result) => {
          this.stats.flushes++;
          this.stats.items += values.length;
          return result;
        },
      );
    } else {
      return Promise.resolve(null);
    }
  }
}
