"use strict";

const { triggerUncaughtException } = require("../lib/util");

describe("triggerUncaughtException", () => {
  // Save original setTimeout
  let originalSetTimeout;

  beforeEach(() => {
    // Save the original setTimeout
    originalSetTimeout = global.setTimeout;

    // Mock setTimeout to capture callbacks instead of executing them
    global.setTimeout = jest.fn((callback) => {
      // Store the callback for testing, but don't execute it
      global.setTimeout.mock.calls[
        global.setTimeout.mock.calls.length - 1
      ].callback = callback;
      return 123; // Mock timer ID
    });
  });

  afterEach(() => {
    // Restore original setTimeout after each test
    global.setTimeout = originalSetTimeout;
  });

  test("should schedule throwing the provided error", () => {
    const testError = new Error("Test error");

    // Call the function
    triggerUncaughtException(testError);

    // Verify setTimeout was called with 0ms delay
    expect(global.setTimeout).toHaveBeenCalled();
    expect(global.setTimeout.mock.calls[0][1]).toBe(0);

    // Get the callback that was passed to setTimeout
    const timeoutCallback = global.setTimeout.mock.calls[0].callback;

    // Verify the callback exists (we intercepted it correctly)
    expect(typeof timeoutCallback).toBe("function");

    // Create a function that would throw if the callback throws
    const callbackWrapper = () => {
      timeoutCallback();
    };

    // Expect that executing the callback would throw the original error
    expect(callbackWrapper).toThrow(testError);
  });

  test("should convert non-Error objects to Error instances", () => {
    // Call with a string
    triggerUncaughtException("string message");

    // Get the callback
    const timeoutCallback = global.setTimeout.mock.calls[0].callback;

    // Create a wrapper to catch the error
    let thrownError;
    try {
      timeoutCallback();
    } catch (error) {
      thrownError = error;
    }

    // Verify the error was converted to an Error instance
    expect(thrownError).toBeInstanceOf(Error);
    expect(thrownError.message).toBe("string message");
  });

  test("should handle null/undefined by converting to Error", () => {
    // Call with null
    triggerUncaughtException(null);

    // Get the callback
    const timeoutCallback = global.setTimeout.mock.calls[0].callback;

    // Create a wrapper to catch the error
    let thrownError;
    try {
      timeoutCallback();
    } catch (error) {
      thrownError = error;
    }

    // Verify the error was converted to an Error instance
    expect(thrownError).toBeInstanceOf(Error);
    expect(thrownError.message).toBe("null");
  });
});
