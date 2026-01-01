import assert from "node:assert";

export interface InflightItem<T> {
    start: number;
    lastXTime: number;
    value: Promise<T>;
}

/**
 * Inflight manages deduplication of asynchronous operations by key.
 * It ensures only one promise per key is active at a time, returning the same promise for concurrent requests.
 * Useful for avoiding duplicate network or resource-intensive calls.
 *
 * @template T The type of the resolved value of the managed promises.
 */
export default class Inflight<T = any> {
    /** Number of inflight items. */
    private _count: number = 0;
    /** Map of inflight items by key. */
    private _inflights: Record<string, InflightItem<T> | undefined> = {};
    /** The Promise implementation used by this instance. */
    public Promise: PromiseConstructor;

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
     * @param xPromise Optional custom Promise implementation to use.
     */
    constructor(xPromise?: PromiseConstructor) {
        this.Promise = xPromise || globalThis.Promise;
    }

    /**
     * Get or create a promise for a given key.
     * If a promise for the key is already inflight, returns it.
     * Otherwise, calls the provided factory to create a new promise, tracks it, and returns it.
     * @param key Unique identifier for the inflight operation.
     * @param promiseFactory Function that returns a promise.
     * @returns The inflight promise for the key.
     */
    promise(key: string, promiseFactory: () => Promise<T>): Promise<T> {
        const f = this._inflights[key];
        if (f) {
            return f.value;
        }

        const remove = () => this.remove(key);

        try {
            const p = promiseFactory();
            assert(p && typeof (p as any).then === "function", `xflight: promiseFactory for key ${key} didn't return a promise`);
            this.add(key, p).then(remove, remove);
            return p;
        } catch (err: any) {
            return this.Promise.reject(err);
        }
    }

    /**
     * Manually add an inflight item for a key.
     * @param key Unique identifier for the inflight operation.
     * @param value The promise to track.
     * @param now Optional timestamp for when the operation started (defaults to now).
     * @returns The promise that was added.
     */
    add(key: string, value: Promise<T>, now?: number): Promise<T> {
        assert(this._inflights[key] === undefined, `xflight: item ${key} already exist`);
        this._count++;
        now = now || Date.now();
        this._inflights[key] = { start: now, lastXTime: now, value };
        return value;
    }

    /**
     * Get the inflight promise for a key, if any.
     * @param key Unique identifier for the inflight operation.
     * @returns The inflight promise for the key, or undefined if none exists.
     */
    get(key: string): Promise<T> | undefined {
        const x = this._inflights[key];
        return x && (x.value as any);
    }

    /**
     * Remove the inflight item for a key.
     * @param key Unique identifier for the inflight operation.
     */
    remove(key: string): void {
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

    /**
     * Whether there are no inflight items.
     */
    get isEmpty(): boolean {
        return this._count === 0;
    }

    /**
     * The number of inflight items.
     */
    get count(): number {
        return this._count;
    }

    /**
     * Get the start time (ms since epoch) for a key.
     * @param key Unique identifier for the inflight operation.
     * @returns The start time, or undefined if not found.
     */
    getStartTime(key: string): number | undefined {
        const x = this._inflights[key];
        return x && x.start;
    }

    /**
     * Get the elapsed time (ms) since the start for a key.
     * @param key Unique identifier for the inflight operation.
     * @param now Optional current timestamp (defaults to now).
     * @returns The elapsed time in ms, or -1 if not found.
     */
    time(key: string, now?: number): number {
        const x = this._inflights[key];
        if (x) {
            return (now || Date.now()) - x.start;
        }
        return -1;
    }

    /**
     * Alias for time().
     * @param key Unique identifier for the inflight operation.
     * @param now Optional current timestamp (defaults to now).
     * @returns The elapsed time in ms, or -1 if not found.
     */
    elapseTime(key: string, now?: number): number {
        return this.time(key, now);
    }

    /**
     * Get the last check time (ms since epoch) for a key.
     * @param key Unique identifier for the inflight operation.
     * @returns The last check time, or undefined if not found.
     */
    getCheckTime(key: string): number | undefined {
        const x = this._inflights[key];
        return x && x.lastXTime;
    }

    /**
     * Get the elapsed time (ms) since the last check for a key.
     * @param key Unique identifier for the inflight operation.
     * @param now Optional current timestamp (defaults to now).
     * @returns The elapsed time in ms, or -1 if not found.
     */
    lastCheckTime(key: string, now?: number): number {
        const x = this._inflights[key];
        if (x) {
            const t = (now || Date.now()) - x.lastXTime;
            return t;
        }
        return -1;
    }

    /**
     * Alias for lastCheckTime().
     * @param key Unique identifier for the inflight operation.
     * @param now Optional current timestamp (defaults to now).
     * @returns The elapsed time in ms, or -1 if not found.
     */
    elapseCheckTime(key: string, now?: number): number {
        return this.lastCheckTime(key, now);
    }

    /**
     * Reset the last check time for a key, or for all inflight items if no key is provided.
     * @param key Optional unique identifier for the inflight operation. If omitted, resets all.
     * @param now Optional timestamp to set as the new last check time (defaults to now).
     * @returns This instance for chaining.
     */
    resetCheckTime(key?: string, now?: number): this {
        if (key) {
            const x = this._inflights[key];
            if (x) {
                x.lastXTime = now || Date.now();
            }
        } else {
            // If no key is provided, reset all
            Object.values(this._inflights).forEach(x => {
                if (x) {
                    x.lastXTime = now || Date.now();
                }
            });
        }
        return this;
    }
}

