import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { describe, expect, it, vi } from "vitest";

import {
  BaseOutput,
  MainOutput,
  RenderContext,
  RenderOutput,
  SpotOutput,
} from "../../src/runtime/index.js";

async function streamText(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<string | Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

describe("RenderOutput buffered output", () => {
  it("supports empty output and low-level output lifecycle branches", async () => {
    const output = new RenderOutput(null);
    await expect(output.close()).resolves.toBe("");
    output.flush();

    const spot = new SpotOutput();
    expect(() => spot.add({} as never)).toThrow(
      "SpotOutput accepts only strings, buffers, or readable values",
    );
    spot.add("value");
    spot.close();
    expect(() => spot.add("late")).toThrow("SpotOutput is closed");
    expect(() => spot.close()).toThrow("SpotOutput is already closed");

    const cancelled = new SpotOutput();
    cancelled._cancel();
    expect(cancelled.add("ignored")).toBe(-1);
    expect(() => cancelled.close()).not.toThrow();
    expect(() => cancelled._cancel()).not.toThrow();

    const drained = vi.fn();
    spot._markDrained();
    spot._markDrained();
    spot.onDrained(drained);
    expect(drained).toHaveBeenCalledOnce();

    const main = new MainOutput();
    const pending = new SpotOutput();
    main.addSpot(pending);
    pending.position = 1;
    expect(() => main.closeSpot(pending)).toThrow("closing unknown pending output spot");
  });

  it("describes unsupported low-level values without assuming a constructor", () => {
    const primitive = new BaseOutput();
    primitive.add(null as never);
    expect(() => primitive.stringify()).toThrow("item of type object");

    const unnamed = new BaseOutput();
    unnamed.add({ constructor: {} } as never);
    expect(() => unnamed.stringify()).toThrow("item of type object");

    const constructorless = new BaseOutput();
    constructorless.add(Object.create(null) as never);
    expect(() => constructorless.stringify()).toThrow("item of type object");
  });

  it("keeps reserved output in document order", async () => {
    const output = new RenderOutput();
    output.add("before-");
    const first = output.reserve();
    output.add("-middle-");
    const second = output.reserve();
    output.add("-after");

    const result = output.close();
    second.add("second");
    second.close();
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    first.add("first");
    first.close();
    await expect(result).resolves.toBe("before-first-middle-second-after");
  });

  it("supports buffers and Uint8Arrays in buffered output", async () => {
    const output = new RenderOutput();
    output.add(Buffer.from("buffer"));
    output.add(new Uint8Array(Buffer.from("-bytes")));

    await expect(output.close()).resolves.toBe("buffer-bytes");
  });

  it("flushes complete segments and waits for pending segments", () => {
    const send = vi.fn();
    const output = new RenderOutput({ send });
    output.add("first");
    output.flush();
    expect(send).toHaveBeenCalledWith("first");

    output.add("before-");
    const spot = output.reserve();
    output.add("-after");
    output.flush();
    expect(send).toHaveBeenCalledTimes(1);
    spot.add("reserved");
    spot.close();
    expect(send).toHaveBeenLastCalledWith("before-reserved-after");
  });

  it("drains many queued segments iteratively after a reserved spot closes", async () => {
    const output = new RenderOutput();
    const spot = output.reserve();
    output.flush();

    for (let index = 0; index < 20_000; index += 1) {
      output.add("x");
      output.flush();
    }

    const result = output.close();
    spot.close();
    await expect(result).resolves.toBe("x".repeat(20_000));
  });

  it("applies a final asynchronous transform", async () => {
    const output = new RenderOutput({
      transform: async (value) => `[${value}]`,
    });
    output.add("content");
    await expect(output.close()).resolves.toBe("[content]");
  });

  it("rejects when the buffered transform throws", async () => {
    const error = new Error("transform failed");
    const output = new RenderOutput({
      transform: () => {
        throw error;
      },
    });
    output.add("content");
    await expect(output.close()).rejects.toBe(error);
  });

  it("makes close idempotent and rejects writes after close", async () => {
    const output = new RenderOutput();
    output.add("done");
    const firstClose = output.close();
    expect(output.close()).toBe(firstClose);
    expect(() => output.add("late")).toThrow("RenderOutput is closed");
    expect(() => output.reserve()).toThrow("RenderOutput is closed");
    await expect(firstClose).resolves.toBe("done");
  });

  it("fails with a pending spot and ignores its late callback", async () => {
    const error = new Error("output failed");
    const output = new RenderOutput();
    const spot = output.reserve();
    const closing = output.close();

    output.fail(error);

    await expect(closing).rejects.toBe(error);
    expect(() => {
      spot.add("late");
      spot.close();
    }).not.toThrow();
    await expect(output.close()).rejects.toBe(error);

    const failedBeforeClose = new RenderOutput();
    const lateSpot = failedBeforeClose.reserve();
    failedBeforeClose.fail(error);
    await expect(failedBeforeClose.close()).rejects.toBe(error);
    expect(() => lateSpot.close()).not.toThrow();
  });

  it("locks buffered output on the first flush", async () => {
    const context = new RenderContext();
    context.output.add("before-");
    context.output.flush();

    expect(() => context.setMunchyOutput()).toThrow("RenderOutput output mode is already locked");
    context.output.add("after");
    await expect(context.output.close()).resolves.toBe("before-after");
  });

  it("keeps a waiting close on its locked buffered output", async () => {
    const context = new RenderContext();
    const spot = context.output.reserve();
    const result = context.output.close();

    expect(() => context.setMunchyOutput()).toThrow("RenderOutput output mode is already locked");
    spot.add("done");
    spot.close();
    await expect(result).resolves.toBe("done");
  });

  it("rejects a readable value in buffered mode when closing", async () => {
    const output = new RenderOutput();
    output.add(Readable.from(["stream"]));
    await expect(output.close()).rejects.toThrow(
      "RenderOutput unable to stringify item of type Readable",
    );
  });

  it("rejects unsupported values at the output boundary", () => {
    const output = new RenderOutput();
    expect(() => output.add({} as never)).toThrow(
      "RenderOutput accepts only strings, buffers, or readable values",
    );
  });

  it("propagates a synchronous send failure before close", () => {
    const error = new Error("send failed");
    const output = new RenderOutput({
      send: () => {
        throw error;
      },
    });
    output.add("content");
    expect(() => output.flush()).toThrow(error);
  });

  it("does not re-enter flushing from a send callback", async () => {
    const sent: string[] = [];
    let output: RenderOutput;
    output = new RenderOutput({
      send: (value) => {
        sent.push(value);
        output.flush();
      },
    });
    output.add("content");
    await expect(output.close()).resolves.toBe("");
    expect(sent).toEqual(["content"]);
  });

  it("preserves a failure triggered by a send callback", async () => {
    const error = new Error("failed while sending");
    let output: RenderOutput;
    output = new RenderOutput({
      send: () => output.fail(error),
    });
    output.add("content");
    await expect(output.close()).rejects.toBe(error);
    expect(() => output.fail(new Error("ignored"))).not.toThrow();
    expect(() => output.flush()).not.toThrow();
  });
});

describe("RenderOutput streaming", () => {
  it("streams mixed values and reserved spots in order", async () => {
    const context = new RenderContext();
    context.setMunchyOutput();
    context.output.add("before-");
    const spot = context.output.reserve();
    context.output.add(Readable.from(["-stream-"]));
    context.output.add(Buffer.from("after"));
    const stream = (await context.output.close()) as NodeJS.ReadableStream;

    spot.add("reserved");
    spot.close();
    await expect(streamText(stream)).resolves.toBe("before-reserved-stream-after");
  });

  it("uses the stream error result and continues", async () => {
    const context = new RenderContext();
    context.setMunchyOutput();
    context.output.add(
      Readable.from(
        (async function* () {
          yield "before";
          throw new Error("stream exploded");
        })(),
      ),
    );
    context.output.add("after");

    const stream = (await context.output.close()) as NodeJS.ReadableStream;
    const rendered = await streamText(stream);
    expect(rendered).toContain("before");
    expect(rendered).toContain("SSR ERROR");
    expect(rendered).toContain("stream exploded");
    expect(rendered).toContain("after");
  });

  it("preserves all data through a backpressured destination", async () => {
    const context = new RenderContext();
    context.setMunchyOutput();
    const pieces = Array.from({ length: 64 }, (_, index) => `${index},`);
    context.output.add(Readable.from(pieces));
    const stream = (await context.output.close()) as NodeJS.ReadableStream;
    const received: Buffer[] = [];
    const slowDestination = new Writable({
      highWaterMark: 1,
      write(chunk, _encoding, callback) {
        received.push(Buffer.from(chunk));
        setImmediate(callback);
      },
    });

    await pipeline(stream, slowDestination);
    expect(Buffer.concat(received).toString("utf8")).toBe(pieces.join(""));
  });

  it("streams large segments without exceeding the argument limit", async () => {
    const context = new RenderContext();
    context.setMunchyOutput();
    const chunkCount = 150_000;
    for (let index = 0; index < chunkCount; index += 1) {
      context.output.add("x");
    }

    const stream = (await context.output.close()) as NodeJS.ReadableStream;
    const rendered = await streamText(stream);
    expect(rendered).toMatch(/^x+$/);
    expect(rendered).toHaveLength(chunkCount);
  });

  it("applies the output transform to the stream", async () => {
    const context = new RenderContext();
    context.setMunchyOutput();
    context.setOutputTransform((stream) => ({ stream, transformed: true }));
    context.output.add("data");

    const transformed = (await context.output.close()) as {
      stream: NodeJS.ReadableStream;
      transformed: boolean;
    };
    expect(transformed.transformed).toBe(true);
    await expect(streamText(transformed.stream)).resolves.toBe("data");
  });

  it("discards output if the stream is already destroyed", () => {
    const output = new BaseOutput();
    output.add("data");
    const done = vi.fn();
    const discarded = vi.fn();
    const munchy = {
      destroyed: true,
      once: vi.fn(),
      removeListener: vi.fn(),
      munch: vi.fn(),
    } as unknown as Parameters<BaseOutput["sendToMunchy"]>[0];

    output.sendToMunchy(munchy, done, discarded);
    expect(discarded).toHaveBeenCalledOnce();
    expect(done).not.toHaveBeenCalled();
  });

  it("wraps a non-error reason when failing a stream", () => {
    const destroy = vi.fn();
    const output = new RenderOutput({
      munchy: { destroyed: false, destroy } as never,
    });
    output.fail("stream failed");
    expect(destroy).toHaveBeenCalledWith(expect.objectContaining({ message: "stream failed" }));
  });

  it("does not reject the transformed stream result after streaming has failed", async () => {
    type Listener = () => void;
    const listeners = new Map<string, Listener>();
    const state = {
      destroyed: false,
      once: vi.fn((event: string, listener: Listener) => {
        listeners.set(event, listener);
      }),
      removeListener: vi.fn(),
      munch: vi.fn(),
    };
    const output = new RenderOutput({ munchy: state as never });
    output.add("data");
    const closing = output.close();
    output.fail(new Error("stream failed"), false);
    listeners.get("munched")?.();
    await Promise.resolve();
    await expect(closing).resolves.toBe(state);
  });

  it("completes an empty low-level stream on the next tick", async () => {
    const output = new BaseOutput();
    const done = vi.fn();
    output.sendToMunchy({} as never, done, vi.fn());
    await new Promise<void>((resolve) => process.nextTick(resolve));
    expect(done).toHaveBeenCalledOnce();
  });

  it("handles empty nested spots and ignores duplicate terminal events", async () => {
    type Listener = () => void;
    const listeners = new Map<string, Listener>();
    const munchy = {
      destroyed: false,
      once: vi.fn((event: string, listener: Listener) => {
        listeners.set(event, listener);
      }),
      removeListener: vi.fn(),
      munch: vi.fn(),
    } as unknown as Parameters<BaseOutput["sendToMunchy"]>[0];
    const output = new BaseOutput();
    output.add(new SpotOutput());
    const done = vi.fn();
    const discarded = vi.fn();

    output.sendToMunchy(munchy, done, discarded);
    expect(done).toHaveBeenCalledOnce();

    const nonempty = new BaseOutput();
    nonempty.add("data");
    nonempty.sendToMunchy(munchy, done, discarded);
    const errorListener = listeners.get("error");
    const closeListener = listeners.get("close");
    errorListener?.();
    closeListener?.();
    expect(discarded).toHaveBeenCalledOnce();
  });

  it("stops a pending output batch when the stream is discarded", async () => {
    type Listener = () => void;
    const listeners = new Map<string, Listener>();
    const munch = vi.fn();
    const munchy = {
      destroyed: false,
      once: vi.fn((event: string, listener: Listener) => {
        listeners.set(event, listener);
      }),
      removeListener: vi.fn(),
      munch,
    } as unknown as Parameters<BaseOutput["sendToMunchy"]>[0];
    const output = new BaseOutput();
    for (let index = 0; index < 257; index += 1) output.add("x");
    const done = vi.fn();
    const discarded = vi.fn();

    output.sendToMunchy(munchy, done, discarded);
    const munched = listeners.get("munched");
    listeners.get("close")?.();
    munched?.();
    munched?.();
    await Promise.resolve();

    expect(munch).toHaveBeenCalledOnce();
    expect(discarded).toHaveBeenCalledOnce();
    expect(done).not.toHaveBeenCalled();
  });

  it("discards between output batches when the destination is destroyed", async () => {
    type Listener = () => void;
    const listeners = new Map<string, Listener>();
    const state = {
      destroyed: false,
      once: vi.fn((event: string, listener: Listener) => {
        listeners.set(event, listener);
      }),
      removeListener: vi.fn(),
      munch: vi.fn(),
    };
    const output = new BaseOutput();
    for (let index = 0; index < 257; index += 1) output.add("x");
    const discarded = vi.fn();

    output.sendToMunchy(
      state as unknown as Parameters<BaseOutput["sendToMunchy"]>[0],
      vi.fn(),
      discarded,
    );
    state.destroyed = true;
    listeners.get("munched")?.();
    await Promise.resolve();
    expect(discarded).toHaveBeenCalledOnce();
  });
});
