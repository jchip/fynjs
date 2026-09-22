import { verify } from "run-verify";
import { describe, test, expect } from "vitest";
import { AveAzul } from "../../src/index.ts";

describe("constructor", () => {
  test("should create a new AveAzul instance", () => {
    return verify({ timeout: 1000 })
      .step(() => ({ promise: new AveAzul((resolve) => resolve(42)) }))
      .keep.step(({ promise }) => {
        expect(promise).toBeInstanceOf(AveAzul);
        expect(promise).toBeInstanceOf(Promise);
      })
      .step(({ promise }) => promise)
      .step((value) => expect(value).toBe(42));
  });

  test("should handle rejection in constructor", () => {
    const error = new Error("test");
    return verify({ timeout: 1000 })
      .expectError.step(() => new AveAzul((resolve, reject) => reject(error)))
      .step((caught) => expect(caught).toBe(error));
  });
});
