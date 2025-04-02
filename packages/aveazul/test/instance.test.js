"use strict";
const AveAzul = require("./promise-lib");

describe("instance methods", () => {
  test("tap() should execute side effects and return original value", async () => {
    const sideEffect = jest.fn();
    const result = await new AveAzul((resolve) => resolve(42)).tap(sideEffect);

    expect(sideEffect).toHaveBeenCalledWith(42);
    expect(result).toBe(42);
  });

  test("filter() should filter array elements", async () => {
    const result = await new AveAzul((resolve) =>
      resolve([1, 2, 3, 4, 5])
    ).filter((x) => x % 2 === 0);

    expect(result).toEqual([2, 4]);
  });

  test("map() should transform array elements", async () => {
    const result = await new AveAzul((resolve) => resolve([1, 2, 3])).map(
      (x) => x * 2
    );

    expect(result).toEqual([2, 4, 6]);
  });

  test("return() should inject a new value", async () => {
    const result = await new AveAzul((resolve) => resolve(42)).return(100);

    expect(result).toBe(100);
  });

  test("each() should iterate over array elements", async () => {
    const calls = [];
    const arr = [1, 2, 3];
    const result = await new AveAzul((resolve) => resolve(arr)).each(
      (a, b, c) => {
        calls.push([a, b, c]);
      }
    );

    // bluebird calls with value, int index, int arrayLength

    expect(calls).toEqual([
      [1, 0, 3],
      [2, 1, 3],
      [3, 2, 3],
    ]);
    expect(result).toEqual(arr);
  });

  test("delay() should delay resolution", async () => {
    const start = Date.now();
    await new AveAzul((resolve) => resolve(42)).delay(101);
    const duration = Date.now() - start;

    expect(duration).toBeGreaterThanOrEqual(100);
  });

  test("timeout() should reject after specified time", async () => {
    const promise = new AveAzul((resolve) =>
      setTimeout(() => resolve(42), 100)
    ).timeout(50);

    await expect(promise).rejects.toThrow("operation timed out");
  });

  test("timeout() should resolve if operation completes in time", async () => {
    const result = await new AveAzul((resolve) =>
      setTimeout(() => resolve(42), 50)
    ).timeout(100);

    expect(result).toBe(42);
  });

  test("timeout() should handle rejection", async () => {
    const error = new Error("test");
    const promise = new AveAzul((resolve, reject) =>
      setTimeout(() => reject(error), 50)
    ).timeout(100);

    await expect(promise).rejects.toBe(error);
  });

  test("props() should resolve object properties", async () => {
    const result = await new AveAzul((resolve) =>
      resolve({
        a: Promise.resolve(1),
        b: Promise.resolve(2),
        c: 3,
      })
    ).props();

    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });

  test("tapCatch() should execute side effects on rejection", async () => {
    const sideEffect = jest.fn();
    const promise = new AveAzul((resolve, reject) =>
      reject(new Error("test"))
    ).tapCatch(sideEffect);

    await expect(promise).rejects.toThrow("test");
    expect(sideEffect).toHaveBeenCalled();
  });

  test("reduce() should reduce array elements", async () => {
    const result = await new AveAzul((resolve) => resolve([1, 2, 3, 4])).reduce(
      (acc, val) => acc + val,
      0
    );

    expect(result).toBe(10);
  });

  test("reduce() should work without initial value", async () => {
    const result = await new AveAzul((resolve) => resolve([1, 2, 3, 4])).reduce(
      (acc, val) => acc + val,
      0
    );

    expect(result).toBe(10);
  });

  test("throw() should return rejected promise", async () => {
    const promise = new AveAzul((resolve) => resolve()).throw(
      new Error("test")
    );

    await expect(promise).rejects.toThrow("test");
  });

  test("catchThrow() should catch and throw new error", async () => {
    const promise = new AveAzul((resolve, reject) =>
      reject(new Error("original"))
    ).catchThrow(new Error("new error"));

    await expect(promise).rejects.toThrow("new error");
  });

  test("catchReturn() should catch and return value", async () => {
    const result = await new AveAzul((resolve, reject) =>
      reject(new Error("test"))
    ).catchReturn(42);

    expect(result).toBe(42);
  });

  test("get() should retrieve property value", async () => {
    const result = await new AveAzul((resolve) => resolve({ a: 42 })).get("a");

    expect(result).toBe(42);
  });

  test("get() should retrieve property value", async () => {
    const result = await new AveAzul((resolve) => resolve({ a: 42 })).get("a");

    expect(result).toBe(42);
  });

  test("get() should retrieve property value", async () => {
    const result = await new AveAzul((resolve) => resolve([1, 2, 3])).get(1);

    expect(result).toBe(2);
  });
});
