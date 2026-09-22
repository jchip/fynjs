import { verify } from "run-verify";
import { describe, test, expect } from "vitest";
import AveAzul from "./promise-lib.ts";

describe("AveAzul.prototype.spread", () => {
  test("should spread array values as arguments to the handler", async () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.resolve([1, 2, 3]).spread((a, b, c) => a + b + c))
      .step((result) => {
        expect(result).toBe(6);
      });
  });

  test("should work with Promise.all", async () => {
    return verify({ timeout: 1000 })
      .step(() =>
        AveAzul.all([
          AveAzul.resolve(1),
          AveAzul.resolve(2),
          AveAzul.resolve(3),
        ]).spread((a, b, c) => a + b + c)
      )
      .step((result) => {
        expect(result).toBe(6);
      });
  });

  test("should work with fewer arguments than array elements", async () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.resolve([1, 2, 3, 4]).spread((a, b) => a + b))
      .step((result) => {
        expect(result).toBe(3); // Only uses the first two elements
      });
  });

  test("should work with more arguments than array elements", async () => {
    return verify({ timeout: 1000 })
      .step(() =>
        AveAzul.resolve([1, 2]).spread((a, b, c) => {
          // c will be undefined
          return a + b + (c || 0);
        })
      )
      .step((result) => {
        expect(result).toBe(3);
      });
  });

  test("should work with empty arrays", async () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.resolve([]).spread(() => 42))
      .step((result) => {
        expect(result).toBe(42);
      });
  });

  test("should throw if not given a function", async () => {
    // Deliberately the wrong type: the runtime check under test is what rejects
    // a non-function handler, and the signature already forbids one.
    const notAFunction = "not a function" as unknown as (
      ...args: unknown[]
    ) => unknown;
    return verify({ timeout: 1000 })
      .expectError.step(() => AveAzul.resolve([1, 2, 3]).spread(notAFunction))
      .step((error) => {
        expect(() => {
          throw error;
        }).toThrow("expecting a function but");
      });
  });

  test("should propagate errors from the handler function", async () => {
    return verify({ timeout: 1000 })
      .expectError.step(() =>
        AveAzul.resolve([1, 2, 3]).spread(() => {
          throw new Error("handler error");
        })
      )
      .step((error) => {
        expect(() => {
          throw error;
        }).toThrow("handler error");
      });
  });

  test("should handle asynchronous handler functions", async () => {
    return verify({ timeout: 1000 })
      .step(() =>
        AveAzul.resolve([1, 2]).spread(async (a, b) => {
          const c = await AveAzul.resolve(3);
          return a + b + c;
        })
      )
      .step((result) => {
        expect(result).toBe(6);
      });
  });

  test("should handle array with non-primitive values", async () => {
    const obj1 = { value: 1 };
    const obj2 = { value: 2 };

    return verify({ timeout: 1000 })
      .step(() =>
        AveAzul.resolve([obj1, obj2]).spread((a, b) => {
          return a.value + b.value;
        })
      )
      .step((result) => {
        expect(result).toBe(3);
      });
  });

  test("should await promises within arrays", async () => {
    return verify({ timeout: 1000 })
      .step(() =>
        AveAzul.resolve([
          AveAzul.resolve(1),
          AveAzul.resolve(2),
          AveAzul.resolve(3),
        ]).spread((a, b, c) => a + b + c)
      )
      .step((result) => {
        expect(result).toBe(6);
      });
  });
});
