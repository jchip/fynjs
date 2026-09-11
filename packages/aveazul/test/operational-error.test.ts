import { describe, test, expect } from "vitest";
import { verify } from "run-verify";
import AveAzul from "./promise-lib.ts";

describe("OperationalError", () => {
  test("should be a constructor", () => {
    expect(typeof AveAzul.OperationalError).toBe("function");
    expect(new AveAzul.OperationalError("test")).toBeInstanceOf(Error);
    expect(new AveAzul.OperationalError("test")).toBeInstanceOf(
      AveAzul.OperationalError
    );
  });

  test("should have isOperational property", () => {
    const error = new AveAzul.OperationalError("test");
    expect(error.isOperational).toBe(true);
  });

  test("should have correct name and message", () => {
    const error = new AveAzul.OperationalError("test message");
    expect(error.name).toBe("OperationalError");
    expect(error.message).toBe("test message");
  });
});

describe("AveAzul.prototype.error", () => {
  test("should catch operational errors", () => {
    const promise = AveAzul.reject(
      new AveAzul.OperationalError("test operational error")
    );

    return verify({ timeout: 500 })
      .step(() =>
        promise.error((err) => {
          expect(err).toBeInstanceOf(AveAzul.OperationalError);
          expect(err.message).toBe("test operational error");
          return "handled";
        })
      )
      .step((result) => {
        expect(result).toBe("handled");
      });
  });

  test("should catch errors marked as operational", () => {
    const error: Error & { isOperational?: boolean } = new Error(
      "marked as operational"
    );
    error.isOperational = true;

    const promise = AveAzul.reject(error);

    return verify({ timeout: 500 })
      .step(() =>
        promise.error((err) => {
          expect(err).toBeInstanceOf(Error);
          // error() hands back a plain Error; isOperational is the ad-hoc marker
          // this test set on it.
          const marked = err as Error & { isOperational?: boolean };
          expect(marked.isOperational).toBe(true);
          expect(err.message).toBe("marked as operational");
          return "handled";
        })
      )
      .step((result) => {
        expect(result).toBe("handled");
      });
  });

  test("should not catch programmer errors", () => {
    const promise = AveAzul.reject(new TypeError("programmer error"));

    return verify({ timeout: 500 })
      .expectErrorToBe("programmer error")
      .step(() => promise.error(() => "should not reach here"))
      .step((err) => {
        expect(err).toBeInstanceOf(TypeError);
      });
  });

  test("should propagate errors from handler", () => {
    const promise = AveAzul.reject(new AveAzul.OperationalError("test error"));

    return verify({ timeout: 500 })
      .expectErrorToBe("error from handler")
      .step(() =>
        promise.error(() => {
          throw new Error("error from handler");
        })
      )
      .step((err) => {
        expect(err).toBeInstanceOf(Error);
      });
  });

  test("should work with resolved promises", () => {
    const promise = AveAzul.resolve("success");

    return verify({ timeout: 500 })
      .step(() => promise.error(() => "should not reach here"))
      .step((result) => {
        expect(result).toBe("success");
      });
  });

  test("should work with promise chains", () => {
    // `.then()` is re-declared to return AveAzul (it constructs through `this` per spec),
    // so the chain keeps its bluebird methods with no cast - see FPM-121.
    const chained = AveAzul.resolve(1).then((x) => {
      if (x === 1) {
        throw new AveAzul.OperationalError("operational in then");
      }
      return x;
    });

    return verify({ timeout: 500 })
      .step(() =>
        chained.error((err) => {
          expect(err).toBeInstanceOf(AveAzul.OperationalError);
          expect(err.message).toBe("operational in then");
          return "handled in chain";
        })
      )
      .step((result) => {
        expect(result).toBe("handled in chain");
      });
  });
});
