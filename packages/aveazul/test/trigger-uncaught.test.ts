import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { triggerUncaughtException } from "../src/util.ts";

describe("triggerUncaughtException", () => {
  let setTimeoutMock: ReturnType<typeof vi.fn>;
  // The callback the mock captured, kept here rather than stashed on the mock
  // function itself so it stays typed.
  let capturedCallback: () => void;

  beforeEach(() => {
    capturedCallback = undefined;

    // Mock setTimeout to capture callbacks instead of executing them
    setTimeoutMock = vi.fn((callback: () => void) => {
      capturedCallback = callback;
      return 123; // Return a timeout ID
    });

    // Installed through vi.stubGlobal() rather than by assigning
    // `global.setTimeout`: @types/node's setTimeout carries a `__promisify__`
    // property that no plain mock function can satisfy.
    vi.stubGlobal("setTimeout", setTimeoutMock);
  });

  afterEach(() => {
    // Restore original setTimeout
    vi.unstubAllGlobals();
  });

  test("should schedule a setTimeout with 0ms delay", () => {
    const error = new Error("Test error");

    triggerUncaughtException(error);

    // Verify setTimeout was called with a function and 0ms delay
    expect(setTimeoutMock).toHaveBeenCalledTimes(1);
    expect(setTimeoutMock).toHaveBeenCalledWith(expect.any(Function), 0);
  });

  test("should wrap the error in an Error object if it is not an Error", () => {
    const nonError = "Test error string";

    triggerUncaughtException(nonError);

    // Verify setTimeout was called
    expect(setTimeoutMock).toHaveBeenCalledTimes(1);

    // The callback should throw an Error, not the original string
    const callback = capturedCallback;
    expect(() => callback()).toThrow(Error);
    expect(() => callback()).toThrow("Test error string");
  });

  test("should use the original Error object if it is an Error", () => {
    const originalError = new Error("Original error");

    triggerUncaughtException(originalError);

    // Verify setTimeout was called
    expect(setTimeoutMock).toHaveBeenCalledTimes(1);

    // The callback should throw the original Error
    const callback = capturedCallback;
    expect(() => callback()).toThrow(originalError);
  });

  test("should schedule callback on next event loop tick", () => {
    const error = new Error("Test error");

    triggerUncaughtException(error);

    // The callback should not have been executed yet
    // (because we mocked setTimeout to not actually execute it)
    expect(setTimeoutMock).toHaveBeenCalledWith(expect.any(Function), 0);
  });
});
