import { Munchy } from "munchy";

import type { OutputSend, RenderTransform, RenderValue } from "./types.js";
import { isRenderStream } from "./utils.js";

type OutputItem = RenderValue | SpotOutput;
const STREAM_BATCH_SIZE = 256;

export interface OutputContext {
  munchy?: Munchy;
  send?: OutputSend;
  transform: RenderTransform;
}

type OutputSink =
  | { readonly mode: "buffer" }
  | { readonly mode: "send"; readonly send: OutputSend }
  | { readonly mode: "stream"; readonly munchy: Munchy };

function valueType(value: unknown): string {
  if (value && typeof value === "object" && "constructor" in value) {
    const constructor = (value as { constructor?: { name?: string } }).constructor;
    return constructor?.name || typeof value;
  }
  return typeof value;
}

function isRenderValue(value: unknown): value is RenderValue {
  return typeof value === "string" || value instanceof Uint8Array || isRenderStream(value);
}

export class BaseOutput {
  protected readonly items: OutputItem[] = [];

  add(value: OutputItem): number {
    const position = this.items.length;
    this.items.push(value);
    return position;
  }

  get length(): number {
    return this.items.length;
  }

  stringify(): string {
    let output = "";

    for (const item of this.items) {
      if (typeof item === "string") {
        output += item;
      } else if (item instanceof Uint8Array) {
        output += Buffer.from(item).toString("utf8");
      } else if (item instanceof SpotOutput) {
        output += item.stringify();
      } else {
        throw new TypeError(`RenderOutput unable to stringify item of type ${valueType(item)}`);
      }
    }

    return output;
  }

  *streamValues(): IterableIterator<RenderValue> {
    for (const item of this.items) {
      if (item instanceof SpotOutput) {
        yield* item.streamValues();
      } else {
        yield item;
      }
    }
  }

  sendToMunchy(munchy: Munchy, done: () => void): void {
    if (this.items.length === 0) {
      process.nextTick(done);
      return;
    }

    const values = this.streamValues();
    const sendBatch = (): void => {
      const batch: RenderValue[] = [];
      let exhausted = false;
      while (batch.length < STREAM_BATCH_SIZE) {
        const next = values.next();
        if (next.done) {
          exhausted = true;
          break;
        }
        batch.push(next.value);
      }

      if (batch.length === 0) {
        done();
        return;
      }

      munchy.once("munched", exhausted ? done : sendBatch);
      munchy.munch(...batch);
    };

    sendBatch();
  }

  markDrained(): void {
    for (const item of this.items) {
      if (item instanceof SpotOutput) item._markDrained();
    }
  }
}

export class MainOutput extends BaseOutput {
  private pending = 0;

  addSpot(spot: SpotOutput): number {
    this.pending += 1;
    return this.add(spot);
  }

  closeSpot(spot: SpotOutput): void {
    if (this.items[spot.position] !== spot) {
      throw new Error("closing unknown pending output spot");
    }
    this.pending -= 1;
  }

  get hasPending(): boolean {
    return this.pending > 0;
  }
}

export class SpotOutput extends BaseOutput {
  private open = true;
  private cancelled = false;
  private drained = false;
  private closeCallback: (() => void) | undefined;
  private drainCallback: (() => void) | undefined;
  position = -1;

  override add(value: RenderValue): number {
    if (!this.open) {
      if (this.cancelled) return -1;
      throw new Error("SpotOutput is closed");
    }
    if (!isRenderValue(value)) {
      throw new TypeError("SpotOutput accepts only strings, buffers, or readable values");
    }
    return super.add(value);
  }

  close(): void {
    if (!this.open) {
      if (this.cancelled) return;
      throw new Error("SpotOutput is already closed");
    }
    this.open = false;
    this.closeCallback?.();
  }

  _cancel(): void {
    if (!this.open) return;
    this.cancelled = true;
    this.open = false;
    this.closeCallback?.();
  }

  onClose(callback: () => void): void {
    this.closeCallback = callback;
  }

  onDrained(callback: () => void): void {
    if (this.drained) {
      callback();
    } else {
      this.drainCallback = callback;
    }
  }

  _markDrained(): void {
    if (this.drained) return;
    this.drained = true;
    this.drainCallback?.();
    this.drainCallback = undefined;
  }
}

const identityTransform: RenderTransform = (result) => result;

export class RenderOutput {
  private output: MainOutput | undefined = new MainOutput();
  private readonly flushQueue: MainOutput[] = [];
  private flushHead = 0;
  private readonly context: OutputContext;
  private sink: OutputSink | undefined;
  private result = "";
  private ended = false;
  private finished = false;
  private checking = false;
  private closePromise: Promise<unknown> | undefined;
  private resolveClose: ((value: unknown) => void) | undefined;
  private rejectClose: ((reason: unknown) => void) | undefined;
  private failure: unknown;
  private hasFailed = false;
  private readonly openSpots = new Set<SpotOutput>();

  constructor(context?: Partial<OutputContext> | null) {
    this.context = (context ?? {}) as OutputContext;
    this.context.transform ??= identityTransform;
  }

  add(value: RenderValue): number {
    if (this.ended || !this.output) throw new Error("RenderOutput is closed");
    if (!isRenderValue(value)) {
      throw new TypeError("RenderOutput accepts only strings, buffers, or readable values");
    }
    return this.output.add(value);
  }

  reserve(): SpotOutput {
    if (this.ended || !this.output) throw new Error("RenderOutput is closed");

    let owner: MainOutput | undefined = this.output;
    const spot = new SpotOutput();
    this.openSpots.add(spot);
    spot.position = owner.addSpot(spot);
    spot.onClose(() => {
      this.openSpots.delete(spot);
      owner?.closeSpot(spot);
      owner = undefined;
      this.checkFlushQueue();
    });
    return spot;
  }

  assertSinkMutable(): void {
    if (this.sink) throw new Error("RenderOutput output mode is already locked");
  }

  get acceptsStreams(): boolean {
    return this.sink?.mode === "stream" || (!this.sink && Boolean(this.context.munchy));
  }

  flush(): void {
    this.freezeSink();
    if (this.output && this.output.length > 0) {
      this.flushQueue.push(this.output);
      this.output = this.ended ? undefined : new MainOutput();
    }
    this.checkFlushQueue();
  }

  close(): Promise<unknown> {
    if (this.closePromise) return this.closePromise;

    this.ended = true;
    const sink = this.freezeSink();
    if (this.hasFailed && sink.mode !== "stream") {
      this.closePromise = Promise.reject(this.failure);
      return this.closePromise;
    }
    if (sink.mode === "stream") {
      this.closePromise = Promise.resolve().then(() => this.context.transform(sink.munchy, this));
    } else {
      this.closePromise = new Promise((resolve, reject) => {
        this.resolveClose = resolve;
        this.rejectClose = reject;
      });
    }

    this.flush();
    return this.closePromise;
  }

  fail(error: unknown): void {
    if (this.hasFailed) return;
    this.hasFailed = true;
    this.failure = error;
    this.ended = true;

    const stream = this.sink?.mode === "stream" ? this.sink.munchy : this.context.munchy;
    if (stream && !stream.destroyed) {
      stream.destroy(error instanceof Error ? error : new Error(String(error)));
    }
    this.rejectClose?.(error);
    for (const spot of [...this.openSpots]) spot._cancel();
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;

    const sink = this.freezeSink();
    if (this.hasFailed) {
      if (sink.mode !== "stream") this.rejectClose?.(this.failure);
      return;
    }
    if (sink.mode === "stream") {
      sink.munchy.munch(null);
      return;
    }

    try {
      this.resolveClose?.(this.context.transform(this.result, this));
    } catch (error) {
      this.rejectClose?.(error);
    }
  }

  private freezeSink(): OutputSink {
    if (!this.sink) {
      this.sink = this.context.munchy
        ? { mode: "stream", munchy: this.context.munchy }
        : this.context.send
          ? { mode: "send", send: this.context.send }
          : { mode: "buffer" };
    }
    return this.sink;
  }

  private compactFlushQueue(): void {
    if (this.flushHead >= 1_024 && this.flushHead * 2 >= this.flushQueue.length) {
      this.flushQueue.splice(0, this.flushHead);
      this.flushHead = 0;
    }
  }

  private checkFlushQueue(): void {
    if (this.checking) return;
    this.checking = true;

    const advance = (): void => {
      try {
        while (this.flushHead < this.flushQueue.length) {
          const segment = this.flushQueue[this.flushHead];
          if (segment.hasPending) {
            this.checking = false;
            return;
          }

          this.flushHead += 1;
          this.compactFlushQueue();
          const sink = this.freezeSink();
          if (sink.mode === "stream") {
            segment.sendToMunchy(sink.munchy, () => {
              segment.markDrained();
              advance();
            });
            return;
          }

          const rendered = segment.stringify();
          if (sink.mode === "send") {
            sink.send(rendered);
          } else {
            this.result += rendered;
          }
          segment.markDrained();
        }

        this.flushQueue.length = 0;
        this.flushHead = 0;
        this.checking = false;
        if (this.ended) this.finish();
      } catch (error) {
        this.checking = false;
        this.rejectClose?.(error);
        if (!this.closePromise) throw error;
      }
    };

    advance();
  }
}
