import { verify } from "run-verify";
import { describe, test, expect, vi, beforeEach } from "vitest";
import AveAzul from "./promise-lib.ts";

describe("delay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("delay() should handle single argument using arguments object", () => {
    const args = [101];
    const start = Date.now();
    return verify({ timeout: 1000 })
      .step(() => AveAzul.delay.apply(null, args))
      .step(() => {
        const duration = Date.now() - start;
        expect(duration).toBeGreaterThanOrEqual(100);
      });
  });

  test("delay() should handle single argument directly", () => {
    const start = Date.now();
    return verify({ timeout: 1000 })
      .step(() => AveAzul.delay(101))
      .step(() => {
        const duration = Date.now() - start;
        expect(duration).toBeGreaterThanOrEqual(100);
      });
  });

  test("delay() should handle two arguments using arguments object", () => {
    const args = [101, 42];
    const start = Date.now();
    return verify({ timeout: 1000 })
      .step(() => AveAzul.delay.apply(null, args))
      .step((result) => {
        const duration = Date.now() - start;
        expect(duration).toBeGreaterThanOrEqual(100);
        expect(result).toBe(42);
      });
  });

  test("delay() should resolve after specified time", () => {
    const start = Date.now();
    return verify({ timeout: 1000 })
      .step(() => AveAzul.delay(101))
      .step(() => {
        const duration = Date.now() - start;
        expect(duration).toBeGreaterThanOrEqual(100);
      });
  });

  test("delay() should resolve with optional value", () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.delay(50, 42))
      .step((result) => {
        expect(result).toBe(42);
      });
  });
});
