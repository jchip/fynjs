"use strict";

const AveAzul = require("./promise-lib");

describe("static methods", () => {
  test("reduce() should handle empty array without initial value and return undefined", async () => {
    const fn = jest.fn();
    const result = await AveAzul.reduce([], fn);
    expect(fn).not.toHaveBeenCalled();
    expect(result).toBe(undefined);
  });

  test("reduce() should handle empty array with initial value", async () => {
    const result = await AveAzul.reduce([], (acc, val) => acc + val, 10);
    expect(result).toBe(10);
  });

  test("reduce() should handle array with one element without initial value", async () => {
    const fn = jest.fn(() => {});
    const result = await AveAzul.reduce([42], fn);
    expect(fn).not.toHaveBeenCalled();
    expect(result).toBe(42);
  });

  test("reduce() should handle array with one element with initial value", async () => {
    const fn = jest.fn((acc, val) => acc + val);
    const result = await AveAzul.reduce([42], fn, 10);
    expect(fn).toHaveBeenCalledWith(10, 42, 0, 1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toBe(52);
  });

  test("reduce() should handle array with multiple elements without initial value", async () => {
    const fn = jest.fn((acc, val) => (acc === undefined ? val : acc + val));
    const result = await AveAzul.reduce([1, 2, 3], fn);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, 1, 2, 1, 3);
    expect(fn).toHaveBeenNthCalledWith(2, 3, 3, 2, 3);
    expect(result).toBe(6);
  });

  test("reduce() should handle array with multiple elements with initial value", async () => {
    const fn = jest.fn((acc, val) => acc + val);
    const result = await AveAzul.reduce([1, 2, 3], fn, 10);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(fn).toHaveBeenNthCalledWith(1, 10, 1, 0, 3);
    expect(fn).toHaveBeenNthCalledWith(2, 11, 2, 1, 3);
    expect(fn).toHaveBeenNthCalledWith(3, 13, 3, 2, 3);
    expect(result).toBe(16);
  });

  test("try() should handle synchronous functions", async () => {
    const result = await AveAzul.try(() => 42);
    expect(result).toBe(42);
  });

  test("try() should handle asynchronous functions", async () => {
    const result = await AveAzul.try(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  test("try() should handle errors", async () => {
    const promise = AveAzul.try(() => {
      throw new Error("test error");
    });
    await expect(promise).rejects.toThrow("test error");
  });

  test("props() should resolve object properties", async () => {
    const result = await AveAzul.props({
      a: Promise.resolve(1),
      b: Promise.resolve(2),
      c: 3,
    });

    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });

  test("reduce() should reduce array elements", async () => {
    const result = await AveAzul.reduce(
      [1, 2, 3, 4],
      (acc, val) => acc + val,
      0
    );
    expect(result).toBe(10);
  });

  test("reduce() should work without initial value", async () => {
    const result = await AveAzul.reduce(
      [1, 2, 3, 4],
      (acc, val) => acc + val,
      0
    );
    expect(result).toBe(10);
  });

  test("defer() should create a deferred promise", async () => {
    const deferred = AveAzul.defer();
    expect(deferred.promise).toBeInstanceOf(AveAzul);
    expect(typeof deferred.resolve).toBe("function");
    expect(typeof deferred.reject).toBe("function");

    // Test resolving
    deferred.resolve(42);
    const result = await deferred.promise;
    expect(result).toBe(42);
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
    const result = await AveAzul.each(items, (value, index, length) => {
      // Verify each value is resolved
      expect(typeof value).toBe("number");
      processedValues.push(value);

      // Verify the correct index and length are passed
      expect(index).toBe(processedValues.length - 1);
      expect(length).toBe(items.length);
    });

    // Verify all values were correctly resolved and processed
    expect(processedValues).toEqual([1, 2, 3, 4, 5]);

    // Verify the original array is returned
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });
});
