import { verify } from "run-verify";
import { describe, test, expect } from "vitest";
import {
  OperationalError,
  isOperationalError,
  isProgrammerError,
} from "../../src/operational-error.ts";

// These tests are only for AveAzul's internal implementation
// They verify the utility functions used by the error() method
describe("operational-error internal functions", () => {
  describe("OperationalError", () => {
    test("should work when Error.captureStackTrace is not available", () => {
      // Save original captureStackTrace
      const originalCaptureStackTrace = Error.captureStackTrace;

      // Mock by deleting captureStackTrace

      return verify({
        timeout: 1000,
        cleanup: () => {
          Error.captureStackTrace = originalCaptureStackTrace;
        },
      })
        .step(() => {
          Error.captureStackTrace = undefined;
        })
        .step(() => new OperationalError("test without stack trace"))
        .step((error) => {
          expect(error.name).toBe("OperationalError");
          expect(error.message).toBe("test without stack trace");
          expect(error.isOperational).toBe(true);
        });
    });
  });

  describe("isOperationalError", () => {
    test("should return true for OperationalError instances", () => {
      return verify({ timeout: 1000 })
        .step(() => new OperationalError("test"))
        .step((error) => isOperationalError(error))
        .step((result) => {
          expect(result).toBe(true);
        });
    });

    test("should return true for errors with isOperational property", () => {
      return verify({ timeout: 1000 })
        .step(() => {
          const error: Error & { isOperational?: boolean } = new Error("test");
          error.isOperational = true;
          return error;
        })
        .step((error) => isOperationalError(error))
        .step((result) => {
          expect(result).toBe(true);
        });
    });

    test("should return false for other errors", () => {
      return verify({ timeout: 1000 })
        .step(() => [
          new Error("test"),
          new TypeError("test"),
          null,
          undefined,
          "string error",
          42,
        ])
        .step((errors) => errors.map((error) => isOperationalError(error)))
        .step((results) => {
          expect(results).toEqual([false, false, false, false, false, false]);
        });
    });
  });

  describe("isProgrammerError", () => {
    test("should return true for non-operational errors", () => {
      return verify({ timeout: 1000 })
        .step(() => [new Error("test"), new TypeError("test")])
        .step((errors) => errors.map((error) => isProgrammerError(error)))
        .step((results) => {
          expect(results).toEqual([true, true]);
        });
    });

    test("should return false for operational errors", () => {
      return verify({ timeout: 1000 })
        .step(() => {
          const error: Error & { isOperational?: boolean } = new Error("test");
          error.isOperational = true;
          return [new OperationalError("test"), error];
        })
        .step((errors) => errors.map((error) => isProgrammerError(error)))
        .step((results) => {
          expect(results).toEqual([false, false]);
        });
    });

    test("should return false for non-objects", () => {
      return verify({ timeout: 1000 })
        .step(() => [null, undefined, "string error", 42])
        .step((errors) => errors.map((error) => isProgrammerError(error)))
        .step((results) => {
          expect(results).toEqual([false, false, false, false]);
        });
    });
  });
});
