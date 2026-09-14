import type { RenderOutput, SpotOutput } from "./render-output.js";
import type { DeferredRenderWork, DeferredRenderValue } from "./types.js";
import { isReadableStream } from "./utils.js";

type TaskState = "queued" | "running" | "fulfilled" | "committed" | "drained" | "cancelled";
type GroupState = "open" | "closing" | "closed" | "failing";

interface DeferredTask {
  spot?: SpotOutput;
  work?: DeferredRenderWork;
  state: TaskState;
  value?: DeferredRenderValue;
}

const abortError = (reason?: unknown): Error => {
  if (reason instanceof Error) return reason;
  const error = new Error(reason === undefined ? "Rendering aborted" : String(reason));
  error.name = "AbortError";
  return error;
};

const disposeValue = (value: DeferredRenderValue): void => {
  if (!value || typeof value !== "object") return;
  const readable = value as NodeJS.ReadableStream & { destroy?: () => void };
  if (isReadableStream(value) && typeof readable.destroy === "function") {
    try {
      readable.destroy();
    } catch {}
    return;
  }
  const iterable = value as {
    [Symbol.asyncIterator]?: () => { return?: () => unknown };
    [Symbol.iterator]?: () => { return?: () => unknown };
    return?: () => unknown;
  };
  let iterator = iterable;
  try {
    iterator = iterable[Symbol.asyncIterator]?.() ?? iterable[Symbol.iterator]?.() ?? iterable;
  } catch {
    return;
  }
  if (typeof iterator.return === "function") {
    try {
      const returned = iterator.return();
      if (returned && typeof (returned as PromiseLike<unknown>).then === "function") {
        void Promise.resolve(returned).catch(() => undefined);
      }
    } catch {}
  }
};

export class DeferredTaskGroup {
  readonly signal: AbortSignal;

  private readonly controller = new AbortController();
  private readonly tasks: DeferredTask[] = [];
  private nextToStart = 0;
  private nextToRetire = 0;
  private state: GroupState = "open";
  private pumping = false;
  private pumpAgain = false;
  private readonly completed: Promise<void>;
  private resolveCompleted!: () => void;
  private rejectCompleted!: (error: unknown) => void;
  private readonly externalSignal?: AbortSignal;
  private readonly externalAbort: () => void;

  constructor(
    private readonly output: RenderOutput,
    private readonly limit: number,
    externalSignal: AbortSignal | undefined,
    private readonly onError: (error: unknown) => void,
  ) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new TypeError("DeferredTaskGroup limit must be a positive integer");
    }
    this.signal = this.controller.signal;
    this.completed = new Promise<void>((resolve, reject) => {
      this.resolveCompleted = resolve;
      this.rejectCompleted = reject;
    });
    void this.completed.catch(() => undefined);

    this.externalSignal = externalSignal;
    this.externalAbort = () => this.fail(abortError(externalSignal?.reason));
    if (externalSignal?.aborted) {
      queueMicrotask(this.externalAbort);
    } else {
      externalSignal?.addEventListener("abort", this.externalAbort, { once: true });
    }
  }

  get acceptsWork(): boolean {
    return this.state === "open";
  }

  defer(work: DeferredRenderWork): void {
    if (typeof work !== "function") {
      throw new TypeError("RenderContext.defer requires a work function");
    }
    if (!this.acceptsWork) throw new Error("RenderContext.defer called after rendering closed");

    this.output.flush();
    const spot = this.output.reserve();
    this.output.flush();
    this.tasks.push({ spot, work, state: "queued" });
    this.pump();
  }

  close(): Promise<void> {
    if (this.state === "open") this.state = "closing";
    this.pump();
    return this.completed;
  }

  cancel(reason?: unknown): void {
    if (this.state === "closed" || this.state === "failing") return;
    this.controller.abort(reason);
    this.cancelRemaining();
    this.state = "closed";
    this.tasks.length = 0;
    this.dispose();
    this.resolveCompleted();
  }

  fail(error: unknown): void {
    if (this.state === "closed" || this.state === "failing") return;
    this.state = "failing";
    this.onError(error);
    this.controller.abort(error);
    this.cancelRemaining();
    this.tasks.length = 0;
    this.dispose();
    this.rejectCompleted(error);
  }

  private pump(): void {
    if (this.pumping) {
      this.pumpAgain = true;
      return;
    }
    if (this.state === "closed" || this.state === "failing") return;

    this.pumping = true;
    try {
      do {
        this.pumpAgain = false;
        this.retireAndCommitReadyTasks();
        this.startTasks();
        this.finishIfComplete();
      } while (this.pumpAgain && !this.isTerminal());
    } finally {
      this.pumping = false;
    }
  }

  private startTasks(): void {
    while (
      this.state !== "closed" &&
      this.state !== "failing" &&
      this.nextToStart - this.nextToRetire < this.limit &&
      this.nextToStart < this.tasks.length
    ) {
      const task = this.tasks[this.nextToStart++];
      task.state = "running";
      Promise.resolve()
        .then(() => (task.state === "running" ? task.work?.(this.signal) : undefined))
        .then(
          (value) => this.fulfill(task, value),
          (error) => this.fail(error),
        );
    }
  }

  private fulfill(task: DeferredTask, value: DeferredRenderValue): void {
    if (task.state !== "running" || this.state === "closed" || this.state === "failing") {
      disposeValue(value);
      return;
    }
    task.value = value;
    task.state = "fulfilled";
    this.pump();
  }

  private retireAndCommitReadyTasks(): void {
    while (this.nextToRetire < this.tasks.length) {
      const task = this.tasks[this.nextToRetire];
      if (task.state === "drained") {
        this.releaseTask(task);
        this.nextToRetire += 1;
        continue;
      }
      if (task.state !== "fulfilled") return;
      this.commitTask(task);
      if (!this.isDrained(task)) return;
    }
  }

  private commitTask(task: DeferredTask): void {
    const spot = task.spot;
    if (!spot) return this.fail(new Error("Deferred output spot is unavailable"));
    task.state = "committed";
    spot.onDrained(() => {
      if (task.state !== "committed") return;
      task.state = "drained";
      this.pump();
    });

    let failed = false;
    let failure: unknown;
    try {
      if (task.value !== null && task.value !== undefined) spot.add(task.value);
    } catch (error) {
      failed = true;
      failure = error;
    } finally {
      try {
        spot.close();
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    }
    if (failed) this.fail(failure);
  }

  private releaseTask(task: DeferredTask): void {
    task.spot = undefined;
    task.work = undefined;
    task.value = undefined;
  }

  private isDrained(task: DeferredTask): boolean {
    return task.state === "drained";
  }

  private isTerminal(): boolean {
    return this.state === "closed" || this.state === "failing";
  }

  private cancelRemaining(): void {
    for (let index = this.nextToRetire; index < this.tasks.length; index++) {
      const task = this.tasks[index];
      task.state = "cancelled";
      disposeValue(task.value);
      task.spot?._cancel();
      this.releaseTask(task);
    }
    this.nextToRetire = this.tasks.length;
    this.nextToStart = this.tasks.length;
  }

  private finishIfComplete(): void {
    if (this.state !== "closing" || this.nextToRetire !== this.tasks.length) return;
    this.state = "closed";
    this.tasks.length = 0;
    this.dispose();
    this.resolveCompleted();
  }

  private dispose(): void {
    this.externalSignal?.removeEventListener("abort", this.externalAbort);
  }
}
