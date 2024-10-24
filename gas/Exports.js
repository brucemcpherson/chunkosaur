var Exports = {
  get Bulker() {
    return Bulker;
  },

  get Chunker() {
    return Chunker;
  },

  newBulker(...args) {
    return this.guard(new this.Bulker(...args));
  },

  newChunker(...args) {
    return this.guard(new this.Chunker(...args));
  },

  // used to trap access to unknown properties
  guard(target) {
    return new Proxy(target, this.validateProperties);
  },

  /**
   * for validating attempts to access non existent properties
   */
  get validateProperties() {
    return {
      get(target, prop, receiver) {
        // typeof and console use the inspect prop
        if (
          typeof prop !== 'symbol' &&
          prop !== 'inspect' &&
          !Reflect.has(target, prop)
        )
          throw `guard detected attempt to get non-existent property ${prop}`;

        return Reflect.get(target, prop, receiver);
      },

      set(target, prop, value, receiver) {
        if (!Reflect.has(target, prop))
          throw `guard attempt to set non-existent property ${prop}`;
        return Reflect.set(target, prop, value, receiver);
      },
    };
  },
};
