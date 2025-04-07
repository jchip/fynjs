"use strict";

const {
  OperationalError,
  isOperationalError,
  isProgrammerError,
} = require("../../lib/operational-error");

// These tests are only for AveAzul's internal implementation
// They verify the utility functions used by the error() method
describe("operational-error internal functions", () => {
  describe("OperationalError", () => {
    test("should work when Error.captureStackTrace is not available", () => {
      // Save original captureStackTrace
      const originalCaptureStackTrace = Error.captureStackTrace;

      // Mock by deleting captureStackTrace
      Error.captureStackTrace = undefined;

      // Create an OperationalError without captureStackTrace available
      const error = new OperationalError("test without stack trace");
      expect(error.name).toBe("OperationalError");
      expect(error.message).toBe("test without stack trace");
      expect(error.isOperational).toBe(true);

      // Restore original captureStackTrace
      Error.captureStackTrace = originalCaptureStackTrace;
    });
  });

  describe("isOperationalError", () => {
    test("should return true for OperationalError instances", () => {
      const error = new OperationalError("test");
      expect(isOperationalError(error)).toBe(true);
    });

    test("should return true for errors with isOperational property", () => {
      const error = new Error("test");
      error.isOperational = true;
      expect(isOperationalError(error)).toBe(true);
    });

    test("should return false for other errors", () => {
      expect(isOperationalError(new Error("test"))).toBe(false);
      expect(isOperationalError(new TypeError("test"))).toBe(false);
      expect(isOperationalError(null)).toBe(false);
      expect(isOperationalError(undefined)).toBe(false);
      expect(isOperationalError("string error")).toBe(false);
      expect(isOperationalError(42)).toBe(false);
    });
  });

  describe("isProgrammerError", () => {
    test("should return true for non-operational errors", () => {
      expect(isProgrammerError(new Error("test"))).toBe(true);
      expect(isProgrammerError(new TypeError("test"))).toBe(true);
    });

    test("should return false for operational errors", () => {
      const error = new OperationalError("test");
      expect(isProgrammerError(error)).toBe(false);

      const error2 = new Error("test");
      error2.isOperational = true;
      expect(isProgrammerError(error2)).toBe(false);
    });

    test("should return false for non-objects", () => {
      expect(isProgrammerError(null)).toBe(false);
      expect(isProgrammerError(undefined)).toBe(false);
      expect(isProgrammerError("string error")).toBe(false);
      expect(isProgrammerError(42)).toBe(false);
    });
  });
});
