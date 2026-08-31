import _ from "lodash";
import processConfig from "./process-config.js";
import composeConfig from "./compose-config.js";
import util from "./util.js";

function hideProperties(obj: any, props: string[]): void {
  props.forEach(prop => {
    Object.defineProperty(obj, prop, {
      enumerable: false,
      writable: false,
      configurable: false
    });
  });
}

/**
 * The operations hanging off a store's `_$`.
 *
 * They are kept off the store's own enumerable keys so the store itself stays a
 * plain config object - `expect(store).to.deep.equal({})` after a reset.
 */
export class Config {
  store: any;

  constructor(store: any) {
    this.store = store;
  }

  /** merge data into the store, arrays replacing rather than blending */
  use(data: any): void {
    util.merge(this.store, data);
  }

  /** fill in values the store does not already have */
  defaults(data: any): void {
    _.defaultsDeep(this.store, _.clone(data));
  }

  /** compose config partials from disk and merge them in */
  compose(info: any): void {
    util.merge(this.store, composeConfig(info));
  }

  /** resolve the `{{...}}` templates currently in the store */
  process(options?: any): void {
    processConfig(this.store, options);
  }

  /** empty the store, keeping the same object identity */
  reset(): void {
    const keys = Object.keys(this.store);
    keys.forEach(k => {
      delete this.store[k];
    });
  }
}

function $get(this: any, p: any) {
  return _.get(this, p);
}

/**
 * Create a config store.
 *
 * The store is a plain object holding the config, with two hidden members:
 * `$(path)` to read a value by path, and `_$` for the operations above.
 *
 * @returns a new empty store
 */
export function store(): any {
  const s: any = {};

  s.$ = $get;
  s._$ = new Config(s);

  hideProperties(s, ["$", "_$"]);

  return s;
}

export default store;
