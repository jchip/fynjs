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
    const sideEffect = jest.fn();
    const result = await new AveAzul((resolve) => resolve([1, 2, 3])).each(
      sideEffect
    );

    expect(sideEffect).toHaveBeenCalledTimes(3);
    expect(sideEffect).toHaveBeenNthCalledWith(1, 1, 0);
    expect(sideEffect).toHaveBeenNthCalledWith(2, 2, 1);
    expect(sideEffect).toHaveBeenNthCalledWith(3, 3, 2);
    expect(result).toBeUndefined();
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

    await expect(promise).rejects.toThrow("Operation timed out");
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
    const result = await new AveAzul((resolve) => resolve()).props({
      a: Promise.resolve(1),
      b: Promise.resolve(2),
      c: 3,
    });

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
    const result = await new AveAzul((resolve) =>
      resolve({ a: { b: 42 } })
    ).get("a.b");

    expect(result).toBe(42);
  });

  test("get() should throw on null/undefined value", async () => {
    const promise = new AveAzul((resolve) => resolve(null)).get("a.b");

    await expect(promise).rejects.toThrow("Cannot read property 'a.b' of null");
  });

  test("get() should throw on undefined property", async () => {
    const promise = new AveAzul((resolve) => resolve({})).get("a.b");

    await expect(promise).rejects.toThrow(
      "Cannot read property 'b' of undefined"
    );
  });

  test("get() should handle intermediate null/undefined values", async () => {
    const promise = new AveAzul((resolve) => resolve({ a: null })).get("a.b");

    await expect(promise).rejects.toThrow("Cannot read property 'b' of null");
  });
});
