"use strict";

const assert = require("assert");

class Inflight {
  constructor() {
    this.count = 0;
    this.inflights = {};
  }

  add(key, value, now) {
    assert(this.inflights[key] === undefined, `Already has inflight item ${key}`);
    this.count++;
    now = now || Date.now();
    this.inflights[key] = { start: now, lastXTime: now, value };

    return value;
  }

  get(key) {
    const x = this.inflights[key];
    return x && x.value;
  }

  remove(key) {
    assert(this.inflights[key] !== undefined, `Removing non-existing inflight item ${key}`);
    assert(this.count > 0, `Removing inflight item ${key} but count is ${this.count}`);
    this.count--;
    if (this.count === 0) {
      this.inflights = {};
    } else {
      this.inflights[key] = undefined;
    }
  }

  isEmpty() {
    return this.count === 0;
  }

  getCount() {
    return this.count;
  }

  getStartTime(key) {
    const x = this.inflights[key];
    return x && x.start;
  }

  time(key, now) {
    const x = this.inflights[key];
    if (x) {
      return (now || Date.now()) - x.start;
    }
    return -1;
  }

  elapseTime(key, now) {
    return this.time(key, now);
  }

  getCheckTime(key) {
    const x = this.inflights[key];
    return x && x.lastXTime;
  }

  lastCheckTime(key, now) {
    const x = this.inflights[key];
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
    const x = this.inflights[key];
    if (x) {
      x.lastXTime = now || Date.now();
    }
    return this;
  }
}

module.exports = Inflight;
