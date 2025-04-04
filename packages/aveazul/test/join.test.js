"use strict";

const AveAzul = require("./promise-lib");

describe("AveAzul.join", () => {
  test("should wait for all promises and pass their values to the handler", async () => {
    const result = await AveAzul.join(
      AveAzul.resolve(1),
      AveAzul.resolve(2),
      AveAzul.resolve(3),
      (a, b, c) => a + b + c
    );

    expect(result).toBe(6);
  });

  test("should handle a mix of promises and values", async () => {
    const result = await AveAzul.join(
      AveAzul.resolve(1),
      2,
      AveAzul.resolve(3),
      (a, b, c) => a + b + c
    );

    expect(result).toBe(6);
  });

  test("should handle zero promises with only a handler", async () => {
    const fn = () => 42;
    const result = await AveAzul.join(fn);
    expect(result).toEqual([fn]);
  });

  test("should reject if any input promise rejects", async () => {
    await expect(
      AveAzul.join(
        AveAzul.resolve(1),
        AveAzul.reject(new Error("test error")),
        AveAzul.resolve(3),
        (a, b, c) => a + b + c
      )
    ).rejects.toThrow("test error");
  });

  test("should reject with error from handler function", async () => {
    await expect(
      AveAzul.join(AveAzul.resolve(1), AveAzul.resolve(2), () => {
        throw new Error("handler error");
      })
    ).rejects.toThrow("handler error");
  });

  test("should handle asynchronous handler functions", async () => {
    const result = await AveAzul.join(
      AveAzul.resolve(1),
      AveAzul.resolve(2),
      async (a, b) => {
        const c = await AveAzul.resolve(3);
        return a + b + c;
      }
    );

    expect(result).toBe(6);
  });

  test("should maintain the order of values passed to handler", async () => {
    // Create promises that resolve at different times
    const p1 = new AveAzul((resolve) => setTimeout(() => resolve("first"), 30));
    const p2 = new AveAzul((resolve) =>
      setTimeout(() => resolve("second"), 10)
    );
    const p3 = new AveAzul((resolve) => setTimeout(() => resolve("third"), 20));

    const result = await AveAzul.join(p1, p2, p3, (a, b, c) => [a, b, c]);

    // Order should be maintained regardless of resolution timing
    expect(result).toEqual(["first", "second", "third"]);
  });

  test("should correctly handle promises that resolve to undefined or null", async () => {
    const result = await AveAzul.join(
      AveAzul.resolve(undefined),
      AveAzul.resolve(null),
      AveAzul.resolve(42),
      (a, b, c) => ({ a, b, c })
    );

    expect(result).toEqual({ a: undefined, b: null, c: 42 });
  });

  test("should catch errors thrown in promises", async () => {
    // Create a promise that throws instead of rejecting normally
    const throwingPromise = new AveAzul(() => {
      throw new Error("thrown error");
    });

    await expect(
      AveAzul.join(
        AveAzul.resolve(1),
        throwingPromise,
        AveAzul.resolve(3),
        (a, b, c) => a + b + c
      )
    ).rejects.toThrow("thrown error");
  });

  test("should behave like Promise.all when last argument is not a function", async () => {
    // When the last argument is not a function, join should behave like Promise.all
    const result = await AveAzul.join(
      AveAzul.resolve(1),
      AveAzul.resolve(2),
      AveAzul.resolve(3)
    );

    // Should return an array of results, just like Promise.all
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([1, 2, 3]);
  });

  test("should process all promises even when handler takes fewer parameters", async () => {
    // Create spy promises to track resolution
    const spy1 = jest.fn().mockResolvedValue(1);
    const spy2 = jest.fn().mockResolvedValue(2);
    const spy3 = jest.fn().mockResolvedValue(3);
    const spy4 = jest.fn().mockResolvedValue(4);

    // Handler only uses the first two values
    const result = await AveAzul.join(
      spy1(),
      spy2(),
      spy3(),
      spy4(),
      (a, b) => a + b
    );

    // Result should be the sum of first two values
    expect(result).toBe(3);

    // All spies should have been called, showing all promises were processed
    expect(spy1).toHaveBeenCalled();
    expect(spy2).toHaveBeenCalled();
    expect(spy3).toHaveBeenCalled();
    expect(spy4).toHaveBeenCalled();
  });
});
