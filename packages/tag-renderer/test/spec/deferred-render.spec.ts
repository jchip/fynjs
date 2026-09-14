import { once } from "node:events";
import { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import {
  RenderContext,
  TagRenderer,
  createTemplateTags,
  createTemplateTagsFromArray,
} from "../../src/index.js";

function deferred<Value = void>(): {
  promise: Promise<Value>;
  resolve: (value: Value | PromiseLike<Value>) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<string | Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

describe("deferred rendering", () => {
  it("retires deferred output in template order", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const renderer = new TagRenderer({
      templateTags: createTemplateTagsFromArray([
        (context: RenderContext) => context.defer(() => first.promise),
        "|",
        (context: RenderContext) => context.defer(() => second.promise),
        "|tail",
      ]),
      deferConcurrency: 2,
    });

    const rendering = renderer.render({});
    await vi.waitFor(() => expect(second.resolve).toBeTypeOf("function"));
    second.resolve("second");
    first.resolve("first");

    expect((await rendering).result).toBe("first|second|tail");
  });

  it("retains capacity until ordered retirement", async () => {
    const gates = [deferred<string>(), deferred<string>(), deferred<string>()];
    const started: number[] = [];
    const renderer = new TagRenderer({
      templateTags: createTemplateTagsFromArray(
        gates.map((gate, index) => (context: RenderContext) => {
          context.defer(() => {
            started.push(index);
            return gate.promise;
          });
        }),
      ),
      deferConcurrency: 2,
    });

    const rendering = renderer.render({});
    await vi.waitFor(() => expect(started).toEqual([0, 1]));
    gates[1].resolve("B");
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual([0, 1]);

    gates[0].resolve("A");
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2]));
    gates[2].resolve("C");

    expect((await rendering).result).toBe("ABC");
  });

  it("cancels siblings and queued work on deferred rejection", async () => {
    const failure = new Error("deferred failed");
    let siblingAborted = false;
    let queuedStarted = false;
    const renderer = new TagRenderer({
      templateTags: createTemplateTagsFromArray([
        (context: RenderContext) =>
          context.defer(
            (signal) =>
              new Promise((_resolve, reject) => {
                signal.addEventListener(
                  "abort",
                  () => {
                    siblingAborted = true;
                    reject(signal.reason);
                  },
                  { once: true },
                );
              }),
          ),
        (context: RenderContext) => context.defer(() => Promise.reject(failure)),
        (context: RenderContext) =>
          context.defer(() => {
            queuedStarted = true;
            return "late";
          }),
      ]),
      deferConcurrency: 2,
    });

    const context = await renderer.render({});

    expect(context.error).toBe(failure);
    expect(context.result).toBe(failure);
    expect(siblingAborted).toBe(true);
    expect(queuedStarted).toBe(false);
    expect(() => context.output.reserve()).toThrow("closed");
  });

  it.each([null, undefined])("normalizes a %s deferred rejection reason", async (reason) => {
    const renderer = new TagRenderer({
      templateTags: createTemplateTags`${(context: RenderContext) =>
        context.defer(() => Promise.reject(reason))}`,
    });

    const context = await renderer.render({});

    expect(context.error).toMatchObject({ message: "Rendering failed without an error reason" });
    expect(context.result).toBe(context.error);
  });

  it.each([null, undefined])("normalizes a %s ordinary rejection reason", async (reason) => {
    const renderer = new TagRenderer({
      templateTags: createTemplateTags`${() => Promise.reject(reason)}`,
    });

    const context = await renderer.render({});

    expect(context.error).toMatchObject({ message: "Rendering failed without an error reason" });
    expect(context.result).toBe(context.error);
  });

  it("preserves the first failure when disposing a readable throws", async () => {
    const returned = deferred();
    const disposalFailure = new Error("destroy failed");
    const destroySource = vi.fn(() => {
      throw disposalFailure;
    });
    const source = {
      on: vi.fn(),
      pipe: vi.fn(),
      destroy: destroySource,
    } as unknown as NodeJS.ReadableStream;
    const renderer = new TagRenderer({
      templateTags: createTemplateTagsFromArray([
        (context: RenderContext) => context.defer(() => new Promise(() => undefined)),
        (context: RenderContext) =>
          context.defer(() => {
            returned.resolve();
            return source;
          }),
      ]),
      deferConcurrency: 2,
    });
    const handle = renderer.renderStream();
    handle.stream.resume();
    await returned.promise;
    await Promise.resolve();
    const failure = new Error("render failed first");

    expect(() => handle.abort(failure)).not.toThrow();
    const context = await handle.completed;

    expect(destroySource).toHaveBeenCalledOnce();
    expect(context.error).toBe(failure);
    expect(context.result).toBe(failure);
  });

  it("propagates an external abort signal and settles rendering", async () => {
    const controller = new AbortController();
    const started = deferred();
    let observedReason: unknown;
    const renderer = new TagRenderer({
      templateTags: createTemplateTags`${(context: RenderContext) =>
        context.defer(
          (signal) =>
            new Promise((_resolve, reject) => {
              started.resolve();
              signal.addEventListener(
                "abort",
                () => {
                  observedReason = signal.reason;
                  reject(signal.reason);
                },
                { once: true },
              );
            }),
        )}`,
    });
    const failure = new Error("caller aborted");

    const rendering = renderer.render({ signal: controller.signal });
    await started.promise;
    controller.abort(failure);
    const context = await rendering;

    expect(observedReason).toBe(failure);
    expect(context.error).toBe(failure);
    expect(context.result).toBe(failure);
  });

  it("cancels running deferred work on full and void stop", async () => {
    for (const mode of ["full", "void"] as const) {
      const started = deferred();
      let aborted = false;
      const template = createTemplateTagsFromArray([
        (context: RenderContext) =>
          context.defer(
            (signal) =>
              new Promise<void>((resolve) => {
                started.resolve();
                signal.addEventListener(
                  "abort",
                  () => {
                    aborted = true;
                    resolve();
                  },
                  { once: true },
                );
              }),
          ),
        async () => started.promise,
        (context: RenderContext) => {
          if (mode === "full") {
            context.fullStop();
            return "stopped";
          }
          context.voidStop("replacement");
          return "discarded";
        },
      ]);

      const context = await new TagRenderer({ templateTags: template }).render({});
      expect(aborted).toBe(true);
      expect(context.result).toBe(mode === "full" ? "stopped" : "replacement");
    }
  });

  it("cancels deferred work when rendering is intercepted", async () => {
    const started = deferred();
    let aborted = false;
    const responseHandler = vi.fn();
    const renderer = new TagRenderer({
      templateTags: createTemplateTagsFromArray([
        (context: RenderContext) =>
          context.defer(
            (signal) =>
              new Promise<void>((resolve) => {
                started.resolve();
                signal.addEventListener(
                  "abort",
                  () => {
                    aborted = true;
                    resolve();
                  },
                  { once: true },
                );
              }),
          ),
        async () => started.promise,
        (context: RenderContext) => context.intercept({ responseHandler }),
      ]),
    });

    const context = await renderer.render({});

    expect(aborted).toBe(true);
    expect(context.intercepted).toEqual({ responseHandler });
    expect(context.error).toMatchObject({ name: "RenderInterceptError" });
  });

  it("returns a stream immediately and emits a prefix before an awaited handler", async () => {
    const gate = deferred<string>();
    const renderer = new TagRenderer({
      templateTags: createTemplateTags`prefix${() => gate.promise}tail`,
    });
    await renderer.initializeRenderer();

    const handle = renderer.renderStream();
    expect(() => handle.context.setOutputSend(() => undefined)).toThrow("already locked");
    let completed = false;
    void handle.completed.then(() => {
      completed = true;
    });
    const chunks: Buffer[] = [];
    handle.stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    const ended = once(handle.stream, "end");

    await vi.waitFor(() => expect(Buffer.concat(chunks).toString()).toBe("prefix"));
    expect(completed).toBe(false);
    gate.resolve("middle");
    await ended;
    await handle.completed;

    expect(Buffer.concat(chunks).toString()).toBe("prefixmiddletail");
  });

  it("streams the prefix before a gated deferred position", async () => {
    const gate = deferred<string>();
    const renderer = new TagRenderer({
      templateTags: createTemplateTags`prefix${(context: RenderContext) =>
        context.defer(() => gate.promise)}tail`,
    });
    await renderer.initializeRenderer();

    const handle = renderer.renderStream();
    const chunks: Buffer[] = [];
    handle.stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    const ended = once(handle.stream, "end");

    await vi.waitFor(() => expect(Buffer.concat(chunks).toString()).toBe("prefix"));
    gate.resolve("deferred");
    await ended;
    await handle.completed;

    expect(Buffer.concat(chunks).toString()).toBe("prefixdeferredtail");
  });

  it("streams deferred readable and async iterable results in order", async () => {
    const renderer = new TagRenderer({
      templateTags: createTemplateTagsFromArray([
        (context: RenderContext) => context.defer(() => Readable.from(["readable"])),
        "|",
        (context: RenderContext) =>
          context.defer(() =>
            (async function* () {
              yield "async";
              yield "-iterable";
            })(),
          ),
      ]),
    });

    const handle = renderer.renderStream();
    const rendered = await readStream(handle.stream);
    await handle.completed;

    expect(rendered).toBe("readable|async-iterable");
  });

  it("retains defer capacity until a returned stream is drained", async () => {
    const sourceGate = deferred();
    const started: number[] = [];
    const renderer = new TagRenderer({
      templateTags: createTemplateTagsFromArray(
        [0, 1, 2].map((index) => (context: RenderContext) => {
          context.defer(() => {
            started.push(index);
            return (async function* () {
              if (index === 0) await sourceGate.promise;
              yield String(index);
            })();
          });
        }),
      ),
      deferConcurrency: 2,
    });

    const handle = renderer.renderStream();
    const rendered = readStream(handle.stream);
    await vi.waitFor(() => expect(started).toEqual([0, 1]));
    await Promise.resolve();
    expect(started).toEqual([0, 1]);

    sourceGate.resolve();
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2]));
    expect(await rendered).toBe("012");
    await handle.completed;
  });

  it("rejects defer outside the synchronous ordinary-handler frame", async () => {
    const gate = deferred<string>();
    const errors: Error[] = [];
    let reserve!: ReturnType<typeof vi.spyOn>;
    let captured!: RenderContext;
    const renderer = new TagRenderer({
      templateTags: createTemplateTagsFromArray([
        (context: RenderContext) => {
          captured = context;
          reserve = vi.spyOn(context.output, "reserve");
          queueMicrotask(() => {
            try {
              context.defer(() => "late");
            } catch (error) {
              errors.push(error as Error);
            }
          });
          context.defer(() => {
            try {
              context.defer(() => "nested");
            } catch (error) {
              errors.push(error as Error);
            }
          });
        },
        () => gate.promise,
      ]),
    });

    const rendering = renderer.render({});
    await vi.waitFor(() => expect(errors).toHaveLength(2));
    expect(errors.every((error) => error.message.includes("synchronously"))).toBe(true);
    expect(reserve).toHaveBeenCalledOnce();
    gate.resolve("done");
    expect((await rendering).result).toBe("done");
    expect(captured.error).toBeUndefined();
  });

  it("settles promptly when aborting an ordinary awaited handler", async () => {
    const started = deferred();
    const renderer = new TagRenderer({
      templateTags: createTemplateTags`${(context: RenderContext) =>
        new Promise((_resolve, reject) => {
          started.resolve();
          context.signal.addEventListener("abort", () => reject(context.signal.reason), {
            once: true,
          });
        })}`,
    });
    const handle = renderer.renderStream();
    await started.promise;

    const failure = new Error("abort awaited handler");
    handle.abort(failure);
    const context = await handle.completed;

    expect(context.error).toBe(failure);
  });

  it("aborts deferred work when the consumer destroys the stream", async () => {
    const started = deferred();
    let signalAborted = false;
    const renderer = new TagRenderer({
      templateTags: createTemplateTags`${(context: RenderContext) =>
        context.defer(
          (signal) =>
            new Promise<void>((resolve) => {
              started.resolve();
              signal.addEventListener(
                "abort",
                () => {
                  signalAborted = true;
                  resolve();
                },
                { once: true },
              );
            }),
        )}`,
    });

    const handle = renderer.renderStream();
    handle.stream.resume();
    await started.promise;
    (handle.stream as Readable).destroy();
    const context = await handle.completed;

    expect(signalAborted).toBe(true);
    expect(context.error).toMatchObject({ message: "Render stream destroyed" });
  });

  it("does not advance a large output batch while the stream is being destroyed", async () => {
    const errors: Error[] = [];
    const renderer = new TagRenderer({
      templateTags: createTemplateTagsFromArray(Array.from({ length: 600 }, () => () => "x")),
    });
    await renderer.initializeRenderer();

    const handle = renderer.renderStream();
    handle.stream.on("error", (error) => errors.push(error));
    handle.stream.once("data", () => (handle.stream as Readable).destroy());
    const closed = once(handle.stream, "close");
    handle.stream.resume();

    await closed;
    const context = await handle.completed;
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(errors).toEqual([]);
    expect(context.error).toMatchObject({ message: "Render stream destroyed" });
    expect((handle.stream as Readable).listenerCount("munched")).toBe(0);
  });

  it("aborts and closes a gated deferred iterable after consumer disconnect", async () => {
    let finalized = false;
    let signalAborted = false;
    const chunks: string[] = [];
    const renderer = new TagRenderer({
      templateTags: createTemplateTags`${(context: RenderContext) =>
        context.defer((signal) =>
          (async function* () {
            try {
              yield "first";
              if (!signal.aborted) {
                await new Promise<void>((resolve) =>
                  signal.addEventListener("abort", () => resolve(), { once: true }),
                );
              }
              signalAborted = signal.aborted;
              if (!signal.aborted) yield "late";
            } finally {
              finalized = true;
            }
          })(),
        )}`,
    });

    const handle = renderer.renderStream();
    handle.stream.on("data", (chunk) => {
      chunks.push(String(chunk));
      (handle.stream as Readable).destroy();
    });
    const closed = once(handle.stream, "close");

    await closed;
    const context = await handle.completed;
    await vi.waitFor(() => expect(finalized).toBe(true));

    expect(signalAborted).toBe(true);
    expect(chunks).toEqual(["first"]);
    expect(context.error).toMatchObject({ message: "Render stream destroyed" });
  });

  it("reflects an unrecoverable Munchy error in render completion", async () => {
    const renderer = new TagRenderer({
      templateTags: createTemplateTags`${(context: RenderContext) =>
        context.defer(() =>
          (function* () {
            yield {} as unknown as string;
          })(),
        )}`,
    });

    const handle = renderer.renderStream();
    handle.stream.resume();
    const context = await handle.completed;

    expect(context.error).toBeInstanceOf(TypeError);
    expect(context.result).toBe(context.error);
  });

  it("supports explicit stream abort and rejects invalid concurrency", async () => {
    for (const invalid of [0, -1, 1.5, Number.NaN]) {
      expect(
        () =>
          new TagRenderer({
            templateTags: createTemplateTags`ok`,
            deferConcurrency: invalid,
          }),
      ).toThrow("deferConcurrency must be a positive integer");
    }

    const invoked = vi.fn();
    const renderer = new TagRenderer({
      templateTags: createTemplateTags`${() => invoked()}`,
    });
    const initialize = vi.spyOn(renderer, "initializeRenderer");
    const handle = renderer.renderStream();
    const failure = new Error("explicit abort");
    handle.abort(failure);

    expect((await handle.completed).error).toBe(failure);
    expect(initialize).not.toHaveBeenCalled();
    expect(invoked).not.toHaveBeenCalled();
  });

  it("fails an unread multi-batch stream when aborted after producer completion", async () => {
    const failure = new Error("late explicit abort");
    const observed: Error[] = [];
    const renderer = new TagRenderer({
      templateTags: createTemplateTagsFromArray(Array.from({ length: 600 }, () => () => "x")),
    });
    await renderer.initializeRenderer();

    const handle = renderer.renderStream();
    const context = await handle.completed;
    const closed = new Promise<void>((resolve) => handle.stream.once("close", resolve));
    handle.stream.on("error", (error) => observed.push(error));
    handle.abort(failure);
    await closed;

    expect(context.error).toBe(failure);
    expect(observed).toEqual([failure]);
    expect((handle.stream as Readable).destroyed).toBe(true);
    expect((handle.stream as Readable).listenerCount("munched")).toBe(0);
  });

  it("settles producer completion without consuming the output stream", async () => {
    const renderer = new TagRenderer({ templateTags: createTemplateTags`unread` });

    const handle = renderer.renderStream();
    const context = await handle.completed;

    expect(context.result).toBe(handle.stream);
    expect((handle.stream as Readable).readableEnded).toBe(false);
    (handle.stream as Readable).destroy();
  });

  it("rejects defer calls after rendering has closed", async () => {
    let captured!: RenderContext;
    const renderer = new TagRenderer({
      templateTags: createTemplateTags`${(context: RenderContext) => {
        captured = context;
        return "done";
      }}`,
    });

    expect((await renderer.render({})).result).toBe("done");
    expect(() => captured.defer(() => "late")).toThrow("after rendering closed");
  });
});
