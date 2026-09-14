import type { RenderContext } from "./render-context.js";
import type { RenderOutput } from "./render-output.js";

export type RenderChunk = string | Uint8Array;

export type RenderStream =
  NodeJS.ReadableStream | AsyncIterable<RenderChunk> | Iterable<RenderChunk>;

/** A value accepted by RenderOutput. RenderStream values require streaming output. */
export type RenderValue = RenderChunk | RenderStream;

export type RenderTransform<Result = unknown> = (
  result: string | NodeJS.ReadableStream,
  output: RenderOutput,
) => Result | Promise<Result>;

export type OutputSend = (output: string) => void;

export type TokenHandler = (context: RenderContext, token?: unknown) => unknown;

export interface TokenProvider {
  tokens?: unknown;
  [key: string]: unknown;
}

export type TokenRegistry = Record<string, TokenProvider>;

export interface RenderHost {
  handlersMap?: TokenRegistry;
  _handlersMap?: Record<PropertyKey, unknown>;
}

export interface RenderContextOptions {
  [key: string]: unknown;
}

export interface InterceptState<Response = unknown> {
  responseHandler: (response: Response) => unknown;
}

export type TokenModuleProcess = (context: RenderContext, token?: unknown) => unknown;

export interface TokenModuleInstance {
  process: TokenModuleProcess;
}

export type TokenModuleFactory = (
  options?: unknown,
  token?: unknown,
) => TokenModuleInstance | null | Promise<TokenModuleInstance | null>;

export interface TokenModuleNamespace {
  default?: TokenModuleFactory;
  tokenHandler?: TokenModuleFactory;
  [name: string]: unknown;
}

export type TokenModuleLoader = TokenModuleFactory | TokenModuleNamespace;

export type TokenModuleId = string | TokenModuleFactory;

export type TokenRegistration = TokenProvider;

export interface TokenProperties {
  _call?: string | readonly [name: string, args?: readonly unknown[]];
  [key: PropertyKey]: unknown;
}
