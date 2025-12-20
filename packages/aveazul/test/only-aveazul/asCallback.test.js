// This test file directly imports AveAzul from the dist directory
// so it always tests the AveAzul implementation, even when running
// in Bluebird test mode with USE_BLUEBIRD=true
import { AveAzul } from "../../src/index.ts";

describe("AveAzul.prototype.asCallback error handling", () => {
  test("should propagate errors thrown in callback when promise resolves", async () => {
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
    await AveAzul.delay(10);

    // Verify the error was passed to ___throwUncaughtError
    expect(thrownErrors.length).toBe(1);
    expect(thrownErrors[0]).toBe(callbackError);

    // Restore the original method
    AveAzul.___throwUncaughtError = originalThrowUncaughtError;
  });

  test("should propagate errors thrown in callback when promise rejects", async () => {
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
    await AveAzul.delay(10);

    // Verify the error was passed to ___throwUncaughtError
    expect(thrownErrors.length).toBe(1);
    expect(thrownErrors[0]).toBe(callbackError);

    // Restore the original method
    AveAzul.___throwUncaughtError = originalThrowUncaughtError;
  });

  test("should preserve the error object when throwing uncaught errors", async () => {
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
    await AveAzul.delay(10);

    // Verify the error was passed to ___throwUncaughtError
    expect(thrownErrors.length).toBe(1);
    expect(thrownErrors[0]).toBe(callbackError);
    expect(thrownErrors[0].name).toBe("CustomError");
    expect(thrownErrors[0].customProperty).toBe("test");

    // Restore the original method
    AveAzul.___throwUncaughtError = originalThrowUncaughtError;
  });
});
