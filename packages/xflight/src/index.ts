/** Simple assert that works in browser and Node.js */
function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

/** Timestamp in milliseconds since epoch */
export type Timestamp = number;

/** Anything usable as a Map key here. Numbers and symbols are supported for callers like
 * item-queue, which keys inflight work by an incrementing id (FJM-26). */
export type RecordKey = string | number | symbol;

/** Factory function that creates a promise */
export type PromiseFactory<T> = () => Promise<T>;

/** Internal record for tracking an inflight operation */
export interface InflightItem<V> {
    /** When the operation started */
    readonly start: Timestamp;
    /** Last check time for elapsed time tracking */
    lastXTime: Timestamp;
    /** The tracked value */
    readonly value: V;
}

/**
 * Keyed store of in-progress work, with start-time and last-check-time tracking.
 *
 * This is the generic core: it stores any value type `V` under any {@link RecordKey} and
 * knows nothing about promises. {@link Inflight} builds promise deduplication on top of it.
 *
 * `item-queue` uses this directly - it tracks `{ item, promise }` records keyed by an
 * incrementing number, which is neither a promise nor a string, so it needs the core rather
 * than {@link Inflight} (FJM-26).
 *
 * @template V The type of the tracked value.
 */
export class InflightStore<V = unknown> {
    /** Map of inflight items by key */
    protected readonly _inflights = new Map<RecordKey, InflightItem<V>>();

    /**
     * Track a value under a key.
     *
     * @throws If key already exists.
     */
    add(key: RecordKey, value: V, now?: Timestamp): V {
        assert(!this._inflights.has(key), `xflight: item ${String(key)} already exist`);
        const timestamp = now ?? Date.now();
        this._inflights.set(key, { start: timestamp, lastXTime: timestamp, value });
        return value;
    }

    /** Get the tracked value for a key, or undefined. */
    get(key: RecordKey): V | undefined {
        return this._inflights.get(key)?.value;
    }

    /**
     * Remove the inflight item for a key.
     *
     * @throws If key does not exist.
     */
    remove(key: RecordKey): void {
        assert(this._inflights.has(key), `xflight: removing non-existing item ${String(key)}`);
        this._inflights.delete(key);
    }

    /**
     * Iterate the tracked items as `[key, record]` pairs.
     *
     * Prefer this over reaching for the internal map - it is what lets a caller sweep every
     * in-progress entry, which is what item-queue's overdue-work watcher does.
     */
    entries(): IterableIterator<[RecordKey, InflightItem<V>]> {
        return this._inflights.entries();
    }

    /** Whether there are no inflight items. */
    get isEmpty(): boolean {
        return this._inflights.size === 0;
    }

    /** The number of inflight items. */
    get count(): number {
        return this._inflights.size;
    }

    /** Get the start time (ms since epoch) for a key, or undefined. */
    getStartTime(key: RecordKey): Timestamp | undefined {
        return this._inflights.get(key)?.start;
    }

    /** Elapsed ms since the start for a key, or -1 if not found. */
    time(key: RecordKey, now?: Timestamp): number {
        const item = this._inflights.get(key);
        return item ? (now ?? Date.now()) - item.start : -1;
    }

    /** Alias for {@link time}. */
    elapseTime(key: RecordKey, now?: Timestamp): number {
        return this.time(key, now);
    }

    /** Get the last check time (ms since epoch) for a key, or undefined. */
    getCheckTime(key: RecordKey): Timestamp | undefined {
        return this._inflights.get(key)?.lastXTime;
    }

    /** Elapsed ms since the last check for a key, or -1 if not found. */
    lastCheckTime(key: RecordKey, now?: Timestamp): number {
        const item = this._inflights.get(key);
        return item ? (now ?? Date.now()) - item.lastXTime : -1;
    }

    /** Alias for {@link lastCheckTime}. */
    elapseCheckTime(key: RecordKey, now?: Timestamp): number {
        return this.lastCheckTime(key, now);
    }

    /**
     * Reset the last check time for a key, or for all inflight items if no key is given.
     *
     * @returns This instance for chaining.
     */
    resetCheckTime(key?: RecordKey, now?: Timestamp): this {
        const timestamp = now ?? Date.now();
        if (key !== undefined) {
            const item = this._inflights.get(key);
            if (item) {
                item.lastXTime = timestamp;
            }
        } else {
            for (const item of this._inflights.values()) {
                item.lastXTime = timestamp;
            }
        }
        return this;
    }
}

/**
 * Inflight manages deduplication of asynchronous operations by key.
 * It ensures only one promise per key is active at a time, returning the same promise for concurrent requests.
 * Useful for avoiding duplicate network or resource-intensive calls.
 *
 * Adds promise semantics to {@link InflightStore}; the keyed storage and time tracking are
 * inherited, so there is one implementation of them (FJM-26).
 *
 * @template T The type of the resolved value of the managed promises.
 *
 * @example
 * ```ts
 * const inflight = new Inflight<Response>();
 *
 * // Multiple concurrent calls with same key return the same promise
 * const [a, b] = await Promise.all([
 *   inflight.promise("user:123", () => fetch("/api/user/123")),
 *   inflight.promise("user:123", () => fetch("/api/user/123")),
 * ]);
 * // Only one fetch was made, a === b
 * ```
 */
export class Inflight<T = unknown> extends InflightStore<Promise<T>> {
    /** The Promise implementation used by this instance */
    public readonly Promise: PromiseConstructor;

    /**
     * Create a new Inflight instance.
     *
     * Uses native Promise by default. Pass a custom Promise implementation if needed:
     *
     * ```ts
     * import AveAzul from "aveazul";
     * const inflight = new Inflight(AveAzul);
     * ```
     *
     * @param PromiseImpl - Optional custom Promise implementation to use.
     */
    constructor(PromiseImpl?: PromiseConstructor) {
        super();
        this.Promise = PromiseImpl ?? globalThis.Promise;
    }

    /**
     * Get or create a promise for a given key.
     * If a promise for the key is already inflight, returns it.
     * Otherwise, calls the provided factory to create a new promise, tracks it, and returns it.
     */
    promise(key: RecordKey, factory: PromiseFactory<T>): Promise<T> {
        const existing = this.get(key);
        if (existing) {
            return existing;
        }

        // Safe cleanup - don't throw if already removed manually
        const cleanup = (): void => {
            this._inflights.delete(key);
        };

        try {
            const p = factory();
            assert(
                p && typeof p.then === "function",
                `xflight: promiseFactory for key ${String(key)} didn't return a promise`
            );
            this.add(key, p).then(cleanup, cleanup);
            return p;
        } catch (err) {
            return this.Promise.reject(err);
        }
    }
}

// Default export for backwards compatibility
export default Inflight;
