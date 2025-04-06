"use strict";

const { addStaticAny } = require("../lib/any");
const AveAzul = require("../lib/aveazul");
const TestPromise = require("./promise-lib");

if (TestPromise === AveAzul) {
  addStaticAny(AveAzul, true);
}

describe("AveAzul.prototype.any", () => {
  test("should resolve with the first resolved promise", async () => {
    const slowPromise = TestPromise.delay(50).then(() => "slow");
    const fastPromise = TestPromise.delay(10).then(() => "fast");

    const result = await TestPromise.resolve([slowPromise, fastPromise]).any();
    expect(result).toBe("fast");
  });

  test("should work with array of values and promises", async () => {
    const result = await TestPromise.resolve([
      TestPromise.delay(30).then(() => "delayed"),
      "immediate",
      TestPromise.delay(10).then(() => "fast"),
    ]).any();

    expect(result).toBe("immediate");
  });

  test("should work with iterable objects", async () => {
    const iterable = {
      *[Symbol.iterator]() {
        yield TestPromise.delay(30).then(() => "first");
        yield "second";
        yield TestPromise.delay(10).then(() => "third");
      },
    };

    const result = await TestPromise.resolve(iterable).any();
    expect(result).toBe("second");
  });

  test("should reject with an error when all promises reject", async () => {
    const promises = [
      TestPromise.reject(new Error("error 1")),
      TestPromise.reject(new Error("error 2")),
      TestPromise.reject(new Error("error 3")),
    ];

    try {
      await TestPromise.resolve(promises).any();
      fail("Expected promise to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });

  test("should resolve with value even if some promises reject", async () => {
    const promises = [
      TestPromise.reject(new Error("error 1")),
      TestPromise.delay(30).then(() => "success"),
      TestPromise.reject(new Error("error 2")),
    ];

    const result = await TestPromise.resolve(promises).any();
    expect(result).toBe("success");
  });

  test("should throw TypeError when input is neither array nor iterable", async () => {
    await expect(TestPromise.resolve(123).any()).rejects.toThrow(TypeError);
    await expect(TestPromise.resolve(null).any()).rejects.toThrow(TypeError);
    await expect(TestPromise.resolve(undefined).any()).rejects.toThrow(
      TypeError
    );
  });

  test("should reject empty array with an error", async () => {
    try {
      await TestPromise.resolve([]).any();
      fail("Expected promise to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });
});

describe("AveAzul.any", () => {
  test("should resolve with the first resolved promise", async () => {
    const slowPromise = TestPromise.delay(50).then(() => "slow");
    const fastPromise = TestPromise.delay(10).then(() => "fast");

    const result = await TestPromise.any([slowPromise, fastPromise]);
    expect(result).toBe("fast");
  });

  test("should work with array of values and promises", async () => {
    const result = await TestPromise.any([
      TestPromise.delay(30).then(() => "delayed"),
      "immediate",
      TestPromise.delay(10).then(() => "fast"),
    ]);

    expect(result).toBe("immediate");
  });

  test("should work with iterable objects", async () => {
    const iterable = {
      *[Symbol.iterator]() {
        yield TestPromise.delay(30).then(() => "first");
        yield "second";
        yield TestPromise.delay(10).then(() => "third");
      },
    };

    const result = await TestPromise.any(iterable);
    expect(result).toBe("second");
  });

  test("should reject with an error when all promises reject", async () => {
    const promises = [
      TestPromise.reject(new Error("error 1")),
      TestPromise.reject(new Error("error 2")),
      TestPromise.reject(new Error("error 3")),
    ];

    try {
      await TestPromise.any(promises);
      fail("Expected promise to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });

  test("should resolve with value even if some promises reject", async () => {
    const promises = [
      TestPromise.reject(new Error("error 1")),
      TestPromise.delay(30).then(() => "success"),
      TestPromise.reject(new Error("error 2")),
    ];

    const result = await TestPromise.any(promises);
    expect(result).toBe("success");
  });

  test("should throw TypeError when input is neither array nor iterable", async () => {
    await expect(TestPromise.any(123)).rejects.toThrow(TypeError);
    await expect(TestPromise.any(null)).rejects.toThrow(TypeError);
    await expect(TestPromise.any(undefined)).rejects.toThrow(TypeError);
  });

  test("should reject empty array with an error", async () => {
    try {
      await TestPromise.any([]);
      fail("Expected promise to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });
});
