import { triggerUncaughtException } from "../src/util.ts";

describe("triggerUncaughtException", () => {
  // Save original setTimeout
  let originalSetTimeout;

  beforeEach(() => {
    // Save the original setTimeout
    originalSetTimeout = global.setTimeout;

    // Mock setTimeout to capture callbacks instead of executing them
    global.setTimeout = vi.fn((callback) => {
      // Store the callback for testing, but don't execute it
      global.setTimeout._callback = callback;
      return 123; // Return a timeout ID
    });
  });

  afterEach(() => {
    // Restore original setTimeout
    global.setTimeout = originalSetTimeout;
  });

  test("should schedule a setTimeout with 0ms delay", () => {
    const error = new Error("Test error");

    triggerUncaughtException(error);

    // Verify setTimeout was called with a function and 0ms delay
    expect(global.setTimeout).toHaveBeenCalledTimes(1);
    expect(global.setTimeout).toHaveBeenCalledWith(expect.any(Function), 0);
  });

  test("should wrap the error in an Error object if it is not an Error", () => {
    const nonError = "Test error string";

    triggerUncaughtException(nonError);

    // Verify setTimeout was called
    expect(global.setTimeout).toHaveBeenCalledTimes(1);

    // The callback should throw an Error, not the original string
    const callback = global.setTimeout._callback;
    expect(() => callback()).toThrow(Error);
    expect(() => callback()).toThrow("Test error string");
  });

  test("should use the original Error object if it is an Error", () => {
    const originalError = new Error("Original error");

    triggerUncaughtException(originalError);

    // Verify setTimeout was called
    expect(global.setTimeout).toHaveBeenCalledTimes(1);

    // The callback should throw the original Error
    const callback = global.setTimeout._callback;
    expect(() => callback()).toThrow(originalError);
  });

  test("should schedule callback on next event loop tick", () => {
    const error = new Error("Test error");

    triggerUncaughtException(error);

    // The callback should not have been executed yet
    // (because we mocked setTimeout to not actually execute it)
    expect(global.setTimeout).toHaveBeenCalledWith(expect.any(Function), 0);
  });
});
