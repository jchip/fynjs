import { describe, test, expect } from "vitest";
import { addStaticAny } from "../src/any.ts";
import { AveAzul } from "../src/index.ts";
import TestPromise from "./promise-lib.ts";

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

    await expect(TestPromise.resolve(promises).any()).rejects.toBeInstanceOf(
      Error
    );
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
    // Deliberately invalid input: the runtime check under test is what rejects it.
    const notIterable = 123 as unknown as Iterable<unknown>;
    await expect(TestPromise.resolve(notIterable).any()).rejects.toThrow(
      TypeError
    );
    await expect(TestPromise.resolve(null).any()).rejects.toThrow(TypeError);
    await expect(TestPromise.resolve(undefined).any()).rejects.toThrow(
      TypeError
    );
  });

  test("should reject empty array with an error", async () => {
    await expect(TestPromise.resolve([]).any()).rejects.toBeInstanceOf(Error);
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

    await expect(TestPromise.any(promises)).rejects.toBeInstanceOf(Error);
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
    // Deliberately invalid input: the runtime check under test is what rejects it.
    await expect(
      TestPromise.any(123 as unknown as Iterable<unknown>)
    ).rejects.toThrow(TypeError);
    await expect(TestPromise.any(null)).rejects.toThrow(TypeError);
    await expect(TestPromise.any(undefined)).rejects.toThrow(TypeError);
  });

  test("should reject empty array with an error", async () => {
    await expect(TestPromise.any([])).rejects.toBeInstanceOf(Error);
  });
});
