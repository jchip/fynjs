"use strict";

const AveAzul = require("./promise-lib");
const isBluebird = process.env.USE_BLUEBIRD === "true";

describe("AveAzul.some", () => {
  test("should resolve with results when count promises resolve", async () => {
    const promises = [
      Promise.resolve(1),
      Promise.resolve(2),
      Promise.reject(new Error("fail")),
      Promise.resolve(3),
    ];

    const results = await AveAzul.some(promises, 2);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(2);

    // Both implementations should include values from successful promises
    // but we don't test the exact contents as the order may vary
    expect(results.every((r) => [1, 2, 3].includes(r))).toBe(true);
  });

  test("should work with iterable objects", async () => {
    // Use a Set as an iterable
    const iterable = new Set([
      Promise.resolve(1),
      Promise.resolve(2),
      Promise.reject(new Error("fail")),
      Promise.resolve(3),
    ]);

    const results = await AveAzul.some(iterable, 2);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(2);

    // Both implementations should include values from successful promises
    // but we don't test the exact contents as the order may vary
    expect(results.every((r) => [1, 2, 3].includes(r))).toBe(true);
  });

  test("should reject when too many promises reject", async () => {
    const promises = [
      Promise.reject(new Error("fail1")),
      Promise.reject(new Error("fail2")),
      Promise.reject(new Error("fail3")),
      Promise.resolve(4),
    ];

    // Both implementations reject, but with different error messages
    await expect(AveAzul.some(promises, 2)).rejects.toThrow();
  });

  test("should throw TypeError when input is neither array nor iterable", async () => {
    // Test with a non-iterable object
    const nonIterable = { foo: "bar" };

    // Should throw a TypeError
    await expect(AveAzul.some(nonIterable, 2)).rejects.toThrow(TypeError);
    await expect(AveAzul.some(nonIterable, 2)).rejects.toThrow(
      /expecting an array or an iterable object/
    );
  });

  test("should resolve immediately when there are enough non-promise values", async () => {
    const startTime = Date.now();

    // Create an array with enough non-promise values to satisfy count
    // followed by promises that take time to resolve
    const values = [
      10, // non-promise value
      20, // non-promise value
      30, // non-promise value
      new Promise((resolve) => setTimeout(() => resolve(40), 100)),
      new Promise((resolve) => setTimeout(() => resolve(50), 200)),
    ];

    // Request just 3 values (we have 3 non-promises)
    const results = await AveAzul.some(values, 3);

    const endTime = Date.now();
    const elapsed = endTime - startTime;

    // Should complete in < 50ms because it doesn't need to wait for promises
    expect(elapsed).toBeLessThan(50);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(3);

    // Results should be just the non-promise values
    expect(results).toContain(10);
    expect(results).toContain(20);
    expect(results).toContain(30);
  });
});

describe("AveAzul.prototype.some", () => {
  test("should resolve with results when count promises resolve", async () => {
    const promises = [
      Promise.resolve(1),
      Promise.resolve(2),
      Promise.reject(new Error("fail")),
      Promise.resolve(3),
    ];

    const results = await AveAzul.resolve(promises).some(2);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(2);

    // Both implementations should include values from successful promises
    // but we don't test the exact contents as the order may vary
    expect(results.every((r) => [1, 2, 3].includes(r))).toBe(true);
  });

  test("should work with iterable objects", async () => {
    // Create a promise that resolves to a Set (an iterable)
    const iterable = new Set([
      Promise.resolve(1),
      Promise.resolve(2),
      Promise.reject(new Error("fail")),
      Promise.resolve(3),
    ]);

    const results = await AveAzul.resolve(iterable).some(2);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(2);

    // Both implementations should include values from successful promises
    // but we don't test the exact contents as the order may vary
    expect(results.every((r) => [1, 2, 3].includes(r))).toBe(true);
  });

  test("should reject when too many promises reject", async () => {
    const promises = [
      Promise.reject(new Error("fail1")),
      Promise.reject(new Error("fail2")),
      Promise.reject(new Error("fail3")),
      Promise.resolve(4),
    ];

    // Both implementations reject, but with different error messages
    await expect(AveAzul.resolve(promises).some(2)).rejects.toThrow();
  });

  test("should throw TypeError when input is neither array nor iterable", async () => {
    // Test with a non-iterable object
    const nonIterable = { foo: "bar" };

    // Should throw a TypeError
    await expect(AveAzul.resolve(nonIterable).some(2)).rejects.toThrow(
      TypeError
    );
    await expect(AveAzul.resolve(nonIterable).some(2)).rejects.toThrow(
      /expecting an array or an iterable object/
    );
  });

  test("should resolve immediately when there are enough non-promise values", async () => {
    const startTime = Date.now();

    // Create an array with enough non-promise values to satisfy count
    // followed by promises that take time to resolve
    const values = [
      10, // non-promise value
      20, // non-promise value
      30, // non-promise value
      new Promise((resolve) => setTimeout(() => resolve(40), 100)),
      new Promise((resolve) => setTimeout(() => resolve(50), 200)),
    ];

    // Request just 3 values (we have 3 non-promises)
    const results = await AveAzul.resolve(values).some(3);

    const endTime = Date.now();
    const elapsed = endTime - startTime;

    // Should complete in < 50ms because it doesn't need to wait for promises
    expect(elapsed).toBeLessThan(50);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(3);

    // Results should be just the non-promise values
    expect(results).toContain(10);
    expect(results).toContain(20);
    expect(results).toContain(30);
  });
});
