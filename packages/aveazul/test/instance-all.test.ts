import { verify } from "run-verify";
import { describe, test, expect } from "vitest";
import AveAzul from "./promise-lib.ts";

describe("AveAzul.prototype.all", () => {
  test("should resolve an array of promises", async () => {
    return verify({ timeout: 1000 })
      .step(() =>
        AveAzul.resolve([
          AveAzul.resolve(1),
          AveAzul.resolve(2),
          AveAzul.resolve(3),
        ]).all()
      )
      .step((result) => {
        expect(result).toEqual([1, 2, 3]);
      });
  });

  test("should handle mix of promises and values", async () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.resolve([1, AveAzul.resolve(2), 3]).all())
      .step((result) => {
        expect(result).toEqual([1, 2, 3]);
      });
  });

  test("should reject if any promise rejects", async () => {
    const error = new Error("Test error");

    return verify({ timeout: 1000 })
      .expectErrorHas("Test error").step(() =>
        AveAzul.resolve([
          AveAzul.resolve(1),
          AveAzul.reject(error),
          AveAzul.resolve(3),
        ]).all()
      );
  });

  test("should handle empty arrays", async () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.resolve([]).all())
      .step((result) => {
        expect(result).toEqual([]);
      });
  });

  test("should handle iterables", async () => {
    const set = new Set([1, AveAzul.resolve(2), 3]);
    return verify({ timeout: 1000 })
      .step(() => AveAzul.resolve(set).all())
      .step((result) => {
        expect(result).toEqual([1, 2, 3]);
      });
  });

  test("should throw if not an array or iterable", async () => {
    return verify({ timeout: 1000 })
      .expectError.step(() => AveAzul.resolve(123).all())
      .step((error) => {
        expect((error as Error).message).toMatch(
          /expecting an array or an iterable object/
        );
      });
  });

  test("should handle nested promises", async () => {
    const nestedPromise = AveAzul.resolve(
      AveAzul.resolve([AveAzul.resolve(1), AveAzul.resolve(2)])
    );

    return verify({ timeout: 1000 })
      .step(() => nestedPromise.all())
      .step((result) => {
        expect(result).toEqual([1, 2]);
      });
  });

  test("should handle promises that resolve after different delays", async () => {
    const promises = [
      new AveAzul((resolve) => setTimeout(() => resolve("first"), 30)),
      new AveAzul((resolve) => setTimeout(() => resolve("second"), 10)),
      new AveAzul((resolve) => setTimeout(() => resolve("third"), 20)),
    ];

    return verify({ timeout: 1000 })
      .step(() => AveAzul.resolve(promises).all())
      .step((result) => {
        expect(result).toEqual(["first", "second", "third"]);
      });
  });
});
