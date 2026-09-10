import { describe, it, expect } from "vitest";
import { asyncVerify, expectError, runDefer, runTimeout, withCallback, wrapCheck } from "../../src/index.js";
import type { NextCallback } from "../../src/index.js";

describe("step pipeline contracts", () => {
  it("forwards results through mixed completion styles and timeout controls", async () => {
    const order: string[] = [];
    const result = await asyncVerify(
      () => { order.push("sync"); return 2; },
      runTimeout(500),
      async (value: number) => { await Promise.resolve(); order.push("promise"); return value * 3; },
      withCallback((value: number, next: NextCallback) => {
        queueMicrotask(() => { order.push("callback"); next(null, value + 1); });
      }),
      (value: number) => { order.push("last"); return value * 2; }
    );
    expect(result).toBe(14);
    expect(order).toEqual(["sync", "promise", "callback", "last"]);
  });

  it.each(["throw", "reject", "callback"])("pipes the original %s error and continues with the next result", async mode => {
    const failure = new Error("operation failure");
    const operation = mode === "throw"
      ? expectError(() => { throw failure; })
      : mode === "reject"
        ? expectError(() => Promise.reject(failure))
        : wrapCheck((finish: NextCallback) => { queueMicrotask(() => finish(failure)); }).withCallback!.expectError!;
    let observed: unknown;
    const result = await asyncVerify(
      runTimeout(500),
      operation,
      (error: unknown) => { observed = error; return "recovered"; },
      (value: string) => `${value}!`
    );
    expect(observed).toBe(failure);
    expect(result).toBe("recovered!");
  });

  it.each(["sync", "promise", "callback"])("fails an error expectation when %s work succeeds", async mode => {
    const operation = mode === "sync" ? () => 1
      : mode === "promise" ? () => Promise.resolve(1)
        : (next: NextCallback) => { queueMicrotask(() => next(null, 1)); };
    let reached = false;
    await expect(asyncVerify(
      runTimeout(500), expectError(operation), () => { reached = true; }
    )).rejects.toThrow("expecting error");
    expect(reached).toBe(false);
  });

  it("waits for an asynchronous verification step after a defer wait", async () => {
    const signal = runDefer();
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    let reached = false;
    let observed: unknown;
    const run = asyncVerify(
      runTimeout(500), signal,
      () => { signal.resolve(7); },
      signal.wait(),
      async (value: number) => { observed = value; enter(); await gate; return value * 2; },
      (value: number) => { reached = true; return value; }
    );
    try {
      await Promise.race([entered, run.then(() => { throw new Error("run ended before verification"); })]);
      expect(observed).toBe(7);
      expect(reached).toBe(false);
    } finally {
      release();
      await run;
    }
    expect(await run).toBe(14);
    expect(reached).toBe(true);
  });

  it("fails when an asynchronous verification step after a defer wait rejects", async () => {
    const signal = runDefer();
    const failure = new Error("verification failed");
    let reached = false;
    await expect(asyncVerify(
      runTimeout(500), signal,
      () => { signal.resolve(7); },
      signal.wait(),
      async () => { await Promise.resolve(); throw failure; },
      () => { reached = true; }
    )).rejects.toBe(failure);
    expect(reached).toBe(false);
  });
});
