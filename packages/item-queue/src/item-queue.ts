/* eslint-disable no-magic-numbers, max-statements, complexity */

import EventEmitter from "events";
import assert from "assert";
import _ from "lodash";
import { Inflight, InflightRecord, RecordKey } from "./inflight";
const PAUSE_ITEM = Symbol("pause");
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
 * result of processed an item
 */
export type ItemQueueResult<ItemT = unknown> = ItemQueueData<ItemT> & {
  id: number;
  res?: ItemT;
  error?: Error;
};

/** Event handler */
export type ItemQueueHandler<ItemT = unknown> = (data: ItemQueueResult<ItemT>) => void;

/** handlers for the events item queue emits */
export type ItemQueueHandlers<ItemT = unknown> = {
  failItem?: ItemQueueHandler<ItemT>;
  fail?: ItemQueueHandler<ItemT>;
  doneItem?: ItemQueueHandler<ItemT>;
  pause?: () => void;
  done?: (data: { startTime: number; endTime: number; totalTime: number }) => void;
};

/**
 * Callback to process an item from the item queue
 *
 * @param item item to process
 * @param id id number item queue uses to track this item
 */
export type ProcessCb<ItemT> = (item: ItemT, id?: number) => Promise<unknown> | undefined;

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
  timeout?: number;
  watchPeriod?: number;
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
  private _failed: boolean | Error;
  private _timeout: number;
  private _deferred: boolean;
  private _processItem: ProcessCb<ItemT>;
  private _empty: boolean;
  private _watchPeriod: number;
  private _watchTime: number;
  private _id: number;
  private _pause: boolean;
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
    this._timeout = options.timeout; // TODO
    this._watchPeriod = options.watchPeriod || WATCH_PERIOD;
    this._watchTime = options.watchTime;
    this._id = 1;
    this._deferred = false;
    _.each(options.handlers, (handler: ItemQueueHandler<ItemT>, evt: string) => {
      this.on(evt, handler);
    });
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
      return this.Promise.reject(this._failed);
    }

    if (this.isPending) {
      return new this.Promise((resolve, reject) => {
        const h = (data) => {
          if (data.error) {
            this.removeListener("done", h);
            reject(data.error);
          } else {
            this.removeListener("fail", h);
            resolve(data);
          }
        };
        this.once("done", h);
        this.once("fail", h);
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
  addItem(item: ItemT, noStart: boolean, stopOnError?: boolean) {
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
    this._itemQ.unshift(this._wrap(ItemQueue.pauseItem));
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
    process.nextTick(() => {
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
    if (typeof item === "symbol") {
      return { item: undefined, _control: item };
    } else {
      return { item, stopOnError };
    }
  }

  private _emit(evt: string, data: ItemQueueResult<ItemT>) {
    this.emit(evt, data);
  }

  private _handleQueueItemDone(data: ItemQueueResult<ItemT>) {
    if (data.id > 0) {
      this._pending.remove(data.id);
    }

    if (this._failed) {
      return;
    }

    if (!data._control && data.id > 0) {
      if (data.error) {
        this._emit("failItem", data);
        if (data.stopOnError !== false && this._stopOnError) {
          this._failed = data.error;
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

    _.each(this._pending.inflights, (v: InflightRecord<ItemQueueData>, id: RecordKey) => {
      const lastXTime = this._pending.lastCheckTime(id, now);
      const time = this._pending.time(id, now);
      if (lastXTime >= this._watchTime) {
        watched.push({ item: v.value.item, promise: v.value.promise, time });
        this._pending.resetCheckTime(id, now);
      } else if (time >= this._watchTime) {
        still.push({ item: v.value.item, promise: v.value.promise, time });
      }
    });

    if (still.length > 0 || watched.length > 0) {
      this._watched = true;
      this.emit("watch", { total: watched.length + still.length, watched, still });
    } else if (this._watched) {
      this._watched = false;
      this.emit("watch", { total: 0, watched, still });
    }

    this._watchTimer = setTimeout(() => this._pendingWatcher(), this._watchPeriod).unref();
  }

  private _setupWatch() {
    if (!this._watchTimer && this._watchTime) {
      process.nextTick(() => this._pendingWatcher());
    }
  }

  private _process() {
    if (this._startTime === undefined) {
      this._startTime = Date.now();
    }

    if (this._processing || this._pause || this._itemQ.length === 0) return 0;

    this._processing = true;
    let count = 0;
    let i = this._pending.count;
    for (; this._itemQ.length > 0 && i < this._concurrency; i++) {
      const wrapped = this._itemQ.shift();
      if (wrapped._control === PAUSE_ITEM) {
        this._pause = true;
        // since no more pending can be added at this point, if there're no
        // existing pending, then setup to emit the pause event.
        if (this._pending.isEmpty) {
          process.nextTick(() => {
            this._handleQueueItemDone({ id: 0, item: undefined, _control: NOOP_ITEM });
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
        try {
          promise = this._processItem(wrapped.item, id);
          if (!promise || !promise.then) {
            promise = this.Promise.resolve(promise);
          }
        } catch (err) {
          promise = this.Promise.reject(err);
        }
      }

      this._pending.add(id, {
        item: wrapped.item,
        promise: promise.then(
          (res: any) => this._handleQueueItemDone({ id, res, ...wrapped }),
          (error: Error) => {
            this._handleQueueItemDone({ id, error, ...wrapped });
          }
        ),
      });
    }

    this._processing = false;

    this._setupWatch();

    return count;
  }
}
