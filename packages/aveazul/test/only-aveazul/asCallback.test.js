"use strict";

// This test file directly imports AveAzul from the lib directory
// so it always tests the AveAzul implementation, even when running
// in Bluebird test mode with USE_BLUEBIRD=true
const AveAzul = require("../../lib/aveazul");

describe("AveAzul.prototype.asCallback error handling", () => {
  test("should propagate errors thrown in callback when promise resolves", (done) => {
    // Mock the ___throwUncaughtError method to capture errors
    const originalThrowUncaughtError = AveAzul.___throwUncaughtError;
    const thrownErrors = [];

    AveAzul.___throwUncaughtError = (err) => {
      thrownErrors.push(err);
      // Don't actually throw in tests
    };

    // Use asCallback with a callback that throws
    const callbackError = new Error("callback error");
    AveAzul.resolve("value").asCallback(() => {
      throw callbackError;
    });

    // Wait for the setTimeout to execute
    setTimeout(() => {
      // Verify the error was passed to ___throwUncaughtError
      expect(thrownErrors.length).toBe(1);
      expect(thrownErrors[0]).toBe(callbackError);

      // Restore the original method
      AveAzul.___throwUncaughtError = originalThrowUncaughtError;
      done();
    }, 10);
  });

  test("should propagate errors thrown in callback when promise rejects", (done) => {
    // Mock the ___throwUncaughtError method to capture errors
    const originalThrowUncaughtError = AveAzul.___throwUncaughtError;
    const thrownErrors = [];

    AveAzul.___throwUncaughtError = (err) => {
      thrownErrors.push(err);
      // Don't actually throw in tests
    };

    // Use asCallback with a callback that throws
    const callbackError = new Error("callback error");
    AveAzul.reject(new Error("rejection")).asCallback(() => {
      throw callbackError;
    });

    // Wait for the setTimeout to execute
    setTimeout(() => {
      // Verify the error was passed to ___throwUncaughtError
      expect(thrownErrors.length).toBe(1);
      expect(thrownErrors[0]).toBe(callbackError);

      // Restore the original method
      AveAzul.___throwUncaughtError = originalThrowUncaughtError;
      done();
    }, 10);
  });

  test("should preserve the error object when throwing uncaught errors", (done) => {
    // Mock the ___throwUncaughtError method to capture errors
    const originalThrowUncaughtError = AveAzul.___throwUncaughtError;
    const thrownErrors = [];

    AveAzul.___throwUncaughtError = (err) => {
      thrownErrors.push(err);
      // Don't actually throw in tests
    };

    // Create a custom error with additional properties
    class CustomError extends Error {
      constructor(message) {
        super(message);
        this.name = "CustomError";
        this.customProperty = "test";
      }
    }

    const callbackError = new CustomError("custom error");
    AveAzul.resolve("value").asCallback(() => {
      throw callbackError;
    });

    // Wait for the setTimeout to execute
    setTimeout(() => {
      // Verify the error was passed to ___throwUncaughtError
      expect(thrownErrors.length).toBe(1);
      expect(thrownErrors[0]).toBe(callbackError);
      expect(thrownErrors[0].name).toBe("CustomError");
      expect(thrownErrors[0].customProperty).toBe("test");

      // Restore the original method
      AveAzul.___throwUncaughtError = originalThrowUncaughtError;
      done();
    }, 10);
  });
});
