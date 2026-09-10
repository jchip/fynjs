import { describe, test, expect } from "vitest";
import { verify, signal } from "run-verify";
import AveAzul from "./promise-lib.ts";

describe("AveAzul.prototype.asCallback", () => {
  test("should call callback with value when promise resolves", () =>
    verify({ timeout: 500 })
      .callbackStep((next) => AveAzul.resolve("success").asCallback(next))
      .step((value) => {
        expect(value).toBe("success");
      }));

  test("should call callback with error when promise rejects", () => {
    const testError = new Error("test error");
    return verify({ timeout: 500 })
      .expectError.callbackStep((next) =>
        AveAzul.reject(testError).asCallback(next)
      )
      .step((err) => {
        expect(err).toBe(testError);
      });
  });

  test("should return the same promise instance", () => {
    const promise = AveAzul.resolve("value");
    const returnValue = promise.asCallback(() => {});
    expect(returnValue).toBe(promise);
  });

  test("should ignore non-function callbacks", () => {
    // Should not throw
    const promise = AveAzul.resolve("value");
    const returnValue = promise.asCallback(null);
    expect(returnValue).toBe(promise);
  });

  test("should spread array values with spread option", () => {
    const spread = signal<number[]>();

    return verify({ timeout: 500, signals: { spread } })
      .step(() => {
        AveAzul.resolve([1, 2, 3]).asCallback(
          (err: Error | null, a: number, b: number, c: number) => {
            expect(err).toBeNull();
            spread.resolve([a, b, c]);
          },
          { spread: true }
        );
      })
      .awaiting("spread")
      .step((values) => {
        expect(values).toEqual([1, 2, 3]);
      });
  });

  test("should not spread array values without spread option", () =>
    verify({ timeout: 500 })
      .callbackStep((next) =>
        AveAzul.resolve([1, 2, 3]).asCallback(next)
      )
      .step((value) => {
        expect(Array.isArray(value)).toBe(true);
        expect(value).toEqual([1, 2, 3]);
      }));

  test("should work with delay", () => {
    const delayed = signal<string>();
    let callbackCalled = false;

    return verify({ timeout: 500, signals: { delayed } })
      .step(() => {
        AveAzul.delay(50, "delayed value").asCallback(
          (err: Error | null, value: string) => {
            callbackCalled = true;
            expect(err).toBeNull();
            delayed.resolve(value);
          }
        );
      })
      // still synchronous here, so the delayed callback cannot have run yet
      .keep.step(() => {
        expect(callbackCalled).toBe(false);
      })
      .awaiting("delayed")
      .step((value) => {
        expect(value).toBe("delayed value");
      });
  });

  test("nodeify should function the same as asCallback", () =>
    verify({ timeout: 500 })
      .callbackStep((next) => AveAzul.resolve("success").nodeify(next))
      .step((value) => {
        expect(value).toBe("success");
      }));
});
