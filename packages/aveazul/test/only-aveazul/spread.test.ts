import { verify } from "run-verify";
import { describe, test, expect } from "vitest";
import { AveAzul } from "../../src/index.ts";

describe("AveAzul.prototype.spread extensions", () => {
  test("should handle non-array values as a single argument", () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.resolve(42).spread((x) => x * 2))
      .step((result) => {
        expect(result).toBe(84);
      });
  });
});
