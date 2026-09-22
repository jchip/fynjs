import { verify } from "run-verify";
import { describe, test, expect } from "vitest";
import TestPromise from "./promise-lib.ts";

describe("AveAzul.prototype.any", () => {
  test("should resolve with the first resolved promise", async () => {
    const slowPromise = TestPromise.delay(50).then(() => "slow");
    const fastPromise = TestPromise.delay(10).then(() => "fast");

    return verify({ timeout: 1000 })
      .step(() => TestPromise.resolve([slowPromise, fastPromise]).any())
      .step((result) => {
        expect(result).toBe("fast");
      });
  });

  test("should work with array of values and promises", async () => {
    return verify({ timeout: 1000 })
      .step(() =>
        TestPromise.resolve([
          TestPromise.delay(30).then(() => "delayed"),
          "immediate",
          TestPromise.delay(10).then(() => "fast"),
        ]).any()
      )
      .step((result) => {
        expect(result).toBe("immediate");
      });
  });

  test("should work with iterable objects", async () => {
    const iterable = {
      *[Symbol.iterator]() {
        yield TestPromise.delay(30).then(() => "first");
        yield "second";
        yield TestPromise.delay(10).then(() => "third");
      },
    };

    return verify({ timeout: 1000 })
      .step(() => TestPromise.resolve(iterable).any())
      .step((result) => {
        expect(result).toBe("second");
      });
  });

  test("should reject with an error when all promises reject", async () => {
    const promises = [
      TestPromise.reject(new Error("error 1")),
      TestPromise.reject(new Error("error 2")),
      TestPromise.reject(new Error("error 3")),
    ];

    return verify({ timeout: 1000 })
      .expectError.step(() => TestPromise.resolve(promises).any())
      .step((error) => {
        expect(error).toBeInstanceOf(Error);
      });
  });

  test("should resolve with value even if some promises reject", async () => {
    const promises = [
      TestPromise.reject(new Error("error 1")),
      TestPromise.delay(30).then(() => "success"),
      TestPromise.reject(new Error("error 2")),
    ];

    return verify({ timeout: 1000 })
      .step(() => TestPromise.resolve(promises).any())
      .step((result) => {
        expect(result).toBe("success");
      });
  });

  test("should throw TypeError when input is neither array nor iterable", async () => {
    // Deliberately invalid input: the runtime check under test is what rejects it.
    const notIterable = 123 as unknown as Iterable<unknown>;
    return verify({ timeout: 1000 })
      .expectError.step(() => TestPromise.resolve(notIterable).any())
      .step((error) => {
        expect(error).toBeInstanceOf(TypeError);
      })
      .expectError.step(() => TestPromise.resolve(null).any())
      .step((error) => {
        expect(error).toBeInstanceOf(TypeError);
      })
      .expectError.step(() => TestPromise.resolve(undefined).any())
      .step((error) => {
        expect(error).toBeInstanceOf(TypeError);
      });
  });

  test("should reject empty array with an error", async () => {
    return verify({ timeout: 1000 })
      .expectError.step(() => TestPromise.resolve([]).any())
      .step((error) => {
        expect(error).toBeInstanceOf(Error);
      });
  });
});

describe("AveAzul.any", () => {
  test("should resolve with the first resolved promise", async () => {
    const slowPromise = TestPromise.delay(50).then(() => "slow");
    const fastPromise = TestPromise.delay(10).then(() => "fast");

    return verify({ timeout: 1000 })
      .step(() => TestPromise.any([slowPromise, fastPromise]))
      .step((result) => {
        expect(result).toBe("fast");
      });
  });

  test("should work with array of values and promises", async () => {
    return verify({ timeout: 1000 })
      .step(() =>
        TestPromise.any([
          TestPromise.delay(30).then(() => "delayed"),
          "immediate",
          TestPromise.delay(10).then(() => "fast"),
        ])
      )
      .step((result) => {
        expect(result).toBe("immediate");
      });
  });

  test("should work with iterable objects", async () => {
    const iterable = {
      *[Symbol.iterator]() {
        yield TestPromise.delay(30).then(() => "first");
        yield "second";
        yield TestPromise.delay(10).then(() => "third");
      },
    };

    return verify({ timeout: 1000 })
      .step(() => TestPromise.any(iterable))
      .step((result) => {
        expect(result).toBe("second");
      });
  });

  test("should reject with an error when all promises reject", async () => {
    const promises = [
      TestPromise.reject(new Error("error 1")),
      TestPromise.reject(new Error("error 2")),
      TestPromise.reject(new Error("error 3")),
    ];

    return verify({ timeout: 1000 })
      .expectError.step(() => TestPromise.any(promises))
      .step((error) => {
        expect(error).toBeInstanceOf(Error);
      });
  });

  test("should resolve with value even if some promises reject", async () => {
    const promises = [
      TestPromise.reject(new Error("error 1")),
      TestPromise.delay(30).then(() => "success"),
      TestPromise.reject(new Error("error 2")),
    ];

    return verify({ timeout: 1000 })
      .step(() => TestPromise.any(promises))
      .step((result) => {
        expect(result).toBe("success");
      });
  });

  test("should throw TypeError when input is neither array nor iterable", async () => {
    // Deliberately invalid input: the runtime check under test is what rejects it.
    return verify({ timeout: 1000 })
      .expectError.step(() =>
        TestPromise.any(123 as unknown as Iterable<unknown>)
      )
      .step((error) => {
        expect(error).toBeInstanceOf(TypeError);
      })
      .expectError.step(() => TestPromise.any(null))
      .step((error) => {
        expect(error).toBeInstanceOf(TypeError);
      })
      .expectError.step(() => TestPromise.any(undefined))
      .step((error) => {
        expect(error).toBeInstanceOf(TypeError);
      });
  });

  test("should reject empty array with an error", async () => {
    return verify({ timeout: 1000 })
      .expectError.step(() => TestPromise.any([]))
      .step((error) => {
        expect(error).toBeInstanceOf(Error);
      });
  });
});
