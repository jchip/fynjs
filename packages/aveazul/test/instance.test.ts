import { verify } from "run-verify";
import { describe, test, expect, vi } from "vitest";
import AveAzul from "./promise-lib.ts";

describe("instance methods", () => {
  test("tap() should execute side effects and return original value", () => {
    const sideEffect = vi.fn();
    return verify({ timeout: 1000 })
      .step(() => new AveAzul((resolve) => resolve(42)).tap(sideEffect))
      .step((result) => {
        expect(sideEffect).toHaveBeenCalledWith(42);
        expect(result).toBe(42);
      });
  });

  test("filter() should filter array elements", () => {
    return verify({ timeout: 1000 })
      .step(() =>
        new AveAzul((resolve) => resolve([1, 2, 3, 4, 5])).filter(
          (x) => x % 2 === 0
        )
      )
      .step((result) => {
        expect(result).toEqual([2, 4]);
      });
  });

  test("return() should inject a new value", () => {
    return verify({ timeout: 1000 })
      .step(() => new AveAzul((resolve) => resolve(42)).return(100))
      .step((result) => {
        expect(result).toBe(100);
      });
  });

  test("each() should iterate over array elements", () => {
    const calls = [];
    const arr = [1, 2, 3];
    return verify({ timeout: 1000 })
      .step(() =>
        new AveAzul((resolve) => resolve(arr)).each((a, b, c) => {
          calls.push([a, b, c]);
        })
      )
      .step((result) => {
        expect(calls).toEqual([
          [1, 0, 3],
          [2, 1, 3],
          [3, 2, 3],
        ]);
        expect(result).toEqual(arr);
      });
  });

  test("delay() should delay resolution", () => {
    const start = Date.now();
    return verify({ timeout: 1000 })
      .step(() => new AveAzul((resolve) => resolve(42)).delay(101))
      .step(() => {
        const duration = Date.now() - start;
        expect(duration).toBeGreaterThanOrEqual(100);
      });
  });

  test("timeout() should reject after specified time", () => {
    const promise = new AveAzul((resolve) =>
      setTimeout(() => resolve(42), 100)
    ).timeout(50);
    return verify({ timeout: 1000 })
      .expectErrorHas("operation timed out").step(() => promise);
  });

  test("timeout() should resolve if operation completes in time", () => {
    return verify({ timeout: 1000 })
      .step(() =>
        new AveAzul((resolve) => setTimeout(() => resolve(42), 50)).timeout(100)
      )
      .step((result) => {
        expect(result).toBe(42);
      });
  });

  test("timeout() should handle rejection", () => {
    const error = new Error("test");
    const promise = new AveAzul((resolve, reject) =>
      setTimeout(() => reject(error), 50)
    ).timeout(100);
    return verify({ timeout: 1000 })
      .expectError.step(() => promise)
      .step((caught) => {
        expect(caught).toBe(error);
      });
  });

  test("props() should resolve object properties", () => {
    return verify({ timeout: 1000 })
      .step(() =>
        new AveAzul((resolve) =>
          resolve({
            a: Promise.resolve(1),
            b: Promise.resolve(2),
            c: 3,
          })
        ).props()
      )
      .step((result) => {
        expect(result).toEqual({ a: 1, b: 2, c: 3 });
      });
  });

  test("tapCatch() should execute side effects on rejection", () => {
    const sideEffect = vi.fn();
    const promise = new AveAzul((resolve, reject) =>
      reject(new Error("test"))
    ).tapCatch(sideEffect);
    return verify({ timeout: 1000 })
      .expectErrorHas("test").step(() => promise)
      .step(() => {
        expect(sideEffect).toHaveBeenCalled();
      });
  });

  test("reduce() should reduce array elements", () => {
    return verify({ timeout: 1000 })
      .step(() =>
        new AveAzul((resolve) => resolve([1, 2, 3, 4])).reduce(
          (acc, val) => acc + val,
          0
        )
      )
      .step((result) => {
        expect(result).toBe(10);
      });
  });

  test("reduce() should work without initial value", () => {
    return verify({ timeout: 1000 })
      .step(() =>
        new AveAzul((resolve) => resolve([1, 2, 3, 4])).reduce(
          (acc, val) => acc + val
        )
      )
      .step((result) => {
        expect(result).toBe(10);
      });
  });

  test("reduce() should handle promise elements", () => {
    const array = [
      1,
      Promise.resolve(2),
      3,
      AveAzul.resolve(4),
      Promise.resolve(5),
    ];
    return verify({ timeout: 1000 })
      .step(() =>
        new AveAzul((resolve) => resolve(array)).reduce((acc, val, idx) => {
          // Verify each value is resolved before being passed to the reducer
          expect(typeof val).toBe("number");
          expect(val).toBe(idx + 1); // Values should be 1,2,3,4,5
          return acc + val;
        }, 0)
      )
      .step((result) => {
        expect(result).toBe(15);
      })
      .step(() =>
        new AveAzul((resolve) => resolve(array)).reduce(
          (acc, val) => acc + val,
          Promise.resolve(10)
        )
      )
      .step((result2) => {
        expect(result2).toBe(25);
      })
      .step(() =>
        new AveAzul((resolve) => resolve(array)).reduce((acc, val) => {
          // Both acc and val should be resolved to numbers
          expect(typeof acc).toBe("number");
          expect(typeof val).toBe("number");
          return acc + val;
        })
      )
      .step((result3) => {
        expect(result3).toBe(15);
      });
  });

  test("throw() should return rejected promise", () => {
    const promise = new AveAzul<void>((resolve) => resolve()).throw(
      new Error("test")
    );
    return verify({ timeout: 1000 })
      .expectErrorHas("test").step(() => promise);
  });

  test("catchThrow() should catch and throw new error", () => {
    const promise = new AveAzul((resolve, reject) =>
      reject(new Error("original"))
    ).catchThrow(new Error("new error"));
    return verify({ timeout: 1000 })
      .expectErrorHas("new error").step(() => promise);
  });

  test("catchReturn() should catch and return value", () => {
    return verify({ timeout: 1000 })
      .step(() =>
        new AveAzul((resolve, reject) => reject(new Error("test"))).catchReturn(
          42
        )
      )
      .step((result) => {
        expect(result).toBe(42);
      });
  });

  test("get() should retrieve property value", () => {
    return verify({ timeout: 1000 })
      .step(() =>
        new AveAzul<{ a: number }>((resolve) => resolve({ a: 42 })).get("a")
      )
      .step((result) => {
        expect(result).toBe(42);
      });
  });

  test("get() should retrieve property value", () => {
    return verify({ timeout: 1000 })
      .step(() =>
        new AveAzul<{ a: number }>((resolve) => resolve({ a: 42 })).get("a")
      )
      .step((result) => {
        expect(result).toBe(42);
      });
  });

  test("get() should retrieve property value", () => {
    return verify({ timeout: 1000 })
      .step(() => new AveAzul<number[]>((resolve) => resolve([1, 2, 3])).get(1))
      .step((result) => {
        expect(result).toBe(2);
      });
  });
});
