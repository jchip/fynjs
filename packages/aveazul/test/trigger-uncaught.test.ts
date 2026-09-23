import { verify } from "run-verify";
import { setTimeout as realSetTimeout } from "node:timers";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { triggerUncaughtException } from "../src/util.ts";

describe("triggerUncaughtException", () => {
  let setTimeoutMock: ReturnType<
    typeof vi.fn<
      (callback: () => void, delay: number, ...args: unknown[]) => number
    >
  >;
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
    vi.stubGlobal("setTimeout", (callback, delay, ...args) =>
      delay === 0
        ? setTimeoutMock(callback, delay, ...args)
        : realSetTimeout(callback, delay, ...args)
    );
  });

  afterEach(() => {
    // Restore original setTimeout
    vi.unstubAllGlobals();
  });

  test("should schedule a setTimeout with 0ms delay", () =>
    verify({ timeout: 1000 })
      .step(() => triggerUncaughtException(new Error("Test error")))
      .step(() => {
        expect(setTimeoutMock).toHaveBeenCalledTimes(1);
        expect(setTimeoutMock).toHaveBeenCalledWith(expect.any(Function), 0);
      }));

  test("should wrap the error in an Error object if it is not an Error", () =>
    verify({ timeout: 1000 })
      .step(() => triggerUncaughtException("Test error string"))
      .step(() => {
        expect(setTimeoutMock).toHaveBeenCalledTimes(1);
      })
      .expectErrorToBe("Test error string")
      .expectErrorInstanceMatch(Error)
      .step(() => capturedCallback()));

  test("should use the original Error object if it is an Error", () => {
    const originalError = new Error("Original error");
    return verify({ timeout: 1000 })
      .step(() => triggerUncaughtException(originalError))
      .step(() => {
        expect(setTimeoutMock).toHaveBeenCalledTimes(1);
      })
      .expectError.step(() => capturedCallback())
      .step((error) => {
        expect(error).toBe(originalError);
      });
  });

  test("should schedule callback on next event loop tick", () =>
    verify({ timeout: 1000 })
      .step(() => triggerUncaughtException(new Error("Test error")))
      .step(() => {
        // The mock captures the callback without executing it.
        expect(setTimeoutMock).toHaveBeenCalledWith(expect.any(Function), 0);
      }));
});
