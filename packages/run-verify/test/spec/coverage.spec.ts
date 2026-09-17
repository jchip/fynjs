import { describe, expect, it } from "vitest";
import { asyncVerify, runDefer, runVerify, verify } from "../../src/index.js";

describe("coverage boundaries", () => {
  it.each([
    [null, "null"],
    [undefined, "undefined"],
    [1, "a number"]
  ])("describes an invalid callback step value", (value, description) => {
    expect(() => verify().callbackStep(value as any)).toThrow(description);
  });

  it("keeps input for a callback step that only declares its callback", async () => {
    const result = await verify()
      .step("input")
      .keep.callbackStep<string>(next => next(null, "ignored"));

    expect(result).toBe("input");
  });

  it("reports an awaited name when no signals were configured", () => {
    expect(() => (verify() as any).awaiting("missing")).toThrow("no such signal");
  });

  it("handles synchronous throws from callback steps", async () => {
    const expected = new Error("expected callback failure");
    const unexpected = new Error("unexpected callback failure");

    expect(
      await verify()
        .expectError.callbackStep(() => {
          throw expected;
        })
        .step(error => error)
    ).toBe(expected);

    await expect(
      verify().callbackStep(() => {
        throw unexpected;
      })
    ).rejects.toBe(unexpected);
  });

  it("detects a callback in a runtime bare-arrow function", async () => {
    const step = new Function("return next => next(null, 'ok')")() as (
      next: (error: Error | null, value: string) => void
    ) => void;

    await expect(asyncVerify(step)).resolves.toBe("ok");
  });

  it("captures the runner stack when the chain call site has no stack", async () => {
    const errorType = Error as ErrorConstructor & {
      prepareStackTrace?: () => undefined;
    };
    const originalPrepare = errorType.prepareStackTrace;

    try {
      errorType.prepareStackTrace = () => undefined;
      await expect(verify().step(() => "ok")).resolves.toBe("ok");
    } finally {
      errorType.prepareStackTrace = originalPrepare;
    }
  });

  it("runs without V8 stack capture support", async () => {
    const errorType = Error as ErrorConstructor & {
      captureStackTrace?: typeof Error.captureStackTrace;
      prepareStackTrace?: () => undefined;
    };
    const originalCapture = errorType.captureStackTrace;
    const originalPrepare = errorType.prepareStackTrace;

    try {
      errorType.captureStackTrace = undefined;
      errorType.prepareStackTrace = () => undefined;

      await expect(verify().step(() => "chain")).resolves.toBe("chain");
      await expect(asyncVerify(() => "async")).resolves.toBe("async");
      await expect(
        new Promise((resolve, reject) => {
          runVerify(
            () => "callback",
            (error: Error | undefined, result: unknown) =>
              error ? reject(error) : resolve(result)
          );
        })
      ).resolves.toBe("callback");

      const deferred = runDefer();
      const wait = deferred.wait();
      deferred.resolve("deferred");
      await expect(wait()).resolves.toBe("deferred");
    } finally {
      errorType.captureStackTrace = originalCapture;
      errorType.prepareStackTrace = originalPrepare;
    }
  });
});
