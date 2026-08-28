/** Simple assert that works in browser and Node.js */
function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}
/**
 * Inflight manages deduplication of asynchronous operations by key.
 * It ensures only one promise per key is active at a time, returning the same promise for concurrent requests.
 * Useful for avoiding duplicate network or resource-intensive calls.
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
export class Inflight {
    /** Map of inflight items by key */
    _inflights = new Map();
    /** The Promise implementation used by this instance */
    Promise;
    /**
     * Create a new Inflight instance.
     *
     * Uses native Promise by default. Pass a custom Promise implementation if needed:
     *
     * ```ts
     * import Bluebird from "bluebird";
     * const inflight = new Inflight(Bluebird);
     * ```
     *
     * @param PromiseImpl - Optional custom Promise implementation to use.
     */
    constructor(PromiseImpl) {
        this.Promise = PromiseImpl ?? globalThis.Promise;
    }
    /**
     * Get or create a promise for a given key.
     * If a promise for the key is already inflight, returns it.
     * Otherwise, calls the provided factory to create a new promise, tracks it, and returns it.
     *
     * @param key - Unique identifier for the inflight operation.
     * @param factory - Function that returns a promise.
     * @returns The inflight promise for the key.
     */
    promise(key, factory) {
        const existing = this._inflights.get(key);
        if (existing) {
            return existing.value;
        }
        // Safe cleanup - don't throw if already removed manually
        const cleanup = () => {
            this._inflights.delete(key);
        };
        try {
            const p = factory();
            assert(p && typeof p.then === "function", `xflight: promiseFactory for key ${key} didn't return a promise`);
            this.add(key, p).then(cleanup, cleanup);
            return p;
        }
        catch (err) {
            return this.Promise.reject(err);
        }
    }
    /**
     * Manually add an inflight item for a key.
     *
     * @param key - Unique identifier for the inflight operation.
     * @param value - The promise to track.
     * @param now - Optional timestamp for when the operation started (defaults to now).
     * @returns The promise that was added.
     * @throws If key already exists.
     */
    add(key, value, now) {
        assert(!this._inflights.has(key), `xflight: item ${key} already exist`);
        const timestamp = now ?? Date.now();
        this._inflights.set(key, { start: timestamp, lastXTime: timestamp, value });
        return value;
    }
    /**
     * Get the inflight promise for a key, if any.
     *
     * @param key - Unique identifier for the inflight operation.
     * @returns The inflight promise for the key, or undefined if none exists.
     */
    get(key) {
        return this._inflights.get(key)?.value;
    }
    /**
     * Remove the inflight item for a key.
     *
     * @param key - Unique identifier for the inflight operation.
     * @throws If key does not exist.
     */
    remove(key) {
        assert(this._inflights.has(key), `xflight: removing non-existing item ${key}`);
        this._inflights.delete(key);
    }
    /**
     * Whether there are no inflight items.
     */
    get isEmpty() {
        return this._inflights.size === 0;
    }
    /**
     * The number of inflight items.
     */
    get count() {
        return this._inflights.size;
    }
    /**
     * Get the start time (ms since epoch) for a key.
     *
     * @param key - Unique identifier for the inflight operation.
     * @returns The start time, or undefined if not found.
     */
    getStartTime(key) {
        return this._inflights.get(key)?.start;
    }
    /**
     * Get the elapsed time (ms) since the start for a key.
     *
     * @param key - Unique identifier for the inflight operation.
     * @param now - Optional current timestamp (defaults to Date.now()).
     * @returns The elapsed time in ms, or -1 if not found.
     */
    time(key, now) {
        const item = this._inflights.get(key);
        return item ? (now ?? Date.now()) - item.start : -1;
    }
    /**
     * Alias for {@link time}.
     */
    elapseTime(key, now) {
        return this.time(key, now);
    }
    /**
     * Get the last check time (ms since epoch) for a key.
     *
     * @param key - Unique identifier for the inflight operation.
     * @returns The last check time, or undefined if not found.
     */
    getCheckTime(key) {
        return this._inflights.get(key)?.lastXTime;
    }
    /**
     * Get the elapsed time (ms) since the last check for a key.
     *
     * @param key - Unique identifier for the inflight operation.
     * @param now - Optional current timestamp (defaults to Date.now()).
     * @returns The elapsed time in ms, or -1 if not found.
     */
    lastCheckTime(key, now) {
        const item = this._inflights.get(key);
        return item ? (now ?? Date.now()) - item.lastXTime : -1;
    }
    /**
     * Alias for {@link lastCheckTime}.
     */
    elapseCheckTime(key, now) {
        return this.lastCheckTime(key, now);
    }
    /**
     * Reset the last check time for a key, or for all inflight items if no key is provided.
     *
     * @param key - Optional unique identifier. If omitted, resets all.
     * @param now - Optional timestamp to set as the new last check time (defaults to Date.now()).
     * @returns This instance for chaining.
     */
    resetCheckTime(key, now) {
        const timestamp = now ?? Date.now();
        if (key) {
            const item = this._inflights.get(key);
            if (item) {
                item.lastXTime = timestamp;
            }
        }
        else {
            for (const item of this._inflights.values()) {
                item.lastXTime = timestamp;
            }
        }
        return this;
    }
}
// Default export for backwards compatibility
export default Inflight;
