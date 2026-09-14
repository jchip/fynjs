import type { RenderStream } from "./types.js";

const MIN_CWD_LENGTH = 3;

export interface StreamErrorResult {
  result: string;
  remit: false;
}

export function renderStreamError(error: unknown, cwd = process.cwd()): StreamErrorResult {
  const normalized = error instanceof Error ? error : new Error(String(error));
  let message =
    process.env.NODE_ENV !== "production" && normalized.stack
      ? normalized.stack
      : normalized.message;

  if (cwd.length > MIN_CWD_LENGTH) {
    message = message.replaceAll(cwd, "CWD");
  }

  return {
    result: `<!-- SSR ERROR -->\n<p><h2 style="color: red">SSR ERROR</h2><pre style="color: red">\n${message}\n</pre></p>`,
    remit: false,
  };
}

export const munchyHandleStreamError = renderStreamError;

export function isReadableStream(value: unknown): value is NodeJS.ReadableStream {
  if (!value || typeof value !== "object") return false;

  const stream = value as Partial<NodeJS.ReadableStream>;
  return typeof stream.on === "function" && typeof stream.pipe === "function";
}

export function isRenderStream(value: unknown): value is RenderStream {
  if (!value || typeof value !== "object" || value instanceof Uint8Array) return false;
  return isReadableStream(value) || Symbol.asyncIterator in value || Symbol.iterator in value;
}
