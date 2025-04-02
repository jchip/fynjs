"use strict";

const AveAzul = require("./promise-lib");

describe("promisify", () => {
  test("should work with callback-style functions", async () => {
    const fn = (cb) => cb(null, "success");
    const promisified = AveAzul.promisify(fn);
    const result = await promisified();
    expect(result).toBe("success");
  });

  test("should handle errors in callback-style functions", async () => {
    const error = new Error("test error");
    const fn = (cb) => cb(error);
    const promisified = AveAzul.promisify(fn);
    try {
      await promisified();
      throw new Error("error expected but not thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe("test error");
    }
  });

  test("should handle functions with multiple arguments", async () => {
    const fn = (a, b, cb) => cb(null, a + b);
    const promisified = AveAzul.promisify(fn);
    const result = await promisified(1, 2);
    expect(result).toBe(3);
  });

  test("should handle functions with no arguments", async () => {
    const sig = "success " + Math.random();

    const original = function noArgs(cb) {
      cb(null, sig);
    };

    Object.defineProperty(original, "length", {
      value: 1,
      writable: false,
      configurable: false,
    });
    Object.defineProperty(original, "name", {
      value: "noArgs",
      writable: false,
      configurable: false,
    });
    const promisified = AveAzul.promisify(original);

    const result = await promisified();
    expect(result).toBe(sig);

    //
    // bluebird returns 3 and "ret", so not verifying these
    //
    // expect(promisified.length).toBe(1);
    // expect(promisified.name).toBe("noArgs");
  });

  test("should handle non-configurable properties", () => {
    const original = function testFn(cb) {};
    Object.defineProperty(original, "nonConfigurable", {
      value: "test",
      configurable: false,
      writable: false,
    });

    // This should not throw even though the property can't be copied
    const promisified = AveAzul.promisify(original);
    expect(promisified).toBeDefined();
  });

  test("should throw on non-function arguments", () => {
    expect(() => AveAzul.promisify(null)).toThrow(TypeError);
    expect(() => AveAzul.promisify(undefined)).toThrow(TypeError);
    expect(() => AveAzul.promisify(42)).toThrow(TypeError);
    expect(() => AveAzul.promisify("not a function")).toThrow(TypeError);
    expect(() => AveAzul.promisify({})).toThrow(TypeError);
  });

  test("should handle context option", async () => {
    const obj = {
      value: 42,
      method(cb) {
        cb(null, this.value);
      },
    };
    const promisified = AveAzul.promisify(obj.method, { context: obj });
    const result = await promisified();
    expect(result).toBe(42);
  });

  test("should preserve properties from original function", () => {
    const original = function testFn(a, b, cb) {};
    original.someProperty = "value";
    original.anotherProperty = 42;
    original.nested = {
      prop: "nested value",
    };

    const promisified = AveAzul.promisify(original);

    // Test basic properties
    expect(promisified.someProperty).toBe("value");
    expect(promisified.anotherProperty).toBe(42);

    // Test nested properties
    expect(promisified.nested).toBeDefined();
    expect(promisified.nested.prop).toBe("nested value");

    // Test function properties
    expect(promisified.length).toBe(3); // Original function's length

    // bluebird returns "ret" - not verifying this
    // expect(promisified.name).toBe("testFn"); // Original function's name

    // Test that the promisified function still works
    expect(typeof promisified).toBe("function");
  });

  test("should preserve properties from fs.readFile-like functions", () => {
    const original = function readFile(path, options, cb) {};
    Object.defineProperty(original, "length", {
      value: 3,
      writable: false,
      configurable: false,
    });
    Object.defineProperty(original, "name", {
      value: "readFile",
      writable: false,
      configurable: false,
    });
    const promisified = AveAzul.promisify(original);

    expect(promisified.length).toBe(3);
    // bluebird returns "ret" - not verifying this
    // expect(promisified.name).toBe("readFile");
  });

  test("should preserve properties from functions with no arguments", async () => {
    const sig = "success " + Math.random();
    const original = function noArgs(cb) {
      cb(null, sig);
    };
    Object.defineProperty(original, "length", {
      value: 1,
      writable: false,
      configurable: false,
    });
    Object.defineProperty(original, "name", {
      value: "noArgs",
      writable: false,
      configurable: false,
    });
    const promisified = AveAzul.promisify(original);

    const result = await promisified();
    expect(result).toBe(sig);

    // bluebird returns 3 and "ret", so not verifying these
    // expect(promisified.length).toBe(1);
    // expect(promisified.name).toBe("noArgs");
  });

  it("should return the same function if already promisified", () => {
    const originalFn = (arg, cb) => cb(null, arg);
    const promisifiedFn = AveAzul.promisify(originalFn);

    // Promisify again
    const doublePromisifiedFn = AveAzul.promisify(promisifiedFn);

    // Should be the same function reference
    expect(doublePromisifiedFn).toBe(promisifiedFn);

    // Should still work correctly
    return doublePromisifiedFn("test").then((result) => {
      expect(result).toBe("test");
    });
  });

  it("should promisify multiple times when __isPromisified__ throws", () => {
    // Create original function
    const fn = (cb) => cb(null, "success");

    // First promisification
    const promisified1 = AveAzul.promisify(fn);

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

    // They should be different function references since each promisification creates a new wrapper
    expect(promisified2).not.toBe(promisified1);

    // Both should work correctly
    return Promise.all([
      promisified1().then((result) => expect(result).toBe("success")),
      promisified2().then((result) => expect(result).toBe("success")),
    ]);
  });

  it("should handle multiArgs option correctly", async () => {
    // Create a function that returns multiple results through callback
    const fn = (cb) => cb(null, "result1", "result2", "result3");

    // Promisify with multiArgs: false (default)
    const defaultPromisified = AveAzul.promisify(fn);
    const defaultResult = await defaultPromisified();
    // Should only return the first result
    expect(defaultResult).toBe("result1");

    // Promisify with multiArgs: true
    const multiArgsPromisified = AveAzul.promisify(fn, { multiArgs: true });
    const multiArgsResult = await multiArgsPromisified();
    // Should return all results as an array
    expect(Array.isArray(multiArgsResult)).toBe(true);
    expect(multiArgsResult).toEqual(["result1", "result2", "result3"]);
  });
});
