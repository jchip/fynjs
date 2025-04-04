"use strict";

/**
 * Disposer class for resource cleanup
 * @private
 */
class Disposer {
  constructor(fn, promise) {
    this._data = fn; // The cleanup function
    this._promise = promise; // The promise that resolves to the resource
  }
}

module.exports.Disposer = Disposer;
