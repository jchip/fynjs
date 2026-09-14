import { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import {
  isReadableStream,
  isRenderStream,
  RenderContext,
  RenderInterceptError,
  renderStreamError,
} from "../../src/runtime/index.js";

describe("RenderContext", () => {
  it("supports legacy provider maps and mutable execution metadata", () => {
    const provider = { tokens: ["legacy"] };
    const context = new RenderContext({}, { _handlersMap: { legacy: provider } });

    expect(context.getTokenHandler("legacy")).toBe(provider);
    expect(context.getTokenHandler("missing")).toBeUndefined();
    expect(context.getTokens("missing")).toBeUndefined();
    expect(context.stop).toBe(0);
    context.stop = RenderContext.SOFT_STOP;
    expect(context.stop).toBe(RenderContext.SOFT_STOP);
    expect(context.status).toBeUndefined();
    context.status = { phase: "rendering" };
    expect(context.status).toEqual({ phase: "rendering" });
  });

  it("tracks synchronous handler frames even when a handler throws", () => {
    const context = new RenderContext();
    const error = new Error("handler failed");
    expect(() =>
      context._invokeHandler(() => {
        throw error;
      }),
    ).toThrow(error);
    expect(() => context.defer(() => "late")).toThrow(
      "RenderContext.defer must be called synchronously from a token handler",
    );
  });

  it("settles awaited suspensions on fulfillment, rejection, and abort", async () => {
    const context = new RenderContext();
    await expect(context._awaitSuspension(Promise.resolve("done"))).resolves.toBe("done");
    const rejection = new Error("rejected");
    await expect(context._awaitSuspension(Promise.reject(rejection))).rejects.toBe(rejection);

    const controller = new AbortController();
    const aborted = new RenderContext();
    Object.assign(aborted as unknown as { deferredTasks: object }, {
      deferredTasks: { signal: controller.signal },
    });
    const reason = new Error("external abort");
    controller.abort(reason);
    await expect(aborted._awaitSuspension(new Promise(() => undefined))).rejects.toBe(reason);

    const activeController = new AbortController();
    const active = new RenderContext();
    Object.assign(active as unknown as { deferredTasks: object }, {
      deferredTasks: { signal: activeController.signal },
    });
    const waiting = active._awaitSuspension(new Promise(() => undefined));
    activeController.abort(reason);
    await expect(waiting).rejects.toBe(reason);
  });

  it("lets an underlying suspension settle after a full stop", async () => {
    let resolve!: (value: string) => void;
    const context = new RenderContext();
    const waiting = context._awaitSuspension(
      new Promise<string>((settle) => {
        resolve = settle;
      }),
    );
    context.fullStop();
    resolve("settled");
    await expect(waiting).resolves.toBe("settled");
  });

  it("reads token-provider metadata from the renderer contract", () => {
    const provider = { tokens: { TITLE: "title" }, priority: 1 };
    const context = new RenderContext({}, { handlersMap: { head: provider } });

    expect(context.getTokenHandler("head")).toBe(provider);
    expect(context.getTokens("head")).toEqual({ TITLE: "title" });
  });

  it("tracks full, void, and soft stop states", () => {
    const context = new RenderContext();
    context.softStop();
    expect(context.isSoftStop).toBe(true);
    context.fullStop();
    expect(context.isFullStop).toBe(true);
    context.voidStop("replacement");
    expect(context.isVoidStop).toBe(true);
    expect(context.voidResult).toBe("replacement");
  });

  it("turns the first processing error into a void result", () => {
    const context = new RenderContext();
    const first = new Error("first");
    context.handleError(first);
    context.handleError(new Error("second"));
    expect(context.isVoidStop).toBe(true);
    expect(context.voidResult).toBe(first);
  });

  it("preserves an existing stop mode and normalizes non-errors", () => {
    const context = new RenderContext();
    context.softStop();
    context.handleError(null);
    expect(context.isSoftStop).toBe(true);
    expect(context.error).toBeInstanceOf(Error);
    expect(context.voidResult).toBeUndefined();
  });

  it("records typed interception state while unwinding rendering", () => {
    const context = new RenderContext();
    const responseHandler = vi.fn();

    expect(() => context.intercept({ responseHandler })).toThrow(RenderInterceptError);
    expect(context.intercepted).toEqual({ responseHandler });
  });

  it("adds awaited token results and supports callback errors", async () => {
    const context = new RenderContext();
    const callback = vi.fn();
    await context.handleTokenResult("async", Promise.resolve(Buffer.from("ok")), callback);
    await expect(context.output.close()).resolves.toBe("ok");
    expect(callback).toHaveBeenCalledWith();

    const rejected = new Error("rejected");
    const errorCallback = vi.fn();
    await context.handleTokenResult("bad", Promise.reject(rejected), errorCallback);
    expect(errorCallback).toHaveBeenCalledWith(rejected);

    await expect(context.handleTokenResult("bad", Promise.reject(rejected))).rejects.toBe(rejected);
  });

  it("supports send sinks, explicit streams, and output transforms", async () => {
    const send = vi.fn();
    const context = new RenderContext();
    context.setOutputSend(send);
    expect(context.output.acceptsStreams).toBe(false);
    context.setOutputTransform((value, output) => ({ value, output }));
    context.output.add("sent");
    const transformed = (await context.output.close()) as { value: string; output: unknown };
    expect(send).toHaveBeenCalledWith("sent");
    expect(transformed).toEqual({ value: "", output: context.output });

    const streamContext = new RenderContext();
    const munchy = streamContext.setMunchyOutput(null);
    expect(streamContext.setMunchyOutput).toBeTypeOf("function");
    expect(streamContext.munchy).toBe(munchy);

    const explicitContext = new RenderContext();
    expect(explicitContext.setMunchyOutput(munchy)).toBe(munchy);
  });

  it("records output failures once and respects an existing stop", () => {
    const first = new Error("first output error");
    const context = new RenderContext();
    context._handleOutputError(first);
    context._handleOutputError(new Error("ignored"));
    expect(context.isVoidStop).toBe(true);
    expect(context.error).toBe(first);
    expect(context.voidResult).toBe(first);

    const stopped = new RenderContext();
    stopped.softStop();
    stopped._handleOutputError("stream failed");
    expect(stopped.isSoftStop).toBe(true);
    expect(stopped.error).toBe("stream failed");
    expect(stopped.voidResult).toBeUndefined();
  });

  it("aborts with default, textual, and existing error reasons", async () => {
    const defaultAbort = new RenderContext();
    defaultAbort.abort();
    expect(defaultAbort.error).toMatchObject({ name: "AbortError", message: "Rendering aborted" });

    const textualAbort = new RenderContext();
    await textualAbort.closeDeferred();
    textualAbort.softStop();
    textualAbort.abort("cancelled");
    expect(textualAbort.isSoftStop).toBe(true);
    expect(textualAbort.error).toMatchObject({ name: "AbortError", message: "cancelled" });

    const existing = new Error("existing");
    const errorAbort = new RenderContext();
    errorAbort.abort(existing);
    errorAbort.abort(new Error("ignored"));
    expect(errorAbort.error).toBe(existing);
  });

  it("accepts readable and iterable token results in streaming output", async () => {
    const context = new RenderContext();
    context.setMunchyOutput();
    await context.handleTokenResult("stream", Readable.from(["stream"]));
    await context.handleTokenResult(
      "iterable",
      (async function* () {
        yield "-iterable";
      })(),
    );
    await context.handleTokenResult("ignored", false);
    const stream = (await context.output.close()) as AsyncIterable<Uint8Array>;
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString("utf8")).toBe("stream-iterable");
  });

  it("labels anonymous and numeric stream results rejected by buffered output", () => {
    const context = new RenderContext();
    expect(() => context.handleResolvedTokenResult(Readable.from(["x"]))).toThrow(
      "Token handler <anonymous>",
    );
    expect(() => context.handleResolvedTokenResult(Readable.from(["x"]), 42)).toThrow(
      "Token handler 42",
    );
  });

  it("formats stream errors without exposing cwd in development", () => {
    const error = new Error(`${process.cwd()}/template.js failed`);
    expect(renderStreamError(error).result).toContain("CWD/template.js failed");
  });

  it("formats primitive and production stream errors", () => {
    expect(renderStreamError("plain failure", "/").result).toContain("plain failure");

    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const rendered = renderStreamError(new Error("production failure"), "/long/path");
      expect(rendered.result).toContain("production failure");
      expect(rendered.remit).toBe(false);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it("identifies readable, synchronous, and asynchronous render streams", () => {
    expect(isReadableStream(null)).toBe(false);
    expect(isReadableStream("value")).toBe(false);
    expect(isReadableStream({ on() {} })).toBe(false);
    expect(isReadableStream(Readable.from([]))).toBe(true);

    expect(isRenderStream(null)).toBe(false);
    expect(isRenderStream({})).toBe(false);
    expect(isRenderStream(new Uint8Array())).toBe(false);
    expect(isRenderStream(["value"])).toBe(true);
    expect(
      isRenderStream(
        (async function* () {
          yield "value";
        })(),
      ),
    ).toBe(true);
  });
});
