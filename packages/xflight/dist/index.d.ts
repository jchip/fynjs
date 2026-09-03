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
export declare class InflightStore<V = unknown> {
    /** Map of inflight items by key */
    protected readonly _inflights: Map<RecordKey, InflightItem<V>>;
    /**
     * Track a value under a key.
     *
     * @throws If key already exists.
     */
    add(key: RecordKey, value: V, now?: Timestamp): V;
    /** Get the tracked value for a key, or undefined. */
    get(key: RecordKey): V | undefined;
    /**
     * Remove the inflight item for a key.
     *
     * @throws If key does not exist.
     */
    remove(key: RecordKey): void;
    /**
     * Iterate the tracked items as `[key, record]` pairs.
     *
     * Prefer this over reaching for the internal map - it is what lets a caller sweep every
     * in-progress entry, which is what item-queue's overdue-work watcher does.
     */
    entries(): IterableIterator<[RecordKey, InflightItem<V>]>;
    /** Whether there are no inflight items. */
    get isEmpty(): boolean;
    /** The number of inflight items. */
    get count(): number;
    /** Get the start time (ms since epoch) for a key, or undefined. */
    getStartTime(key: RecordKey): Timestamp | undefined;
    /** Elapsed ms since the start for a key, or -1 if not found. */
    time(key: RecordKey, now?: Timestamp): number;
    /** Alias for {@link time}. */
    elapseTime(key: RecordKey, now?: Timestamp): number;
    /** Get the last check time (ms since epoch) for a key, or undefined. */
    getCheckTime(key: RecordKey): Timestamp | undefined;
    /** Elapsed ms since the last check for a key, or -1 if not found. */
    lastCheckTime(key: RecordKey, now?: Timestamp): number;
    /** Alias for {@link lastCheckTime}. */
    elapseCheckTime(key: RecordKey, now?: Timestamp): number;
    /**
     * Reset the last check time for a key, or for all inflight items if no key is given.
     *
     * @returns This instance for chaining.
     */
    resetCheckTime(key?: RecordKey, now?: Timestamp): this;
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
export declare class Inflight<T = unknown> extends InflightStore<Promise<T>> {
    /** The Promise implementation used by this instance */
    readonly Promise: PromiseConstructor;
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
    constructor(PromiseImpl?: PromiseConstructor);
    /**
     * Get or create a promise for a given key.
     * If a promise for the key is already inflight, returns it.
     * Otherwise, calls the provided factory to create a new promise, tracks it, and returns it.
     */
    promise(key: RecordKey, factory: PromiseFactory<T>): Promise<T>;
}
export default Inflight;
