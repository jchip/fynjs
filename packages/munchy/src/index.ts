import { Readable, type ReadableOptions } from "node:stream";

export type StreamErrorResult = {
  result?: any;
  remit?: boolean;
};

export type MunchyOptions = ReadableOptions & {
  handleStreamError?: (err: any) => StreamErrorResult | void | undefined | null;
};

export type MunchySource =
  | string
  | Uint8Array
  | Readable
  | AsyncIterable<any>
  | Iterable<any>
  | Promise<any>
  | null
  | any;

function isPlainOptions(val: any): val is MunchyOptions {
  return (
    val !== null &&
    typeof val === "object" &&
    !(val instanceof Uint8Array) &&
    typeof val.pipe !== "function" &&
    typeof val[Symbol.asyncIterator] !== "function" &&
    typeof val[Symbol.iterator] !== "function" &&
    typeof val.then !== "function"
  );
}

function isStreamLike(val: any): boolean {
  return (
    val !== null &&
    typeof val === "object" &&
    (typeof val.pipe === "function" ||
      typeof val[Symbol.asyncIterator] === "function" ||
      typeof val.getReader === "function")
  );
}

async function* streamToAsyncIter(stream: any) {
  let done = false;
  let error: any = null;
  const queue: any[] = [];
  let notify: (() => void) | null = null;

  const wakeUp = () => {
    if (notify) {
      const r = notify;
      notify = null;
      r();
    }
  };

  const onData = (chunk: any) => {
    queue.push(chunk);
    wakeUp();
  };
  const onError = (err?: any) => {
    error = err || new Error("munchy - source stream emitted error");
    wakeUp();
  };
  const onEnd = () => {
    done = true;
    wakeUp();
  };

  stream.on("data", onData);
  stream.once("error", onError);
  stream.once("end", onEnd);

  try {
    while (true) {
      while (queue.length > 0) {
        yield queue.shift();
      }
      if (error) {
        throw error;
      }
      if (done) {
        return;
      }
      await new Promise<void>(resolve => {
        notify = resolve;
      });
    }
  } finally {
    stream.removeListener?.("data", onData);
    stream.removeListener?.("error", onError);
    stream.removeListener?.("end", onEnd);
  }
}

export class Munchy extends Readable {
  _sources: MunchySource[];
  _index: number;
  _started: boolean;
  _reading: boolean;
  _canPush: boolean;
  _triggered: boolean;
  _handleStreamError?: (err: any) => StreamErrorResult | void | undefined | null;
  private _running = false;
  private _waitForMore: (() => void) | null = null;
  private _resumePush: (() => void) | null = null;
  private _currentStream: any = null;

  constructor(opts?: MunchyOptions | MunchySource, ...sources: MunchySource[]) {
    let readableOpts: ReadableOptions = {};
    let initialSources: MunchySource[];

    if (isPlainOptions(opts)) {
      readableOpts = opts;
      initialSources = sources;
    } else {
      initialSources = opts !== undefined ? [opts, ...sources] : sources;
    }

    super(readableOpts);

    this._sources = [];
    this._index = 0;
    this._started = false;
    this._reading = false;
    this._canPush = true;
    this._triggered = false;
    this._handleStreamError = (readableOpts as MunchyOptions)?.handleStreamError;

    if (initialSources.length > 0) {
      this.munch(...initialSources);
    }
  }

  _moreSources(): boolean {
    return this._sources.length > this._index;
  }

  _resetSources(sources: MunchySource[] = []): void {
    const x = this._index;
    this._index = 0;
    this._sources = sources;
    if (x > 0) {
      this.emit("munched");
    }
  }

  _triggerRead(): void {
    if (!this._started || this._triggered) return;

    if (this._moreSources() || this._currentStream || this.destroyed) {
      this._triggered = true;
      process.nextTick(() => {
        this._triggered = false;
        this._read();
      });
    }
  }

  munch(...sources: MunchySource[]): this {
    this._sources.push(...sources);
    if (this._waitForMore) {
      const r = this._waitForMore;
      this._waitForMore = null;
      r();
    }
    this._triggerRead();
    return this;
  }

  override destroy(err?: Error): this {
    if (this._sources.length > 0) {
      this._resetSources();
    }
    if (this._waitForMore) {
      const r = this._waitForMore;
      this._waitForMore = null;
      r();
    }
    if (this._resumePush) {
      const r = this._resumePush;
      this._resumePush = null;
      r();
    }
    if (this._currentStream?.destroy) {
      try {
        this._currentStream.destroy();
      } catch {}
    }
    this._currentStream = null;
    return super.destroy(err);
  }

  override _read(): void {
    if (this.destroyed) {
      this.emit("error", new Error("munchy _read called after destroy"));
      return;
    }

    this._started = true;
    this._canPush = true;

    if (this._resumePush) {
      const r = this._resumePush;
      this._resumePush = null;
      r();
    }

    if (!this._running) {
      this._run().catch(err => {
        this.emit("error", err);
        this.destroy();
      });
    }
  }

  private async _run(): Promise<void> {
    this._running = true;
    this._reading = true;

    try {
      while (!this.destroyed) {
        // Wait for sources if queue is empty
        while (this._index >= this._sources.length) {
          if (this._index > 0) {
            this._resetSources([]);
          }
          await new Promise<void>(resolve => {
            this._waitForMore = resolve;
          });
          if (this.destroyed) return;
        }

        const source = this._sources[this._index];
        this._sources[this._index++] = undefined;

        if (source === null) {
          this._index = this._sources.length;
          this.push(null); // End of stream
          this._resetSources([]);
          process.nextTick(() => {
            this.destroy();
          });
          return;
        }

        // 1. Promises
        let resolved = source;
        if (typeof (source as any)?.then === "function") {
          try {
            resolved = await source;
          } catch (err: any) {
            this._handleStreamErr(err);
            continue;
          }
        }

        // 2. Strings and Buffers/Uint8Arrays
        if (typeof resolved === "string" || resolved instanceof Uint8Array) {
          if (!this.push(resolved)) {
            this._canPush = false;
            await new Promise<void>(resolve => {
              this._resumePush = resolve;
            });
          }
          continue;
        }

        // 3. Web ReadableStream
        if (typeof (resolved as any)?.getReader === "function") {
          resolved = Readable.fromWeb(resolved as any);
        }

        // 4. Stream or AsyncIterable
        if (isStreamLike(resolved)) {
          const stream: any = resolved;
          this._currentStream = stream;
          this.emit("draining", { stream });

          const iter = typeof stream.pipe === "function" ? streamToAsyncIter(stream) : stream;

          try {
            for await (const chunk of iter) {
              if (!this.push(chunk)) {
                this._canPush = false;
                await new Promise<void>(resolve => {
                  this._resumePush = resolve;
                });
              }
            }
            const drainedStream = this._currentStream;
            this._currentStream = null;
            this.emit("drained", { stream: drainedStream });
          } catch (err: any) {
            this._currentStream = null;
            const shouldContinue = this._handleStreamErr(err);
            if (!shouldContinue) return;
          }
          continue;
        }

        // 5. Sync Iterable
        if (resolved && typeof (resolved as any)[Symbol.iterator] === "function") {
          for (const item of resolved as Iterable<any>) {
            if (!this.push(item)) {
              this._canPush = false;
              await new Promise<void>(resolve => {
                this._resumePush = resolve;
              });
            }
          }
          continue;
        }

        // Fallback: push item directly
        if (!this.push(resolved)) {
          this._canPush = false;
          await new Promise<void>(resolve => {
            this._resumePush = resolve;
          });
        }
      }
    } finally {
      this._reading = false;
      this._running = false;
    }
  }

  private _handleStreamErr(err: any): boolean {
    const streamErr = err || new Error("munchy - source stream emitted error");
    if (this._handleStreamError) {
      const errorOutput = this._handleStreamError(streamErr) || {};
      if (errorOutput.result) {
        if (!this.push(errorOutput.result)) {
          this._canPush = false;
        }
      }
      if (errorOutput.remit !== false) {
        this.emit("error", streamErr);
        this.destroy();
        return false;
      }
      return true;
    } else {
      this.emit("error", streamErr);
      this.destroy();
      return false;
    }
  }
}

export default Munchy;
