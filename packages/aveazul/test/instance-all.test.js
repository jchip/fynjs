"use strict";

const AveAzul = require("./promise-lib");

describe("AveAzul.prototype.all", () => {
  test("should resolve an array of promises", async () => {
    const result = await AveAzul.resolve([
      AveAzul.resolve(1),
      AveAzul.resolve(2),
      AveAzul.resolve(3),
    ]).all();

    expect(result).toEqual([1, 2, 3]);
  });

  test("should handle mix of promises and values", async () => {
    const result = await AveAzul.resolve([1, AveAzul.resolve(2), 3]).all();

    expect(result).toEqual([1, 2, 3]);
  });

  test("should reject if any promise rejects", async () => {
    const error = new Error("Test error");

    await expect(
      AveAzul.resolve([
        AveAzul.resolve(1),
        AveAzul.reject(error),
        AveAzul.resolve(3),
      ]).all()
    ).rejects.toThrow("Test error");
  });

  test("should handle empty arrays", async () => {
    const result = await AveAzul.resolve([]).all();
    expect(result).toEqual([]);
  });

  test("should handle iterables", async () => {
    const set = new Set([1, AveAzul.resolve(2), 3]);
    const result = await AveAzul.resolve(set).all();
    expect(result).toEqual([1, 2, 3]);
  });

  test("should throw if not an array or iterable", async () => {
    await expect(AveAzul.resolve(123).all()).rejects.toThrow(
      /expecting an array or an iterable object/
    );
  });

  test("should handle nested promises", async () => {
    const nestedPromise = AveAzul.resolve(
      AveAzul.resolve([AveAzul.resolve(1), AveAzul.resolve(2)])
    );

    const result = await nestedPromise.all();
    expect(result).toEqual([1, 2]);
  });

  test("should handle promises that resolve after different delays", async () => {
    const promises = [
      new AveAzul((resolve) => setTimeout(() => resolve("first"), 30)),
      new AveAzul((resolve) => setTimeout(() => resolve("second"), 10)),
      new AveAzul((resolve) => setTimeout(() => resolve("third"), 20)),
    ];

    const result = await AveAzul.resolve(promises).all();
    expect(result).toEqual(["first", "second", "third"]);
  });
});
