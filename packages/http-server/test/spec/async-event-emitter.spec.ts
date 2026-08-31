import { describe, it, expect } from "vitest";
import { AsyncEventEmitter } from "../../src/async-event-emitter.js";

const emitAsync = (emitter: AsyncEventEmitter, event: string, context: any) =>
  new Promise<void>((resolve, reject) =>
    emitter.emit(event, context, err => (err ? reject(err) : resolve()))
  );

describe("AsyncEventEmitter", () => {
  it("completes immediately when no handler is registered", async () => {
    const emitter = new AsyncEventEmitter();
    await expect(emitAsync(emitter, "nobody-home", {})).resolves.toBeUndefined();
  });

  it("runs handlers sequentially in registration order", async () => {
    const emitter = new AsyncEventEmitter();
    const order: string[] = [];

    emitter.on("go", (ctx, next) => {
      order.push("first-start");
      setTimeout(() => {
        order.push("first-end");
        next();
      }, 20);
    });
    emitter.on("go", (ctx, next) => {
      order.push("second-start");
      next();
    });

    await emitAsync(emitter, "go", {});

    expect(order).toEqual(["first-start", "first-end", "second-start"]);
  });

  it("passes the context to each handler", async () => {
    const emitter = new AsyncEventEmitter();
    const seen: any[] = [];
    const context = { config: { marker: 1 } };

    emitter.on("go", (ctx, next) => {
      seen.push(ctx);
      next();
    });

    await emitAsync(emitter, "go", context);

    expect(seen).toEqual([context]);
  });

  it("accepts a handler that returns a promise instead of calling next", async () => {
    const emitter = new AsyncEventEmitter();
    const order: string[] = [];

    emitter.on("go", async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      order.push("async-done");
    });
    emitter.on("go", (ctx, next) => {
      order.push("after");
      next();
    });

    await emitAsync(emitter, "go", {});

    expect(order).toEqual(["async-done", "after"]);
  });

  it("stops the chain and reports the error when a handler calls next(err)", async () => {
    const emitter = new AsyncEventEmitter();
    let ranSecond = false;

    emitter.on("go", (ctx, next) => next(new Error("nope")));
    emitter.on("go", (ctx, next) => {
      ranSecond = true;
      next();
    });

    await expect(emitAsync(emitter, "go", {})).rejects.toThrow("nope");
    expect(ranSecond).toBe(false);
  });

  it("reports a synchronous throw from a handler", async () => {
    const emitter = new AsyncEventEmitter();
    emitter.on("go", () => {
      throw new Error("sync boom");
    });

    await expect(emitAsync(emitter, "go", {})).rejects.toThrow("sync boom");
  });

  it("reports a rejected promise from a handler", async () => {
    const emitter = new AsyncEventEmitter();
    emitter.on("go", async () => {
      throw new Error("async boom");
    });

    await expect(emitAsync(emitter, "go", {})).rejects.toThrow("async boom");
  });

  it("ignores a second call to next from the same handler", async () => {
    const emitter = new AsyncEventEmitter();
    let count = 0;

    emitter.on("go", (ctx, next) => {
      next();
      next(new Error("too late"));
    });
    emitter.on("go", (ctx, next) => {
      count++;
      next();
    });

    await emitAsync(emitter, "go", {});
    expect(count).toBe(1);
  });

  it("runs a once handler a single time", async () => {
    const emitter = new AsyncEventEmitter();
    let count = 0;

    emitter.once("go", (ctx, next) => {
      count++;
      next();
    });

    expect(emitter.listenerCount("go")).toBe(1);
    await emitAsync(emitter, "go", {});
    await emitAsync(emitter, "go", {});

    expect(count).toBe(1);
    expect(emitter.listenerCount("go")).toBe(0);
  });

  it("removes a handler with off, and drops the event once empty", async () => {
    const emitter = new AsyncEventEmitter();
    const handler = (ctx: any, next: any) => next();

    emitter.on("go", handler);
    expect(emitter.listenerCount("go")).toBe(1);

    emitter.off("go", handler);
    expect(emitter.listenerCount("go")).toBe(0);

    await expect(emitAsync(emitter, "go", {})).resolves.toBeUndefined();
  });

  it("does not skip a handler when one removes itself mid-emit", async () => {
    const emitter = new AsyncEventEmitter();
    const order: string[] = [];

    const first = (ctx: any, next: any) => {
      order.push("first");
      emitter.off("go", first);
      next();
    };
    emitter.on("go", first);
    emitter.on("go", (ctx, next) => {
      order.push("second");
      next();
    });

    await emitAsync(emitter, "go", {});

    expect(order).toEqual(["first", "second"]);
  });
});
