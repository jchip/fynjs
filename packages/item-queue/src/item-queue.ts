
import EventEmitter from "events";
import assert from "assert";
import { InflightStore as Inflight, type InflightItem as InflightRecord, type RecordKey } from "xflight";
const PAUSE_ITEM = Symbol("pause");
// marker queued by pause(), kept apart from PAUSE_ITEM so resume() can cancel it
const PAUSE_CALL = Symbol("pauseCall");
const RESUME_ITEM = Symbol("resume");
const NOOP_ITEM = Symbol("NOOP");
const WATCH_PERIOD = 500;

/**
 * data passed to the event handlers
 */
export type ItemQueueData<ItemT = unknown> = {
  item: ItemT;
  stopOnError?: boolean;
  promise?: Promise<unknown>;
  _control?: symbol;
};

/**
 * Data of each item for the progress watch event
 */
export type WatchItemInfo<ItemT = unknown> = {
  /** item that made progress */
  item: ItemT;
  /** promise waiting for item */
  promise: Promise<unknown>;
  /** time elapsed since item started processing */
  time: number;
};

/**
 * Data for the progress watch event of overdue items that took longer than `options.watchTime`
 *
 * The overdue items are reported in two fields: `watched` and `still`. Typically `watched` would
 * contain the items that are newly become overdue or again. If you are not interested in the difference,
 * then just combine them with `[].concat(watched, still)`.
 *
 * - `watched` are items that pass `options.watchTime` for the first time or again since they were
 *   last checked.
 * - `still` are items already overdue by `options.watchTime` but have not again taken more time than
 *    `options.watchTime` yet.
 */
export type WatchData<ItemT = unknown> = {
  /** total number of items triggered in `watched` and `still` combined */
  total: number;
  /** time an item has to take before it's reported */
  watchTime: number;
  /**
   * Items that took over `options.watchTime` for the first time or again since they were last checked
   */
  watched: WatchItemInfo<ItemT>[];
  /**
   * Items that are already overdue but have not again taken more time than `options.watchTime` yet
   */
  still: WatchItemInfo<ItemT>[];
};

/**
 * result of processed an item
 */
export type ItemQueueResult<ItemT = unknown> = ItemQueueData<ItemT> & {
  id: number;
  res?: ItemT;
  error?: Error;
};

/** Event handler */
export type ItemQueueHandler<ItemT = unknown> = (data: ItemQueueResult<ItemT>) => void;

/**
 * handlers for the events item queue emits
 * - You can pass these to the queue in `options.handlers`
 * - or you can handle each one as an event with `queue.on`
 */
export type ItemQueueHandlers<ItemT = unknown> = {
  /**
   * queue finished
   * - queue will emit an `empty` before this
   */
  done?: (data: { startTime: number; endTime: number; totalTime: number }) => void;
  /** an item processing failed */
  failItem?: ItemQueueHandler<ItemT>;
  /** queue failed */
  fail?: ItemQueueHandler<ItemT>;
  /** an item was processed */
  doneItem?: ItemQueueHandler<ItemT>;
  /** queue is paused */
  pause?: () => void;
  /** queue is empty */
  empty?: () => void;
  /**
   * progress watcher that watch for items taking longer than `options.watchTime`
   * to process.
   *
   * - If the queue emitted a watch event, and then all items resolved, it will emit
   *   the event one last time with empty items.
   */
  watch?: (data: WatchData<ItemT>) => void;
};

/**
 * Callback to process an item from the item queue
 *
 * @param item item to process
 * @param id id number item queue uses to track this item
 * @param signal only with `options.timeout`, aborted when the item times out
 */
export type ProcessCb<ItemT> = (
  item: ItemT,
  id?: number,
  signal?: AbortSignal
) => Promise<unknown> | void;

/**
 * Item queue options
 */
export type ItemQueueOptions<ItemT = unknown> = {
  /** pass in custom promise implementation */
  Promise?: PromiseConstructor;
  /** initial array of items */
  itemQ?: ItemT[];
  /** number of to process concurrently */
  concurrency?: number;
  /** callback to process each item */
  processItem: ProcessCb<ItemT>;
  /** immediately stop if an error occurred */
  stopOnError?: boolean;
  /**
   * max milliseconds an item can take. A timed out item fails with an `ETIMEDOUT` error,
   * its concurrency slot is freed, and a late result is ignored.
   * - `processItem` receives an `AbortSignal` that is aborted on timeout. The queue can't
   *   cancel the work, so check the signal to stop it.
   */
  timeout?: number;
  /** frequency the progress watcher should check for overdue items */
  watchPeriod?: number;
  /**
   * The time an item has to take before reporting it to the progress watcher
   * - If an item is already overdue but has not trigger the `watchTime` again yet, then
   *   it's report as part of the `still` items in the WatchData.
   */
  watchTime?: number;
  /** event handlers */
  handlers?: ItemQueueHandlers<ItemT>;
};

type InflightData<ItemT = unknown> = {
  item: ItemT;
  promise: Promise<unknown>;
};

/**
 * Queue to process items async
 */
export class ItemQueue<ItemT = unknown> extends EventEmitter {
  private Promise: PromiseConstructor;
  private static Promise = typeof Promise !== "undefined" && Promise;
  private _pending: Inflight;
  private _itemQ: ItemQueueData<ItemT>[];
  private _concurrency: number;
  private _stopOnError: boolean;
  private _failed: boolean;
  private _failError: unknown;
  private _timeout: number;
  private _deferred: boolean;
  private _processItem: ProcessCb<ItemT>;
  private _empty: boolean;
  private _watchPeriod: number;
  private _watchTime: number;
  private _id: number;
  private _pause: boolean;
  /** bumped by an immediate pause(), so a resume() tick scheduled earlier skips itself */
  private _pauseSeq = 0;
  private _startTime: number;
  private _processing: boolean;
  private _watchTimer: any;
  private _watched: boolean;

  constructor(options: ItemQueueOptions<ItemT>) {
    assert(
      options && typeof options.processItem === "function",
      "ItemQueue: must provide options.processItem callback"
    );
    super();
    this.Promise = options.Promise || ItemQueue.Promise;
    assert(this.Promise, "ItemQueue: No Promise implementation available");
    this._pending = new Inflight<InflightData>();
    this._itemQ = [];
    if (options.itemQ) {
      this.addItems(options.itemQ, true);
    }
    this._concurrency = options.concurrency || 15;
    this._processItem = options.processItem;
    this._stopOnError = options.stopOnError;
    this._failed = false;
    this._timeout = options.timeout > 0 ? options.timeout : 0;
    this._watchPeriod = options.watchPeriod || WATCH_PERIOD;
    this._watchTime = options.watchTime;
    this._id = 1;
    this._deferred = false;
    if (options.handlers) {
      for (const [evt, handler] of Object.entries(options.handlers)) {
        if (handler) {
          this.on(evt, handler as ItemQueueHandler<ItemT>);
        }
      }
    }
  }

  /**
   * Wait for the queue to finish processing items
   *
   * - while processing, events are emitted for each item
   *
   * @returns promise that wait for queue to finish
   */
  wait(): Promise<void> {
    if (this._failed) {
      return this.Promise.reject(this._failError);
    }

    if (this.isPending) {
      return new this.Promise((resolve, reject) => {
        // separate listeners, so a falsy rejection value still rejects
        const onDone = (data) => {
          this.removeListener("fail", onFail);
          resolve(data);
        };
        const onFail = (data) => {
          this.removeListener("done", onDone);
          reject(data.error);
        };
        this.once("done", onDone);
        this.once("fail", onFail);
      });
    }

    return this.Promise.resolve();
  }

  /**
   * setup to begin process at the next event tick
   *
   * @returns nothing
   */
  deferProcess() {
    if (this._deferred) return;
    this._deferred = true;
    process.nextTick(() => {
      this._deferred = false;
      this._process();
    });
  }

  /**
   * replace current array of items with a new one for processing
   *
   * @param itemQ - array of items
   * @param noStart - don't start processing after adding
   * @returns item q instance itself
   */
  setItemQ(itemQ: ItemT[], noStart?: boolean) {
    assert(Array.isArray(itemQ), "item-queue: Must pass array to setItemQ");
    this._itemQ = itemQ.map((x) => this._wrap(x));
    this._empty = itemQ.length === 0;
    if (!noStart) this.deferProcess();
    return this;
  }

  /**
   * add an item to the end of the queue
   *
   * @param item - item to add
   * @param noStart - if `true` then don't start processing
   * @param stopOnError - stop if error occurred for this item
   * @returns instance self
   */
  addItem(item: ItemT, noStart?: boolean, stopOnError?: boolean) {
    this._empty = false;
    this._itemQ.push(this._wrap(item, stopOnError));
    if (!noStart) this.deferProcess();
    return this;
  }

  /**
   * add an array of items to the end of the queue
   *
   * @param items - items to add
   * @param noStart - if `true` then don't start processing
   * @returns instance self
   */
  addItems(items: ItemT[], noStart?: boolean) {
    assert(Array.isArray(items), "item-queue: Must pass array to addItems");
    items.forEach((x) => this.addItem(x, true));
    if (!noStart) this.deferProcess();
    return this;
  }

  /**
   * Get the special item to add to the queue so processing will pause when it's reached
   */
  static get pauseItem() {
    return PAUSE_ITEM;
  }

  /**
   * check if the queue is paused
   */
  get isPause() {
    return this._pause;
  }

  /**
   * check if there are still items pending in the queue
   */
  get isPending() {
    return !this._pending.isEmpty || this._itemQ.length !== 0;
  }

  /**
   * get the total items still left in the queue, including those that
   * are being processed.
   */
  get count() {
    return this._pending.count + this._itemQ.length;
  }

  /**
   * pause the queue.  any items already in progress will finish first.
   * @returns instance self
   */
  pause() {
    if (this._processing || !this._pending.isEmpty) {
      // pause takes effect when the marker is reached, after in-flight items finish
      this._itemQ.unshift({ item: undefined, _control: PAUSE_CALL });
    } else {
      // nothing in flight, so pause now. A marker here would be consumed by the
      // next resume() and pause the queue again.
      this._pause = true;
      this._pauseSeq++;
      process.nextTick(() => this.emit("pause"));
    }
    return this;
  }

  /**
   * mark the queue to unpause.
   *
   * NOTE: this doesn't actually start the processing.  Typically
   * you should use `resume` to unpause and start processing.
   *
   * @returns instance self
   */
  unpause() {
    this._pause = false;
    return this;
  }

  /**
   * resume the queue processing.
   *
   * @remark this is the same as `start`
   *
   * @returns instance self
   */
  resume() {
    // cancel a pause() that hasn't been reached yet; user-placed pauseItem markers stay
    this._itemQ = this._itemQ.filter((x) => x._control !== PAUSE_CALL);
    const pauseSeq = this._pauseSeq;
    process.nextTick(() => {
      // a later pause() wins over this resume()
      if (pauseSeq !== this._pauseSeq) return;
      this.unpause();
      if (this._itemQ.length === 0) {
        this._itemQ.push(this._wrap(RESUME_ITEM));
      }
      this._process();
    });
    return this;
  }

  /**
   * start the queue processing
   *
   * @remark this is the same as `resume`
   *
   * @returns instance self
   */
  start() {
    return this.resume();
  }

  private _wrap(item: ItemT | symbol, stopOnError?: boolean): ItemQueueData<ItemT> {
    // only the queue's own markers are control items; any other symbol is user data
    if (item === PAUSE_ITEM || item === RESUME_ITEM) {
      return { item: undefined, _control: item as symbol };
    } else {
      return { item: item as ItemT, stopOnError };
    }
  }

  private _emit(evt: string, data: ItemQueueResult<ItemT>) {
    this.emit(evt, data);
  }

  private _handleQueueItemDone(data: ItemQueueResult<ItemT>, failed: boolean) {
    if (data.id > 0) {
      this._pending.remove(data.id);
    }

    if (this._failed) {
      return;
    }

    if (!data._control && data.id > 0) {
      if (failed) {
        this._emit("failItem", data);
        if (data.stopOnError !== false && this._stopOnError) {
          this._failed = true;
          this._failError = data.error;
          this._emit("fail", data);
          return;
        }
      } else {
        this._emit("doneItem", data);
      }
    }

    this._emitEmpty();

    if (!this._pause && this._itemQ.length > 0) {
      this._process();
    } else if (this._pending.isEmpty) {
      if (this._pause) {
        this.emit("pause");
      } else {
        this._emitDone();
      }
    }
  }

  private _emitDone() {
    const endTime = Date.now();
    const totalTime = endTime - this._startTime;
    const res = {
      startTime: this._startTime,
      endTime,
      totalTime,
    };
    this._pendingWatcher();
    this.emit("done", res);
  }

  private _emitEmpty() {
    if (this._itemQ.length === 0 && !this._empty) {
      this._empty = true; // make sure only emit empty event once
      this.emit("empty");
    }
  }

  private _pendingWatcher() {
    this._watchTimer = undefined;
    if (this._pending.isEmpty && !this._watched) return;

    const watched = [];
    const still = [];
    const now = Date.now();

    // entries() replaced reaching into the raw record object - xflight keeps its map private
    for (const [id, v] of this._pending.entries() as IterableIterator<
      [RecordKey, InflightRecord<InflightData<ItemT>>]
    >) {
      //
      // The `if (v)` guard that used to wrap this is gone: it existed because the old
      // remove() set `this._inflights[key] = undefined` and left the key in place, so
      // Object.entries() yielded [key, undefined] pairs. A Map drops the entry outright,
      // so the guard became unreachable - item-queue's 100% branch threshold caught it.
      //
      const lastXTime = this._pending.lastCheckTime(id, now);
      const time = this._pending.time(id, now);
      const overdue = time >= this._watchTime;
      const checked = lastXTime >= this._watchTime;

      if (overdue) {
        const data = { item: v.value.item, promise: v.value.promise, time };
        if (checked) {
          watched.push(data);
          this._pending.resetCheckTime(id, now);
        } else {
          still.push(data);
        }
      }
    }

    if (watched.length > 0 || still.length > 0) {
      this._watched = true;
      this.emit("watch", {
        total: watched.length + still.length,
        watched,
        still,
        watchTime: this._watchTime,
      });
    } else if (this._watched) {
      this._watched = false;
      this.emit("watch", { total: 0, watched, still, watchTime: this._watchTime });
    }

    this._watchTimer = setTimeout(() => this._pendingWatcher(), this._watchPeriod).unref();
  }

  /**
   * Fail the item if it doesn't settle within `options.timeout`. The first outcome wins,
   * so a result that arrives after the timeout is ignored.
   */
  private _withTimeout(promise: Promise<unknown>, abort: AbortController): Promise<unknown> {
    return new this.Promise((resolve, reject) => {
      // not unref'd: a hung item must still fail instead of letting the process exit
      const timer = setTimeout(() => {
        const error = Object.assign(new Error(`item-queue: item timed out after ${this._timeout}ms`), {
          code: "ETIMEDOUT",
        });
        abort.abort(error);
        reject(error);
      }, this._timeout);
      promise.then(
        (res) => {
          clearTimeout(timer);
          resolve(res);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  private _setupWatch() {
    if (!this._watchTimer && this._watchTime) {
      process.nextTick(() => this._pendingWatcher());
    }
  }

  /**
   * A failed queue never runs queued items. Report each one as a failed item
   * with the queue's error, so callers waiting on a `failItem` don't hang.
   */
  private _failQueued() {
    const queued = this._itemQ;
    this._itemQ = [];
    for (const wrapped of queued) {
      if (!wrapped._control) {
        this._emit("failItem", { id: this._id++, error: this._failError as Error, ...wrapped });
      }
    }
    return 0;
  }

  private _process() {
    if (this._startTime === undefined) {
      this._startTime = Date.now();
    }

    if (this._failed) return this._failQueued();

    if (this._processing || this._pause || this._itemQ.length === 0) return 0;

    this._processing = true;
    let count = 0;
    let i = this._pending.count;
    for (; this._itemQ.length > 0 && i < this._concurrency; i++) {
      const wrapped = this._itemQ.shift();
      if (wrapped._control === PAUSE_ITEM || wrapped._control === PAUSE_CALL) {
        this._pause = true;
        // since no more pending can be added at this point, if there're no
        // existing pending, then setup to emit the pause event.
        if (this._pending.isEmpty) {
          process.nextTick(() => {
            this._handleQueueItemDone({ id: 0, item: undefined, _control: NOOP_ITEM }, false);
          });
        }
        break;
      }

      count++;

      const id = this._id++;

      let promise: Promise<unknown>;

      if (wrapped._control === RESUME_ITEM) {
        promise = this.Promise.resolve({});
      } else {
        const abort = this._timeout ? new AbortController() : undefined;
        try {
          const res: unknown = this._processItem(wrapped.item, id, abort?.signal);
          if (res && (res as Promise<unknown>).then) {
            promise = res as Promise<unknown>;
          } else {
            promise = this.Promise.resolve(res);
          }
        } catch (err) {
          promise = this.Promise.reject(err);
        }
        if (abort) {
          promise = this._withTimeout(promise, abort);
        }
      }

      this._pending.add(id, {
        item: wrapped.item,
        promise: promise.then(
          (res: any) => this._handleQueueItemDone({ id, res, ...wrapped }, false),
          (error: Error) => {
            this._handleQueueItemDone({ id, error, ...wrapped }, true);
          }
        ),
      });
    }

    this._processing = false;

    this._setupWatch();

    return count;
  }
}
