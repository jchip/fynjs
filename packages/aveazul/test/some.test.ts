import { verify } from "run-verify";
import { describe, test, expect } from "vitest";
import AveAzul from "./promise-lib.ts";
const isBluebird = process.env.USE_BLUEBIRD === "true";

describe("AveAzul.some", () => {
  test("should resolve with results when count promises resolve", async () => {
    const promises = [
      Promise.resolve(1),
      Promise.resolve(2),
      Promise.reject(new Error("fail")),
      Promise.resolve(3),
    ];

    return verify({ timeout: 1000 })
      .step(() => AveAzul.some(promises, 2))
      .step((results) => {
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBe(2);

        // Both implementations should include values from successful promises
        // but we don't test the exact contents as the order may vary
        expect(results.every((r) => [1, 2, 3].includes(r))).toBe(true);
      });
  });

  test("should work with iterable objects", async () => {
    // Use a Set as an iterable
    const iterable = new Set([
      Promise.resolve(1),
      Promise.resolve(2),
      Promise.reject(new Error("fail")),
      Promise.resolve(3),
    ]);

    return verify({ timeout: 1000 })
      .step(() => AveAzul.some(iterable, 2))
      .step((results) => {
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBe(2);

        // Both implementations should include values from successful promises
        // but we don't test the exact contents as the order may vary
        expect(results.every((r) => [1, 2, 3].includes(r))).toBe(true);
      });
  });

  test("should reject when too many promises reject", async () => {
    const promises = [
      Promise.reject(new Error("fail1")),
      Promise.reject(new Error("fail2")),
      Promise.reject(new Error("fail3")),
      Promise.resolve(4),
    ];

    // Both implementations reject, but with different error messages
    return verify({ timeout: 1000 })
      .expectError.step(() => AveAzul.some(promises, 2))
      .step((error) => {
        expect(() => {
          throw error;
        }).toThrow();
      });
  });

  test("should throw TypeError when input is neither array nor iterable", async () => {
    // Test with a non-iterable object
    // Deliberately not iterable: the runtime check under test is what rejects it.
    const nonIterable = { foo: "bar" } as unknown as Iterable<unknown>;

    // Should throw a TypeError
    return verify({ timeout: 1000 })
      .expectError.step(() => AveAzul.some(nonIterable, 2))
      .step((error) => {
        expect(() => {
          throw error;
        }).toThrow(TypeError);
      })
      .expectError.step(() => AveAzul.some(nonIterable, 2))
      .step((error) => {
        expect(() => {
          throw error;
        }).toThrow(/expecting an array or an iterable object/);
      });
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
    return verify({ timeout: 1000 })
      .step(() => AveAzul.some(values, 3))
      .step((results) => {
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
});

describe("AveAzul.prototype.some", () => {
  test("should resolve with results when count promises resolve", async () => {
    const promises = [
      Promise.resolve(1),
      Promise.resolve(2),
      Promise.reject(new Error("fail")),
      Promise.resolve(3),
    ];

    return verify({ timeout: 1000 })
      .step(() => AveAzul.resolve(promises).some(2))
      .step((results) => {
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBe(2);

        // Both implementations should include values from successful promises
        // but we don't test the exact contents as the order may vary
        expect(results.every((r) => [1, 2, 3].includes(r))).toBe(true);
      });
  });

  test("should work with iterable objects", async () => {
    // Create a promise that resolves to a Set (an iterable)
    const iterable = new Set([
      Promise.resolve(1),
      Promise.resolve(2),
      Promise.reject(new Error("fail")),
      Promise.resolve(3),
    ]);

    return verify({ timeout: 1000 })
      .step(() => AveAzul.resolve(iterable).some(2))
      .step((results) => {
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBe(2);

        // Both implementations should include values from successful promises
        // but we don't test the exact contents as the order may vary
        expect(results.every((r) => [1, 2, 3].includes(r))).toBe(true);
      });
  });

  test("should reject when too many promises reject", async () => {
    const promises = [
      Promise.reject(new Error("fail1")),
      Promise.reject(new Error("fail2")),
      Promise.reject(new Error("fail3")),
      Promise.resolve(4),
    ];

    // Both implementations reject, but with different error messages
    return verify({ timeout: 1000 })
      .expectError.step(() => AveAzul.resolve(promises).some(2))
      .step((error) => {
        expect(() => {
          throw error;
        }).toThrow();
      });
  });

  test("should throw TypeError when input is neither array nor iterable", async () => {
    // Test with a non-iterable object
    const nonIterable = { foo: "bar" };

    // Should throw a TypeError
    return verify({ timeout: 1000 })
      .expectError.step(() => AveAzul.resolve(nonIterable).some(2))
      .step((error) => {
        expect(() => {
          throw error;
        }).toThrow(TypeError);
      })
      .expectError.step(() => AveAzul.resolve(nonIterable).some(2))
      .step((error) => {
        expect(() => {
          throw error;
        }).toThrow(/expecting an array or an iterable object/);
      });
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
    return verify({ timeout: 1000 })
      .step(() => AveAzul.resolve(values).some(3))
      .step((results) => {
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
});
