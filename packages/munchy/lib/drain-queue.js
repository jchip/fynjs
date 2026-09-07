"use strict";

class DrainQueue {
  constructor(stream) {
    this.reset(stream);
  }

  reset(stream) {
    this._stream = stream;
    this._data = [];
    this._index = 0;
    this._drained = false;
  }

  add(data) {
    this._data.push(data);
  }

  active() {
    return this._stream;
  }

  get() {
    const data = this._data[this._index];
    this._data[this._index++] = undefined;

    if (this._index === this._data.length) {
      this._index = 0;
      this._data = [];
    }

    return data;
  }

  hasMore() {
    return this._data.length > this._index;
  }

  get drained() {
    return this._drained && !this.hasMore();
  }

  set drained(x) {
    this._drained = x;
  }
}

module.exports = DrainQueue;
