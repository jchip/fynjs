import { Munchy } from "munchy";

import { RenderOutput } from "./render-output.js";
import type {
  InterceptState,
  OutputSend,
  RenderContextOptions,
  RenderHost,
  RenderTransform,
  TokenProvider,
  TokenRegistry,
} from "./types.js";
import { isReadableStream, munchyHandleStreamError } from "./utils.js";

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

  constructor(options: RenderContextOptions = {}, asyncTemplate: RenderHost = {}) {
    this.options = options;
    this.asyncTemplate = asyncTemplate;
    this.handlersMap =
      asyncTemplate.handlersMap ?? (asyncTemplate._handlersMap as TokenRegistry | undefined) ?? {};
    this.output = new RenderOutput(this);
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
    throw new RenderInterceptError(state);
  }

  fullStop(): void {
    this.stopMode = RenderContext.FULL_STOP;
  }

  get isFullStop(): boolean {
    return this.stopMode === RenderContext.FULL_STOP;
  }

  voidStop(result: unknown = null): void {
    this.stopMode = RenderContext.VOID_STOP;
    this.voidResult = result;
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
    if (!this.stopMode) this.voidStop(error);
  }

  async handleTokenResult(
    id: string | number,
    result: unknown,
    callback?: (error?: unknown) => void,
  ): Promise<void> {
    void id;
    try {
      const resolved = await result;
      if (
        typeof resolved === "string" ||
        resolved instanceof Uint8Array ||
        isReadableStream(resolved)
      ) {
        this.output.add(resolved);
      }
      callback?.();
    } catch (error) {
      if (callback) {
        callback(error);
        return;
      }
      throw error;
    }
  }
}
