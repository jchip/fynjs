import { verify } from "run-verify";
import { describe, test, expect } from "vitest";
import AveAzul from "./promise-lib.ts";

describe("AveAzul.method", () => {
  test("should convert a synchronous function to a promise-returning function", () => {
    const add = AveAzul.method((a, b) => a + b);
    return verify({ timeout: 1000 })
      .step(() => add(1, 2))
      .step((result) => {
        expect(result).toBe(3);
      });
  });

  test("should return AveAzul instances", () =>
    verify({ timeout: 1000 })
      .step(() => {
        const fn = AveAzul.method(() => 42);
        return { promise: fn() };
      })
      .keep.step(({ promise }) => {
        expect(promise).toBeInstanceOf(AveAzul);
      })
      .step(({ promise }) => promise)
      .step((result) => {
        expect(result).toBe(42);
      }));

  test("should preserve 'this' context", () => {
    const obj = {
      value: 10,
      addMethod: AveAzul.method(function (a) {
        return this.value + a;
      }),
    };
    return verify({ timeout: 1000 })
      .step(() => obj.addMethod(5))
      .step((result) => {
        expect(result).toBe(15);
      });
  });

  test("should handle thrown exceptions by rejecting the promise", () => {
    const error = new Error("Test error");
    const throwingFn = AveAzul.method(() => {
      throw error;
    });
    return verify({ timeout: 1000 })
      .expectError.step(() => throwingFn())
      .step((caught) => {
        expect(caught).toBe(error);
      });
  });

  test("should handle returned promises", () => {
    const asyncFn = AveAzul.method(() => Promise.resolve(42));
    return verify({ timeout: 1000 })
      .step(() => asyncFn())
      .step((result) => {
        expect(result).toBe(42);
      });
  });

  test("should handle rejected promises", () => {
    const error = new Error("Async error");
    const asyncFn = AveAzul.method(() => Promise.reject(error));
    return verify({ timeout: 1000 })
      .expectError.step(() => asyncFn())
      .step((caught) => {
        expect(caught).toBe(error);
      });
  });

  test("should handle multiple arguments", () => {
    const sum = AveAzul.method((...args) => args.reduce((a, b) => a + b, 0));
    return verify({ timeout: 1000 })
      .step(() => sum(1, 2, 3, 4, 5))
      .step((result) => {
        expect(result).toBe(15);
      });
  });
});
