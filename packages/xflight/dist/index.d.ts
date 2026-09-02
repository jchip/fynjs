/** Timestamp in milliseconds since epoch */
export type Timestamp = number;
/** Factory function that creates a promise */
export type PromiseFactory<T> = () => Promise<T>;
/** Internal record for tracking an inflight operation */
export interface InflightItem<T> {
    /** When the operation started */
    readonly start: Timestamp;
    /** Last check time for elapsed time tracking */
    lastXTime: Timestamp;
    /** The tracked promise */
    readonly value: Promise<T>;
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
export declare class Inflight<T = unknown> {
    /** Map of inflight items by key */
    private readonly _inflights;
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
     *
     * @param key - Unique identifier for the inflight operation.
     * @param factory - Function that returns a promise.
     * @returns The inflight promise for the key.
     */
    promise(key: string, factory: PromiseFactory<T>): Promise<T>;
    /**
     * Manually add an inflight item for a key.
     *
     * @param key - Unique identifier for the inflight operation.
     * @param value - The promise to track.
     * @param now - Optional timestamp for when the operation started (defaults to now).
     * @returns The promise that was added.
     * @throws If key already exists.
     */
    add(key: string, value: Promise<T>, now?: Timestamp): Promise<T>;
    /**
     * Get the inflight promise for a key, if any.
     *
     * @param key - Unique identifier for the inflight operation.
     * @returns The inflight promise for the key, or undefined if none exists.
     */
    get(key: string): Promise<T> | undefined;
    /**
     * Remove the inflight item for a key.
     *
     * @param key - Unique identifier for the inflight operation.
     * @throws If key does not exist.
     */
    remove(key: string): void;
    /**
     * Whether there are no inflight items.
     */
    get isEmpty(): boolean;
    /**
     * The number of inflight items.
     */
    get count(): number;
    /**
     * Get the start time (ms since epoch) for a key.
     *
     * @param key - Unique identifier for the inflight operation.
     * @returns The start time, or undefined if not found.
     */
    getStartTime(key: string): Timestamp | undefined;
    /**
     * Get the elapsed time (ms) since the start for a key.
     *
     * @param key - Unique identifier for the inflight operation.
     * @param now - Optional current timestamp (defaults to Date.now()).
     * @returns The elapsed time in ms, or -1 if not found.
     */
    time(key: string, now?: Timestamp): number;
    /**
     * Alias for {@link time}.
     */
    elapseTime(key: string, now?: Timestamp): number;
    /**
     * Get the last check time (ms since epoch) for a key.
     *
     * @param key - Unique identifier for the inflight operation.
     * @returns The last check time, or undefined if not found.
     */
    getCheckTime(key: string): Timestamp | undefined;
    /**
     * Get the elapsed time (ms) since the last check for a key.
     *
     * @param key - Unique identifier for the inflight operation.
     * @param now - Optional current timestamp (defaults to Date.now()).
     * @returns The elapsed time in ms, or -1 if not found.
     */
    lastCheckTime(key: string, now?: Timestamp): number;
    /**
     * Alias for {@link lastCheckTime}.
     */
    elapseCheckTime(key: string, now?: Timestamp): number;
    /**
     * Reset the last check time for a key, or for all inflight items if no key is provided.
     *
     * @param key - Optional unique identifier. If omitted, resets all.
     * @param now - Optional timestamp to set as the new last check time (defaults to Date.now()).
     * @returns This instance for chaining.
     */
    resetCheckTime(key?: string, now?: Timestamp): this;
}
export default Inflight;
