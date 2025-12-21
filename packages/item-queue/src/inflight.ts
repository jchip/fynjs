import assert from "assert";

/**
 * record to remember a inflight value
 */
export type InflightRecord<T = unknown> = {
  start: number;
  lastXTime: number;
  value: T;
};

export type RecordKey = string | number | symbol;

/**
 * async inflight operation memoizer
 */
export class Inflight<T = unknown> {
  private _count: number;
  private _inflights: Record<RecordKey, InflightRecord>;

  constructor() {
    this._count = 0;
    this._inflights = {};
  }

  add<CT = T>(key: RecordKey, value: CT, now?: number): CT {
    assert(this._inflights[key] === undefined, `Already has inflight item ${String(key)}`);
    this._count++;
    now = now || Date.now();
    this._inflights[key] = { start: now, lastXTime: now, value };

    return value;
  }

  /**
   * return internal inflights records object
   */
  get inflights() {
    return this._inflights;
  }

  /**
   * get an inflight record
   *
   * @param key
   * @returns
   */
  get<CT = T>(key: RecordKey): CT {
    const x = this._inflights[key];
    return x && (x.value as CT);
  }

  /**
   * remove an inflight record
   *
   * @param key
   */
  remove(key: RecordKey) {
    assert(
      this._inflights[key] !== undefined,
      `Removing non-existing inflight item ${String(key)}`
    );
    assert(this._count > 0, `Removing inflight item ${String(key)} but count is ${this._count}`);
    this._count--;
    if (this._count === 0) {
      this._inflights = {};
    } else {
      this._inflights[key] = undefined;
    }
  }

  /**
   * Check if inflight record is empty (ie: no inflight operations)
   */
  get isEmpty() {
    return this._count === 0;
  }

  /**
   * get number of operations inflight
   */
  get count() {
    return this._count;
  }

  /**
   * Get the start time of a inflight operation
   *
   * @param key
   * @returns
   */
  getStartTime(key: RecordKey) {
    const x = this._inflights[key];
    return x && x.start;
  }

  /**
   * Get the time an inflight operation has elapsed
   * @param key
   * @param now
   * @returns
   */
  time(key: RecordKey, now?: number) {
    const x = this._inflights[key];
    if (x) {
      return (now || Date.now()) - x.start;
    }
    return -1;
  }

  /**
   * Get the time an inflight operation has elapsed
   * @param key
   * @param now
   * @returns
   */
  elapseTime(key: RecordKey, now?: number) {
    return this.time(key, now);
  }

  /**
   * Get the time the inflight operation was last checked
   * @param key
   * @returns
   */
  getCheckTime(key: RecordKey) {
    const x = this._inflights[key];
    return x && x.lastXTime;
  }

  /**
   * Get the time elapsed since last check
   *
   * @param key
   * @param now
   * @returns
   */
  lastCheckTime(key: RecordKey, now?: number) {
    const x = this._inflights[key];
    if (x) {
      const t = (now || Date.now()) - x.lastXTime;
      return t;
    }
    return -1;
  }

  /**
   * Get the time elapsed since last check
   *
   * @param key
   * @param now
   * @returns
   */
  elapseCheckTime(key: RecordKey, now?: number) {
    return this.lastCheckTime(key, now);
  }

  /**
   * Reset last check time to `now` or `Date.now()`
   *
   * @param key
   * @param now
   * @returns
   */
  resetCheckTime(key: RecordKey, now?: number) {
    const x = this._inflights[key];
    if (x) {
      x.lastXTime = now || Date.now();
    }
    return this;
  }
}
