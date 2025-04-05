"use strict";

const AveAzul = require("./promise-lib");

describe("AveAzul.prototype.any", () => {
  test("should resolve with the first resolved promise", async () => {
    const slowPromise = AveAzul.delay(50).then(() => "slow");
    const fastPromise = AveAzul.delay(10).then(() => "fast");

    const result = await AveAzul.resolve([slowPromise, fastPromise]).any();
    expect(result).toBe("fast");
  });

  test("should work with array of values and promises", async () => {
    const result = await AveAzul.resolve([
      AveAzul.delay(30).then(() => "delayed"),
      "immediate",
      AveAzul.delay(10).then(() => "fast"),
    ]).any();

    expect(result).toBe("immediate");
  });

  test("should work with iterable objects", async () => {
    const iterable = {
      *[Symbol.iterator]() {
        yield AveAzul.delay(30).then(() => "first");
        yield "second";
        yield AveAzul.delay(10).then(() => "third");
      },
    };

    const result = await AveAzul.resolve(iterable).any();
    expect(result).toBe("second");
  });

  test("should reject with an error when all promises reject", async () => {
    const promises = [
      AveAzul.reject(new Error("error 1")),
      AveAzul.reject(new Error("error 2")),
      AveAzul.reject(new Error("error 3")),
    ];

    try {
      await AveAzul.resolve(promises).any();
      fail("Expected promise to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });

  test("should resolve with value even if some promises reject", async () => {
    const promises = [
      AveAzul.reject(new Error("error 1")),
      AveAzul.delay(30).then(() => "success"),
      AveAzul.reject(new Error("error 2")),
    ];

    const result = await AveAzul.resolve(promises).any();
    expect(result).toBe("success");
  });

  test("should throw TypeError when input is neither array nor iterable", async () => {
    await expect(AveAzul.resolve(123).any()).rejects.toThrow(TypeError);
    await expect(AveAzul.resolve(null).any()).rejects.toThrow(TypeError);
    await expect(AveAzul.resolve(undefined).any()).rejects.toThrow(TypeError);
  });

  test("should reject empty array with an error", async () => {
    try {
      await AveAzul.resolve([]).any();
      fail("Expected promise to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });
});

describe("AveAzul.any", () => {
  test("should resolve with the first resolved promise", async () => {
    const slowPromise = AveAzul.delay(50).then(() => "slow");
    const fastPromise = AveAzul.delay(10).then(() => "fast");

    const result = await AveAzul.any([slowPromise, fastPromise]);
    expect(result).toBe("fast");
  });

  test("should work with array of values and promises", async () => {
    const result = await AveAzul.any([
      AveAzul.delay(30).then(() => "delayed"),
      "immediate",
      AveAzul.delay(10).then(() => "fast"),
    ]);

    expect(result).toBe("immediate");
  });

  test("should work with iterable objects", async () => {
    const iterable = {
      *[Symbol.iterator]() {
        yield AveAzul.delay(30).then(() => "first");
        yield "second";
        yield AveAzul.delay(10).then(() => "third");
      },
    };

    const result = await AveAzul.any(iterable);
    expect(result).toBe("second");
  });

  test("should reject with an error when all promises reject", async () => {
    const promises = [
      AveAzul.reject(new Error("error 1")),
      AveAzul.reject(new Error("error 2")),
      AveAzul.reject(new Error("error 3")),
    ];

    try {
      await AveAzul.any(promises);
      fail("Expected promise to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });

  test("should resolve with value even if some promises reject", async () => {
    const promises = [
      AveAzul.reject(new Error("error 1")),
      AveAzul.delay(30).then(() => "success"),
      AveAzul.reject(new Error("error 2")),
    ];

    const result = await AveAzul.any(promises);
    expect(result).toBe("success");
  });

  test("should throw TypeError when input is neither array nor iterable", async () => {
    await expect(AveAzul.any(123)).rejects.toThrow(TypeError);
    await expect(AveAzul.any(null)).rejects.toThrow(TypeError);
    await expect(AveAzul.any(undefined)).rejects.toThrow(TypeError);
  });

  test("should reject empty array with an error", async () => {
    try {
      await AveAzul.any([]);
      fail("Expected promise to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });
});
