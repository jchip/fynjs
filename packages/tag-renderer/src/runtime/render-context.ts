import { Munchy } from "munchy";

import { RenderOutput } from "./render-output.js";
import { DeferredTaskGroup } from "./deferred-task-group.js";
import { normalizeRenderFailure } from "./render-error.js";
import type {
  DeferredRenderWork,
  InterceptState,
  OutputSend,
  RenderContextOptions,
  RenderHost,
  RenderTransform,
  TokenProvider,
  TokenRegistry,
} from "./types.js";
import { isRenderStream, munchyHandleStreamError } from "./utils.js";

export class RenderInterceptError<Response = unknown> extends Error {
  constructor(readonly state: InterceptState<Response>) {
    super("@fynjs/tag-renderer: rendering intercepted");
    this.name = "RenderInterceptError";
  }
}

export class RenderContext {
  static readonly SOFT_STOP = 1;
  static readonly FULL_STOP = 2;
  static readonly VOID_STOP = 3;

  user: unknown = false;
  readonly options: RenderContextOptions;
  readonly asyncTemplate: RenderHost;
  readonly output: RenderOutput;
  result: unknown;
  error: unknown;
  voidResult: unknown;
  send?: OutputSend;
  munchy?: Munchy;

  private readonly handlersMap: TokenRegistry;
  private stopMode = 0;
  private renderStatus: unknown;
  private interception?: InterceptState;
  private outputTransform: RenderTransform = (result) => result;
  private readonly deferredTasks: DeferredTaskGroup;
  private deferFrameDepth = 0;

  get signal(): AbortSignal {
    return this.deferredTasks.signal;
  }

  constructor(
    options: RenderContextOptions = {},
    asyncTemplate: RenderHost = {},
    deferConcurrency = 8,
  ) {
    this.options = options;
    this.asyncTemplate = asyncTemplate;
    this.handlersMap =
      asyncTemplate.handlersMap ?? (asyncTemplate._handlersMap as TokenRegistry | undefined) ?? {};
    this.output = new RenderOutput(this);
    this.deferredTasks = new DeferredTaskGroup(
      this.output,
      deferConcurrency,
      options.signal,
      (error) => this.recordDeferredError(error),
    );
  }

  defer(work: DeferredRenderWork): void {
    if (!this.deferredTasks.acceptsWork) return this.deferredTasks.defer(work);
    if (this.deferFrameDepth === 0) {
      throw new Error("RenderContext.defer must be called synchronously from a token handler");
    }
    this.deferredTasks.defer(work);
  }

  _invokeHandler<Value>(handler: () => Value): Value {
    this.deferFrameDepth += 1;
    try {
      return handler();
    } finally {
      this.deferFrameDepth -= 1;
    }
  }

  _awaitSuspension<Value>(pending: PromiseLike<Value>): Promise<Value> {
    const promise = Promise.resolve(pending);
    if (this.signal.aborted && !this.isFullStop && !this.isVoidStop) {
      return Promise.reject(this.signal.reason);
    }

    return new Promise<Value>((resolve, reject) => {
      const onAbort = (): void => {
        if (this.isFullStop || this.isVoidStop) return;
        cleanup();
        reject(this.signal.reason);
      };
      const cleanup = (): void => this.signal.removeEventListener("abort", onAbort);
      this.signal.addEventListener("abort", onAbort, { once: true });
      promise.then(
        (value) => {
          cleanup();
          resolve(value);
        },
        (error) => {
          cleanup();
          reject(error);
        },
      );
    });
  }

  closeDeferred(): Promise<void> {
    return this.deferredTasks.close();
  }

  abort(reason?: unknown): void {
    const error =
      reason instanceof Error ? reason : new Error(reason ? String(reason) : "Rendering aborted");
    if (!(reason instanceof Error)) error.name = "AbortError";
    this.deferredTasks.fail(error);
    if (this.error !== undefined) return;
    if (!this.stopMode) {
      this.stopMode = RenderContext.VOID_STOP;
      this.voidResult = error;
    }
    this.error = error;
    this.output.fail(error);
  }

  _handleOutputError(error: unknown): void {
    error = normalizeRenderFailure(error);
    if (this.error !== undefined) return;
    if (!this.stopMode) {
      this.stopMode = RenderContext.VOID_STOP;
      this.voidResult = error;
    }
    this.error = error;
    this.output.fail(error, false);
    this.deferredTasks.fail(error);
  }

  getTokenHandler(name: string): TokenProvider | undefined {
    return this.handlersMap[name];
  }

  getTokens(name: string): unknown {
    return this.handlersMap[name]?.tokens;
  }

  setOutputSend(send: OutputSend): void {
    this.output.assertSinkMutable();
    this.send = send;
  }

  setMunchyOutput(munchy?: Munchy | null): Munchy {
    this.output.assertSinkMutable();
    this.munchy = munchy ?? new Munchy({ handleStreamError: munchyHandleStreamError });
    return this.munchy;
  }

  setOutputTransform<Result>(transform: RenderTransform<Result>): void {
    this.outputTransform = transform;
  }

  transform(result: string | NodeJS.ReadableStream, output: RenderOutput): unknown {
    return this.outputTransform(result, output);
  }

  get stop(): number {
    return this.stopMode;
  }

  set stop(mode: number) {
    this.stopMode = mode;
  }

  get status(): unknown {
    return this.renderStatus;
  }

  set status(status: unknown) {
    this.renderStatus = status;
  }

  get intercepted(): InterceptState | undefined {
    return this.interception;
  }

  intercept<Response>(state: InterceptState<Response>): never {
    this.interception = state as InterceptState;
    const error = new RenderInterceptError(state);
    this.deferredTasks.cancel(error);
    throw error;
  }

  fullStop(): void {
    this.stopMode = RenderContext.FULL_STOP;
    this.deferredTasks.cancel("full stop");
  }

  get isFullStop(): boolean {
    return this.stopMode === RenderContext.FULL_STOP;
  }

  voidStop(result: unknown = null): void {
    this.stopMode = RenderContext.VOID_STOP;
    this.voidResult = result;
    this.deferredTasks.cancel("void stop");
  }

  get isVoidStop(): boolean {
    return this.stopMode === RenderContext.VOID_STOP;
  }

  softStop(): void {
    this.stopMode = RenderContext.SOFT_STOP;
  }

  get isSoftStop(): boolean {
    return this.stopMode === RenderContext.SOFT_STOP;
  }

  handleError(error: unknown): void {
    error = normalizeRenderFailure(error);
    if (!this.stopMode) {
      this.stopMode = RenderContext.VOID_STOP;
      this.voidResult = error;
    }
    this.error ??= error;
    this.deferredTasks.fail(error);
    this.output.fail(error);
  }

  private recordDeferredError(error: unknown): void {
    error = normalizeRenderFailure(error);
    if (!this.stopMode) {
      this.stopMode = RenderContext.VOID_STOP;
      this.voidResult = error;
    }
    this.error ??= error;
    this.output.fail(error);
  }

  async handleTokenResult(
    id: string | number,
    result: unknown,
    callback?: (error?: unknown) => void,
  ): Promise<void> {
    void id;
    try {
      const resolved = await result;
      this.handleResolvedTokenResult(resolved, id);
      callback?.();
    } catch (error) {
      if (callback) {
        callback(error);
        return;
      }
      throw error;
    }
  }

  handleResolvedTokenResult(result: unknown, id: string | number = ""): void {
    if (isRenderStream(result) && !this.output.acceptsStreams) {
      const label = id === "" ? "<anonymous>" : String(id);
      throw new TypeError(
        `Token handler ${label} returned a readable or iterable value in buffered output; call context.setMunchyOutput() before returning it`,
      );
    }
    if (typeof result === "string" || result instanceof Uint8Array || isRenderStream(result)) {
      this.output.add(result);
    }
  }
}
