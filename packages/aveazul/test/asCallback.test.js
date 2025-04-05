"use strict";

const AveAzul = require("./promise-lib");

describe("AveAzul.prototype.asCallback", () => {
  test("should call callback with value when promise resolves", (done) => {
    AveAzul.resolve("success").asCallback((err, value) => {
      expect(err).toBeNull();
      expect(value).toBe("success");
      done();
    });
  });

  test("should call callback with error when promise rejects", (done) => {
    const testError = new Error("test error");
    AveAzul.reject(testError).asCallback((err) => {
      expect(err).toBe(testError);
      done();
    });
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

  test("should spread array values with spread option", (done) => {
    AveAzul.resolve([1, 2, 3]).asCallback(
      (err, a, b, c) => {
        expect(err).toBeNull();
        expect(a).toBe(1);
        expect(b).toBe(2);
        expect(c).toBe(3);
        done();
      },
      { spread: true }
    );
  });

  test("should not spread array values without spread option", (done) => {
    AveAzul.resolve([1, 2, 3]).asCallback((err, value) => {
      expect(err).toBeNull();
      expect(Array.isArray(value)).toBe(true);
      expect(value).toEqual([1, 2, 3]);
      done();
    });
  });

  test("should work with delay", (done) => {
    let callbackCalled = false;

    AveAzul.delay(50, "delayed value").asCallback((err, value) => {
      callbackCalled = true;
      expect(err).toBeNull();
      expect(value).toBe("delayed value");
      done();
    });

    // Verify callback hasn't been called yet
    expect(callbackCalled).toBe(false);
  });

  test("nodeify should function the same as asCallback", (done) => {
    AveAzul.resolve("success").nodeify((err, value) => {
      expect(err).toBeNull();
      expect(value).toBe("success");
      done();
    });
  });
});
