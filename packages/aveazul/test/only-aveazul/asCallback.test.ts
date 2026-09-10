import { describe, test, expect } from "vitest";
import { verify, signal } from "run-verify";
// This test file directly imports AveAzul from the dist directory
// so it always tests the AveAzul implementation, even when running
// in Bluebird test mode with USE_BLUEBIRD=true
import { AveAzul } from "../../src/index.ts";

/**
 * Each test replaces AveAzul.___throwUncaughtError to capture what the library
 * reports, so the replacement has to be restored even when an assertion fails.
 * `cleanup` does that. The captured error arrives out of band, so it is a
 * signal: the test waits for it rather than sleeping and hoping, and the
 * deadline turns "it never arrived" into a clear failure instead of an
 * assertion against an empty array.
 */
const captureUncaught = () => {
  const original = AveAzul.___throwUncaughtError;
  // unknown, matching ___throwUncaughtError: the point of the third test is
  // that whatever was thrown arrives unchanged, so it must not be narrowed here
  const thrown = signal<unknown>();
  let calls = 0;

  AveAzul.___throwUncaughtError = (err: unknown) => {
    calls += 1;
    thrown.resolve(err);
  };

  return {
    thrown,
    callCount: () => calls,
    restore: () => {
      AveAzul.___throwUncaughtError = original;
    }
  };
};

describe("AveAzul.prototype.asCallback error handling", () => {
  test("should propagate errors thrown in callback when promise resolves", () => {
    const captured = captureUncaught();
    const callbackError = new Error("callback error");

    return verify({
      timeout: 500,
      signals: { thrown: captured.thrown },
      cleanup: captured.restore
    })
      .step(() => {
        AveAzul.resolve("value").asCallback(() => {
          throw callbackError;
        });
      })
      .awaiting(captured.thrown)
      .step((err) => {
        expect(captured.callCount()).toBe(1);
        expect(err).toBe(callbackError);
      });
  });

  test("should propagate errors thrown in callback when promise rejects", () => {
    const captured = captureUncaught();
    const callbackError = new Error("callback error");

    return verify({
      timeout: 500,
      signals: { thrown: captured.thrown },
      cleanup: captured.restore
    })
      .step(() => {
        AveAzul.reject(new Error("rejection")).asCallback(() => {
          throw callbackError;
        });
      })
      .awaiting(captured.thrown)
      .step((err) => {
        expect(captured.callCount()).toBe(1);
        expect(err).toBe(callbackError);
      });
  });

  test("should preserve the error object when throwing uncaught errors", () => {
    const captured = captureUncaught();

    // Create a custom error with additional properties
    class CustomError extends Error {
      customProperty: string;

      constructor(message: string) {
        super(message);
        this.name = "CustomError";
        this.customProperty = "test";
      }
    }

    const callbackError = new CustomError("custom error");

    return verify({
      timeout: 500,
      signals: { thrown: captured.thrown },
      cleanup: captured.restore
    })
      .step(() => {
        AveAzul.resolve("value").asCallback(() => {
          throw callbackError;
        });
      })
      .awaiting(captured.thrown)
      .step((err) => {
        expect(captured.callCount()).toBe(1);
        expect(err).toBe(callbackError);
        expect((err as CustomError).name).toBe("CustomError");
        expect((err as CustomError).customProperty).toBe("test");
      });
  });
});
