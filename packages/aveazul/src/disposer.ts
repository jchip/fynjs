/**
 * Disposer class for resource cleanup
 * @private
 */
export class Disposer<T> {
  _data: (resource: T) => void | Promise<void>; // The cleanup function
  _promise: Promise<T>; // The promise that resolves to the resource

  constructor(
    fn: (resource: T) => void | Promise<void>,
    promise: Promise<T>
  ) {
    this._data = fn;
    this._promise = promise;
  }
}
