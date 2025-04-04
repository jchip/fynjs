"use strict";

const AveAzul = require("../lib/aveazul");

describe("AveAzul.prototype.spread", () => {
  test("should spread array values as arguments to the handler", async () => {
    const result = await AveAzul.resolve([1, 2, 3]).spread(
      (a, b, c) => a + b + c
    );
    expect(result).toBe(6);
  });

  test("should work with Promise.all", async () => {
    const result = await AveAzul.all([
      AveAzul.resolve(1),
      AveAzul.resolve(2),
      AveAzul.resolve(3),
    ]).spread((a, b, c) => a + b + c);

    expect(result).toBe(6);
  });

  test("should work with fewer arguments than array elements", async () => {
    const result = await AveAzul.resolve([1, 2, 3, 4]).spread((a, b) => a + b);
    expect(result).toBe(3); // Only uses the first two elements
  });

  test("should work with more arguments than array elements", async () => {
    const result = await AveAzul.resolve([1, 2]).spread((a, b, c) => {
      // c will be undefined
      return a + b + (c || 0);
    });

    expect(result).toBe(3);
  });

  test("should work with empty arrays", async () => {
    const result = await AveAzul.resolve([]).spread(() => 42);
    expect(result).toBe(42);
  });

  test("should throw if not given a function", async () => {
    await expect(() =>
      AveAzul.resolve([1, 2, 3]).spread("not a function")
    ).rejects.toThrow("expecting a function but");
  });

  test("should handle non-array values as a single argument", async () => {
    const result = await AveAzul.resolve(42).spread((x) => x * 2);
    expect(result).toBe(84);
  });

  test("should propagate errors from the handler function", async () => {
    await expect(
      AveAzul.resolve([1, 2, 3]).spread(() => {
        throw new Error("handler error");
      })
    ).rejects.toThrow("handler error");
  });

  test("should handle asynchronous handler functions", async () => {
    const result = await AveAzul.resolve([1, 2]).spread(async (a, b) => {
      const c = await AveAzul.resolve(3);
      return a + b + c;
    });

    expect(result).toBe(6);
  });

  test("should handle array with non-primitive values", async () => {
    const obj1 = { value: 1 };
    const obj2 = { value: 2 };

    const result = await AveAzul.resolve([obj1, obj2]).spread((a, b) => {
      return a.value + b.value;
    });

    expect(result).toBe(3);
  });

  test("should await promises within arrays", async () => {
    const result = await AveAzul.resolve([
      AveAzul.resolve(1),
      AveAzul.resolve(2),
      AveAzul.resolve(3),
    ]).spread((a, b, c) => a + b + c);

    expect(result).toBe(6);
  });
});
