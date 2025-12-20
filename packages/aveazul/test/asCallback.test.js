import { asyncVerify, expectError } from "run-verify";
import AveAzul from "./promise-lib.js";

describe("AveAzul.prototype.asCallback", () => {
  test("should call callback with value when promise resolves", () => {
    return asyncVerify(
      (next) => AveAzul.resolve("success").asCallback(next),
      (value) => {
        expect(value).toBe("success");
      }
    );
  });

  test("should call callback with error when promise rejects", () => {
    const testError = new Error("test error");
    return asyncVerify(
      expectError((next) => AveAzul.reject(testError).asCallback(next)),
      (err) => {
        expect(err).toBe(testError);
      }
    );
  });

  test("should return the same promise instance", () => {
    const promise = AveAzul.resolve("value");
    const returnValue = promise.asCallback(() => {});
    expect(returnValue).toBe(promise);
  });

  test("should ignore non-function callbacks", () => {
    // Should not throw
    const promise = AveAzul.resolve("value");
    const returnValue = promise.asCallback(null);
    expect(returnValue).toBe(promise);
  });

  test("should spread array values with spread option", () => {
    return new Promise((resolve) => {
      AveAzul.resolve([1, 2, 3]).asCallback(
        (err, a, b, c) => {
          expect(err).toBeNull();
          expect(a).toBe(1);
          expect(b).toBe(2);
          expect(c).toBe(3);
          resolve();
        },
        { spread: true }
      );
    });
  });

  test("should not spread array values without spread option", () => {
    return asyncVerify(
      (next) => AveAzul.resolve([1, 2, 3]).asCallback(next),
      (value) => {
        expect(Array.isArray(value)).toBe(true);
        expect(value).toEqual([1, 2, 3]);
      }
    );
  });

  test("should work with delay", () => {
    let callbackCalled = false;

    const promise = new Promise((resolve) => {
      AveAzul.delay(50, "delayed value").asCallback((err, value) => {
        callbackCalled = true;
        expect(err).toBeNull();
        expect(value).toBe("delayed value");
        resolve();
      });
    });

    // Verify callback hasn't been called yet
    expect(callbackCalled).toBe(false);
    return promise;
  });

  test("nodeify should function the same as asCallback", () => {
    return asyncVerify(
      (next) => AveAzul.resolve("success").nodeify(next),
      (value) => {
        expect(value).toBe("success");
      }
    );
  });
});
