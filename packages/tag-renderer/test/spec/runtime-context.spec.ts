import { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import { RenderContext, RenderInterceptError, renderStreamError } from "../../src/runtime/index.js";

describe("RenderContext", () => {
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

  it("formats stream errors without exposing cwd in development", () => {
    const error = new Error(`${process.cwd()}/template.js failed`);
    expect(renderStreamError(error).result).toContain("CWD/template.js failed");
  });
});
