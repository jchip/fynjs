import { verify } from "run-verify";
import { describe, test, expect, vi } from "vitest";
import AveAzul from "./promise-lib.ts";

describe("static methods", () => {
  test("reduce() should handle empty array without initial value and return undefined", async () => {
    const fn = vi.fn();
    return verify({ timeout: 1000 })
      .step(() => AveAzul.reduce([], fn))
      .step((result) => {
        expect(fn).not.toHaveBeenCalled();
        expect(result).toBe(undefined);
      });
  });

  test("reduce() should handle empty array with initial value", async () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.reduce([], (acc, val) => acc + val, 10))
      .step((result) => {
        expect(result).toBe(10);
      });
  });

  test("reduce() should handle array with one element without initial value", async () => {
    const fn = vi.fn(() => {});
    return verify({ timeout: 1000 })
      .step(() => AveAzul.reduce([42], fn))
      .step((result) => {
        expect(fn).not.toHaveBeenCalled();
        expect(result).toBe(42);
      });
  });

  test("reduce() should handle array with one element with initial value", async () => {
    const fn = vi.fn((acc, val) => acc + val);
    return verify({ timeout: 1000 })
      .step(() => AveAzul.reduce([42], fn, 10))
      .step((result) => {
        expect(fn).toHaveBeenCalledWith(10, 42, 0, 1);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(result).toBe(52);
      });
  });

  test("reduce() should handle array with multiple elements without initial value", async () => {
    const fn = vi.fn((acc, val) => (acc === undefined ? val : acc + val));
    return verify({ timeout: 1000 })
      .step(() => AveAzul.reduce([1, 2, 3], fn))
      .step((result) => {
        expect(fn).toHaveBeenCalledTimes(2);
        expect(fn).toHaveBeenNthCalledWith(1, 1, 2, 1, 3);
        expect(fn).toHaveBeenNthCalledWith(2, 3, 3, 2, 3);
        expect(result).toBe(6);
      });
  });

  test("reduce() should handle array with multiple elements with initial value", async () => {
    const fn = vi.fn((acc, val) => acc + val);
    return verify({ timeout: 1000 })
      .step(() => AveAzul.reduce([1, 2, 3], fn, 10))
      .step((result) => {
        expect(fn).toHaveBeenCalledTimes(3);
        expect(fn).toHaveBeenNthCalledWith(1, 10, 1, 0, 3);
        expect(fn).toHaveBeenNthCalledWith(2, 11, 2, 1, 3);
        expect(fn).toHaveBeenNthCalledWith(3, 13, 3, 2, 3);
        expect(result).toBe(16);
      });
  });

  test("try() should handle synchronous functions", async () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.try(() => 42))
      .step((result) => {
        expect(result).toBe(42);
      });
  });

  test("try() should handle asynchronous functions", async () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.try(() => Promise.resolve(42)))
      .step((result) => {
        expect(result).toBe(42);
      });
  });

  test("try() should handle errors", async () => {
    return verify({ timeout: 1000 })
      .expectErrorHas("test error").step(() =>
        AveAzul.try(() => {
          throw new Error("test error");
        })
      );
  });

  test("props() should resolve object properties", async () => {
    return verify({ timeout: 1000 })
      .step(() =>
        AveAzul.props({
          a: Promise.resolve(1),
          b: Promise.resolve(2),
          c: 3,
        })
      )
      .step((result) => {
        expect(result).toEqual({ a: 1, b: 2, c: 3 });
      });
  });

  test("reduce() should reduce array elements", async () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.reduce([1, 2, 3, 4], (acc, val) => acc + val, 0))
      .step((result) => {
        expect(result).toBe(10);
      });
  });

  test("reduce() should work without initial value", async () => {
    return verify({ timeout: 1000 })
      .step(() =>
        AveAzul.reduce<number, number>([1, 2, 3, 4], (acc, val) => acc + val)
      )
      .step((result) => {
        expect(result).toBe(10);
      });
  });

  test("reduce() should handle array with promise elements", async () => {
    // Array with both regular values and promises
    const array = [
      1,
      Promise.resolve(2),
      3,
      AveAzul.resolve(4),
      Promise.resolve(5),
    ];

    return (
      verify({ timeout: 1000 })
        .step(() =>
          AveAzul.reduce(
            array,
            (acc, val) => {
              // Verify the promises are resolved before reaching the reducer function
              expect(typeof val).toBe("number");
              return acc + val;
            },
            0
          )
        )
        .step((result) => expect(result).toBe(15))

        // Test without initial value
        .step(() =>
          AveAzul.reduce<number, number>(array, (acc, val) => {
            // Verify the promises are resolved
            expect(typeof val).toBe("number");
            expect(typeof acc).toBe("number");
            return acc + val;
          })
        )
        .step((result) => expect(result).toBe(15))
    );
  });

  test("defer() should create a deferred promise", async () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.defer())
      .keep.step((deferred) => {
        expect(deferred.promise).toBeInstanceOf(AveAzul);
        expect(typeof deferred.resolve).toBe("function");
        expect(typeof deferred.reject).toBe("function");
      })
      .step((deferred) => {
        deferred.resolve(42);
        return deferred.promise;
      })
      .step((result) => {
        expect(result).toBe(42);
      });
  });

  test("each() should handle array with promise elements", async () => {
    // Create array with regular values and promises
    const items = [
      1,
      Promise.resolve(2),
      3,
      AveAzul.resolve(4),
      Promise.resolve(5),
    ];

    const processedValues = [];

    // Call each() and collect processed values
    return verify({ timeout: 1000 })
      .step(() =>
        AveAzul.each(items, (value, index, length) => {
          // Verify each value is resolved
          expect(typeof value).toBe("number");
          processedValues.push(value);

          // Verify the correct index and length are passed
          expect(index).toBe(processedValues.length - 1);
          expect(length).toBe(items.length);
        })
      )
      .step((result) => {
        // Verify all values were correctly resolved and processed
        expect(processedValues).toEqual([1, 2, 3, 4, 5]);

        // Verify the original array is returned
        expect(result).toEqual([1, 2, 3, 4, 5]);
      });
  });
});
