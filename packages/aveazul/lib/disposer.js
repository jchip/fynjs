"use strict";

/**
 * Disposer class for resource cleanup
 * @private
 */
class Disposer {
  constructor(data, promise) {
    this._data = data; // The cleanup function
    this._promise = promise; // The promise that resolves to the resource
  }
}

module.exports.Disposer = Disposer;
