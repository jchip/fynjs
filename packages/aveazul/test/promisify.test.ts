import { describe, test, it, expect } from "vitest";
import { verify } from "run-verify";
import AveAzul from "./promise-lib.ts";

describe("promisify", () => {
  test("should work with callback-style functions", () => {
    const fn = (cb) => cb(null, "success");

    return verify({ timeout: 1000 })
      .step(() => AveAzul.promisify(fn))
      .step((promisified) => promisified())
      .step((result) => {
        expect(result).toBe("success");
      });
  });

  test("should handle errors in callback-style functions", () => {
    const error = new Error("test error");
    const fn = (cb) => cb(error);
    const promisified = AveAzul.promisify(fn);
    return verify({ timeout: 500 })
      .expectErrorToBe("test error")
      .expectErrorInstanceMatch(Error)
      .step(() => promisified());
  });

  test("should handle functions with multiple arguments", () => {
    const fn = (a, b, cb) => cb(null, a + b);

    return verify({ timeout: 1000 })
      .step(() => AveAzul.promisify(fn))
      .step((promisified) => promisified(1, 2))
      .step((result) => {
        expect(result).toBe(3);
      });
  });

  test("should handle functions with no arguments", () => {
    const sig = "success " + Math.random();

    const original = function noArgs(cb) {
      cb(null, sig);
    };

    return verify({ timeout: 1000 })
      .step(() => {
        Object.defineProperty(original, "length", {
          value: 1,
          writable: false,
          configurable: false,
        });
      })
      .step(() => {
        Object.defineProperty(original, "name", {
          value: "noArgs",
          writable: false,
          configurable: false,
        });
      })
      .step(() => AveAzul.promisify(original))
      .step((promisified) => promisified())
      .step((result) => {
        expect(result).toBe(sig);
      });
  });

  test("should handle non-configurable properties", () => {
    const original = function testFn(cb) {};

    return verify({ timeout: 1000 })
      .step(() => {
        Object.defineProperty(original, "nonConfigurable", {
          value: "test",
          configurable: false,
          writable: false,
        });
      })
      .step(() => AveAzul.promisify(original))
      .step((promisified) => {
        expect(promisified).toBeDefined();
      });
  });

  test("should throw on non-function arguments", () => {
    const notFunctions = [
      null,
      undefined,
      42,
      "not a function",
      {},
    ] as unknown as ((...args: any[]) => void)[];
    return verify({ timeout: 1000 }).asyncStep(() =>
      notFunctions.map((notAFunction) =>
        verify({ timeout: 500 })
          .expectErrorInstanceMatch(TypeError)
          .step(() => AveAzul.promisify(notAFunction))
      )
    );
  });

  test("should handle context option", () => {
    const obj = {
      value: 42,
      method(cb) {
        cb(null, this.value);
      },
    };

    return verify({ timeout: 1000 })
      .step(() => AveAzul.promisify(obj.method, { context: obj }))
      .step((promisified) => promisified())
      .step((result) => {
        expect(result).toBe(42);
      });
  });

  test("should preserve properties from original function", () => {
    const original = Object.assign(function testFn(a, b, cb) {}, {
      someProperty: "value",
      anotherProperty: 42,
      nested: { prop: "nested value" },
    });
    let promisified: ((...args: any[]) => Promise<unknown>) &
      Partial<{
        someProperty: string;
        anotherProperty: number;
        nested: { prop: string };
      }>;

    return verify({ timeout: 1000 })
      .step(() => {
        promisified = AveAzul.promisify(original);
      })
      .step(() => {
        expect(promisified.someProperty).toBe("value");
        expect(promisified.anotherProperty).toBe(42);
        expect(promisified.nested).toBeDefined();
        expect(promisified.nested.prop).toBe("nested value");
        expect(typeof promisified).toBe("function");
      });
  });

  test("should preserve properties from fs.readFile-like functions", () => {
    const original = function readFile(path, options, cb) {};

    return verify({ timeout: 1000 })
      .step(() => {
        Object.defineProperty(original, "length", {
          value: 3,
          writable: false,
          configurable: false,
        });
      })
      .step(() => {
        Object.defineProperty(original, "name", {
          value: "readFile",
          writable: false,
          configurable: false,
        });
      })
      .step(() => AveAzul.promisify(original))
      .step((promisified) => expect(typeof promisified).toBe("function"));
  });

  test("should preserve properties from functions with no arguments", () => {
    const sig = "success " + Math.random();
    const original = function noArgs(cb) {
      cb(null, sig);
    };

    return verify({ timeout: 1000 })
      .step(() => {
        Object.defineProperty(original, "length", {
          value: 1,
          writable: false,
          configurable: false,
        });
      })
      .step(() => {
        Object.defineProperty(original, "name", {
          value: "noArgs",
          writable: false,
          configurable: false,
        });
      })
      .step(() => AveAzul.promisify(original))
      .step((promisified) => promisified())
      .step((result) => {
        expect(result).toBe(sig);
      });
  });

  it("should return the same function if already promisified", () => {
    const originalFn = (arg, cb) => cb(null, arg);
    const promisifiedFn = AveAzul.promisify(originalFn);

    // Promisify again
    const doublePromisifiedFn = AveAzul.promisify(promisifiedFn);

    return verify({ timeout: 500 })
      .step(() => expect(doublePromisifiedFn).toBe(promisifiedFn))
      .step(() => doublePromisifiedFn("test"))
      .step((result) => {
        expect(result).toBe("test");
      });
  });

  it("should promisify multiple times when __isPromisified__ throws", () => {
    // Create original function
    const fn = (cb) => cb(null, "success");

    // First promisification
    // promisify() stamps __isPromisified__ on the result; declared here because
    // this test deletes and redefines it.
    const promisified1: ((...args: any[]) => Promise<unknown>) &
      Partial<{ __isPromisified__: boolean }> = AveAzul.promisify(fn);

    // Delete the original __isPromisified__ property first
    delete promisified1.__isPromisified__;

    // Mock __isPromisified__ to throw on the promisified function
    Object.defineProperty(promisified1, "__isPromisified__", {
      get() {
        throw new Error("Accessing __isPromisified__");
      },
    });

    // Second promisification should create a new function since __isPromisified__ throws
    const promisified2 = AveAzul.promisify(promisified1);

    return verify({ timeout: 500 })
      .step(() => expect(promisified2).not.toBe(promisified1))
      .asyncStep(() => [promisified1(), promisified2()])
      .step(([result1, result2]) => {
        expect(result1).toBe("success");
        expect(result2).toBe("success");
      });
  });

  it("should handle multiArgs option correctly", () => {
    // Create a function that returns multiple results through callback
    const fn = (cb) => cb(null, "result1", "result2", "result3");

    // Promisify with multiArgs: false (default)
    const defaultPromisified = AveAzul.promisify(fn);
    const multiArgsPromisified = AveAzul.promisify(fn, { multiArgs: true });

    return verify({ timeout: 500 })
      .step(() => defaultPromisified())
      .step((defaultResult) => {
        // Should only return the first result
        expect(defaultResult).toBe("result1");
      })
      .step(() => multiArgsPromisified())
      .step((multiArgsResult) => {
        // Should return all results as an array
        expect(Array.isArray(multiArgsResult)).toBe(true);
        expect(multiArgsResult).toEqual(["result1", "result2", "result3"]);
      });
  });
});
