"use strict";

const assert = require("assert");
const Promise = require("optional-require")(require)("bluebird", { default: global.Promise });

class Inflight {
  constructor(xPromise) {
    this._count = 0;
    this._inflights = {};
    this.Promise = xPromise || Promise;
  }

  promise(key, func) {
    const f = this._inflights[key];
    if (f) {
      return f.value;
    }

    const remove = () => this.remove(key);

    try {
      const p = func();
      assert(p && p.then, `xflight: func for key ${key} didn't return a promise`);
      this.add(key, p).then(remove, remove);
      return p;
    } catch (err) {
      return this.Promise.reject(err);
    }
  }

  add(key, value, now) {
    assert(this._inflights[key] === undefined, `xflight: item ${key} already exist`);
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
    assert(this._inflights[key] !== undefined, `xflight: removing non-existing item ${key}`);
    assert(
      this._count > 0,
      `xflight: removing item ${key} but list is empty - count ${this._count}`
    );

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
