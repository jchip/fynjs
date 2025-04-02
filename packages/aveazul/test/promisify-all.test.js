"use strict";

const AveAzul = require("./promise-lib");

describe("AveAzul.promisifyAll", () => {
  test("should promisify all methods of an object", async () => {
    const obj = {
      method1(cb) {
        cb(null, "result1");
      },
      method2(a, b, cb) {
        cb(null, a + b);
      },
      _privateMethod(cb) {
        cb(null, "private");
      },
    };

    AveAzul.promisifyAll(obj);

    const result1 = await obj.method1Async();
    const result2 = await obj.method2Async(1, 2);

    expect(result1).toBe("result1");
    expect(result2).toBe(3);
    expect(obj._privateMethodAsync).toBeUndefined();
  });

  test("should promisify all methods of a class prototype", async () => {
    class MyClass {
      method1(cb) {
        cb(null, "result1");
      }
      method2(a, b, cb) {
        cb(null, a + b);
      }
      _privateMethod(cb) {
        cb(null, "private");
      }
    }

    const instance = new MyClass();
    AveAzul.promisifyAll(instance);
    const result1 = await instance.method1Async();
    const result2 = await instance.method2Async(1, 2);

    expect(result1).toBe("result1");
    expect(result2).toBe(3);
    expect(instance._privateMethodAsync).toBeUndefined();
  });

  test("should respect custom suffix option", async () => {
    const obj = {
      method(cb) {
        cb(null, "result");
      },
    };

    AveAzul.promisifyAll(obj, { suffix: "Promise" });

    const result = await obj.methodPromise();
    expect(result).toBe("result");
    expect(obj.methodAsync).toBeUndefined();
  });

  test("should respect custom filter option", async () => {
    const obj = {
      method1(cb) {
        cb(null, "result1");
      },
      method2(cb) {
        cb(null, "result2");
      },
    };

    AveAzul.promisifyAll(obj, {
      filter: (name) => name === "method1",
    });

    const result = await obj.method1Async();
    expect(result).toBe("result1");
    expect(obj.method2Async).toBeUndefined();
  });

  test("should handle multiArgs option", async () => {
    const obj = {
      method(cb) {
        cb(null, "result1", "result2");
      },
    };

    AveAzul.promisifyAll(obj, { multiArgs: true });

    const [result1, result2] = await obj.methodAsync();
    expect(result1).toBe("result1");
    expect(result2).toBe("result2");
  });

  test("should throw on invalid target", () => {
    // expect(() => AveAzul.promisifyAll(null)).toThrow(TypeError);
    expect(() => AveAzul.promisifyAll(undefined)).toThrow(TypeError);
    expect(() => AveAzul.promisifyAll(42)).toThrow(TypeError);
  });

  test("should throw when methods end in Async", () => {
    const obj = {
      method(cb) {
        cb(null, "result");
      },
      methodAsync(cb) {
        cb(null, "result");
      },
    };
    expect(() => AveAzul.promisifyAll(obj)).toThrow(
      "Cannot promisify an API that has normal methods with 'Async'-suffix"
    );
  });

  test("should not promisify invalid JavaScript identifiers", () => {
    const obj = {
      "123method"(cb) {
        cb(null, "result");
      },
      "method-name"(cb) {
        cb(null, "result");
      },
      "method.name"(cb) {
        cb(null, "result");
      },
    };
    AveAzul.promisifyAll(obj);
    expect(obj["123methodAsync"]).toBeUndefined();
    expect(obj["method-nameAsync"]).toBeUndefined();
    expect(obj["method.nameAsync"]).toBeUndefined();
  });

  test("should support custom promisifier", async () => {
    const obj = {
      method(a, b, cb) {
        cb(null, a + b);
      },
    };

    AveAzul.promisifyAll(obj, {
      promisifier: (fn) => {
        return (...args) => {
          return new AveAzul((resolve) => {
            fn(...args, (err, result) => {
              // Custom promisifier that ignores errors
              resolve(result * 2);
            });
          });
        };
      },
    });

    const result = await obj.methodAsync(2, 3);
    expect(result).toBe(10); // (2 + 3) * 2
  });

  test("should return AveAzul instances", async () => {
    const obj = {
      method(cb) {
        cb(null, "result1", "result2");
      },
    };

    AveAzul.promisifyAll(obj, { multiArgs: true });

    const promise = obj.methodAsync();
    expect(promise).toBeInstanceOf(AveAzul);

    const [result1, result2] = await promise;
    expect(result1).toBe("result1");
    expect(result2).toBe("result2");
  });

  test("should handle multiArgs option with error", async () => {
    const error = new Error("test error");
    const obj = {
      method(cb) {
        cb(error);
      },
    };

    AveAzul.promisifyAll(obj, { multiArgs: true });

    // bluebird rejects OperationError that wraps the error as cause
    await expect(obj.methodAsync()).rejects.toBeInstanceOf(Error);
  });

  test("should handle multiArgs option with custom promisifier", async () => {
    const obj = {
      method(cb) {
        cb(null, "result1", "result2", "result3");
      },
    };

    AveAzul.promisifyAll(obj, {
      multiArgs: true,
      promisifier: (fn, context, multiArgs) => {
        return (...args) => {
          return new AveAzul((resolve, reject) => {
            args.push((err, ...results) => {
              if (err) reject(err);
              else resolve(results.map((r) => r.toUpperCase()));
            });
            fn.apply(context, args);
          });
        };
      },
    });

    const promise = obj.methodAsync();
    expect(promise).toBeInstanceOf(AveAzul);
    const results = await promise;
    expect(results).toEqual(["RESULT1", "RESULT2", "RESULT3"]);
  });

  test("should throw RangeError when suffix is not a valid identifier", () => {
    const obj = {
      method(cb) {
        cb(null, "result");
      },
    };

    expect(() =>
      AveAzul.promisifyAll(obj, { suffix: "Invalid-Suffix" })
    ).toThrow(RangeError);
    expect(() => AveAzul.promisifyAll(obj, { suffix: "123" })).toThrow(
      RangeError
    );
    expect(() => AveAzul.promisifyAll(obj, { suffix: "$valid" })).not.toThrow();
  });
});
