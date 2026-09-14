import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { describe, expect, it, vi } from "vitest";

import { RenderContext, RenderOutput } from "../../src/runtime/index.js";

async function streamText(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<string | Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

describe("RenderOutput buffered output", () => {
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

  it("makes close idempotent and rejects writes after close", async () => {
    const output = new RenderOutput();
    output.add("done");
    const firstClose = output.close();
    expect(output.close()).toBe(firstClose);
    expect(() => output.add("late")).toThrow("RenderOutput is closed");
    expect(() => output.reserve()).toThrow("RenderOutput is closed");
    await expect(firstClose).resolves.toBe("done");
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
});
