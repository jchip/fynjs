"use strict";

const assert = require("assert");

class Inflight {
  constructor() {
    this._count = 0;
    this._inflights = {};
  }

  add(key, value, now) {
    assert(this._inflights[key] === undefined, `Already has inflight item ${key}`);
    this._count++;
    now = now || Date.now();
    this._inflights[key] = { start: now, lastXTime: now, value };

    return value;
  }

  get(key) {
    const x = this._inflights[key];
    return x && x.value;
  }

  remove(key) {
    assert(this._inflights[key] !== undefined, `Removing non-existing inflight item ${key}`);
    assert(this._count > 0, `Removing inflight item ${key} but count is ${this._count}`);
    this._count--;
    if (this._count === 0) {
      this._inflights = {};
    } else {
      this._inflights[key] = undefined;
    }
  }

  get isEmpty() {
    return this._count === 0;
  }

  get count() {
    return this._count;
  }

  getStartTime(key) {
    const x = this._inflights[key];
    return x && x.start;
  }

  time(key, now) {
    const x = this._inflights[key];
    if (x) {
      return (now || Date.now()) - x.start;
    }
    return -1;
  }

  elapseTime(key, now) {
    return this.time(key, now);
  }

  getCheckTime(key) {
    const x = this._inflights[key];
    return x && x.lastXTime;
  }

  lastCheckTime(key, now) {
    const x = this._inflights[key];
    if (x) {
      const t = (now || Date.now()) - x.lastXTime;
      return t;
    }
    return -1;
  }

  elapseCheckTime(key, now) {
    return this.lastCheckTime(key, now);
  }

  resetCheckTime(key, now) {
    const x = this._inflights[key];
    if (x) {
      x.lastXTime = now || Date.now();
    }
    return this;
  }
}

module.exports = Inflight;
