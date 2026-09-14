import { Munchy } from "munchy";

import type { OutputSend, RenderTransform, RenderValue } from "./types.js";
import { isReadableStream } from "./utils.js";

type OutputItem = RenderValue | SpotOutput;
const STREAM_BATCH_SIZE = 256;

export interface OutputContext {
  munchy?: Munchy;
  send?: OutputSend;
  transform: RenderTransform;
}

function valueType(value: unknown): string {
  if (value && typeof value === "object" && "constructor" in value) {
    const constructor = (value as { constructor?: { name?: string } }).constructor;
    return constructor?.name || typeof value;
  }
  return typeof value;
}

function isRenderValue(value: unknown): value is RenderValue {
  return (
    typeof value === "string" ||
    value instanceof Uint8Array ||
    isReadableStream(value) ||
    Boolean(
      value &&
      typeof value === "object" &&
      (Symbol.asyncIterator in value || Symbol.iterator in value),
    )
  );
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
  private closeCallback: (() => void) | undefined;
  position = -1;

  override add(value: RenderValue): number {
    if (!this.open) throw new Error("SpotOutput is closed");
    if (!isRenderValue(value)) {
      throw new TypeError("SpotOutput accepts only strings, buffers, or readable values");
    }
    return super.add(value);
  }

  close(): void {
    if (!this.open) throw new Error("SpotOutput is already closed");
    this.open = false;
    this.closeCallback?.();
  }

  onClose(callback: () => void): void {
    this.closeCallback = callback;
  }
}

const identityTransform: RenderTransform = (result) => result;

export class RenderOutput {
  private output: MainOutput | undefined = new MainOutput();
  private readonly flushQueue: MainOutput[] = [];
  private flushHead = 0;
  private readonly context: OutputContext;
  private result = "";
  private ended = false;
  private finished = false;
  private checking = false;
  private closePromise: Promise<unknown> | undefined;
  private resolveClose: ((value: unknown) => void) | undefined;
  private rejectClose: ((reason: unknown) => void) | undefined;

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
    spot.position = owner.addSpot(spot);
    spot.onClose(() => {
      owner?.closeSpot(spot);
      owner = undefined;
      this.checkFlushQueue();
    });
    return spot;
  }

  flush(): void {
    if (this.output && this.output.length > 0) {
      this.flushQueue.push(this.output);
      this.output = this.ended ? undefined : new MainOutput();
    }
    this.checkFlushQueue();
  }

  close(): Promise<unknown> {
    if (this.closePromise) return this.closePromise;

    this.ended = true;
    if (this.context.munchy) {
      this.closePromise = Promise.resolve().then(() =>
        this.context.transform(this.context.munchy as Munchy, this),
      );
    } else {
      this.closePromise = new Promise((resolve, reject) => {
        this.resolveClose = resolve;
        this.rejectClose = reject;
      });
    }

    this.flush();
    return this.closePromise;
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;

    if (this.context.munchy) {
      this.context.munchy.munch(null);
      return;
    }

    try {
      this.resolveClose?.(this.context.transform(this.result, this));
    } catch (error) {
      this.rejectClose?.(error);
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
          if (this.context.munchy) {
            segment.sendToMunchy(this.context.munchy, advance);
            return;
          }

          const rendered = segment.stringify();
          if (this.context.send) {
            this.context.send(rendered);
          } else {
            this.result += rendered;
          }
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
