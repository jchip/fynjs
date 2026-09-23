import { describe, test, expect } from "vitest";
import { verify } from "run-verify";
import AveAzul from "./promise-lib.ts";

describe("OperationalError", () => {
  test("should be a constructor", () =>
    verify({ timeout: 1000 })
      .step(() => new AveAzul.OperationalError("test"))
      .step((error) => {
        expect(typeof AveAzul.OperationalError).toBe("function");
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(AveAzul.OperationalError);
      }));

  test("should have isOperational property", () =>
    verify({ timeout: 1000 })
      .step(() => new AveAzul.OperationalError("test"))
      .step((error) => {
        expect(error.isOperational).toBe(true);
      }));

  test("should have correct name and message", () =>
    verify({ timeout: 1000 })
      .step(() => new AveAzul.OperationalError("test message"))
      .step((error) => {
        expect(error.name).toBe("OperationalError");
        expect(error.message).toBe("test message");
      }));
});

describe("AveAzul.prototype.error", () => {
  test("should catch operational errors", () => {
    return verify({ timeout: 500 })
      .step(() =>
        AveAzul.reject<{ err: Error; result: string }>(
          new AveAzul.OperationalError("test operational error"),
        ).error((err) => ({ err, result: "handled" })),
      )
      .step(({ err, result }) => {
        expect(err).toBeInstanceOf(AveAzul.OperationalError);
        expect(err.message).toBe("test operational error");
        expect(result).toBe("handled");
      });
  });

  test("should catch errors marked as operational", () => {
    const error: Error & { isOperational?: boolean } = new Error(
      "marked as operational",
    );
    error.isOperational = true;

    return verify({ timeout: 500 })
      .step(() =>
        AveAzul.reject<{ err: Error; result: string }>(error).error((err) => ({
          err,
          result: "handled",
        })),
      )
      .step(({ err, result }) => {
        expect(err).toBeInstanceOf(Error);
        // error() hands back a plain Error; isOperational is the ad-hoc marker
        // this test set on it.
        const marked = err as Error & { isOperational?: boolean };
        expect(marked.isOperational).toBe(true);
        expect(err.message).toBe("marked as operational");
        expect(result).toBe("handled");
      });
  });

  test("should not catch programmer errors", () => {
    return verify({ timeout: 500 })
      .expectErrorToBe("programmer error")
      .expectErrorInstanceMatch(TypeError)
      .step(() =>
        AveAzul.reject(new TypeError("programmer error")).error(
          () => "should not reach here",
        ),
      );
  });

  test("should propagate errors from handler", () => {
    return verify({ timeout: 500 })
      .expectErrorToBe("error from handler")
      .expectErrorInstanceMatch(Error)
      .step(() =>
        AveAzul.reject(new AveAzul.OperationalError("test error")).error(
          () => {
            throw new Error("error from handler");
          },
        ),
      );
  });

  test("should work with resolved promises", () => {
    return verify({ timeout: 500 })
      .step(() => AveAzul.resolve("success").error(() => "should not reach here"))
      .step((result) => {
        expect(result).toBe("success");
      });
  });

  test("should work with promise chains", () => {
    // `.then()` is re-declared to return AveAzul (it constructs through `this` per spec),
    // so the chain keeps its bluebird methods with no cast - see FPM-121.
    return verify({ timeout: 500 })
      .step(() =>
        AveAzul.resolve(1)
          .then((x) => {
            if (x === 1) {
              throw new AveAzul.OperationalError("operational in then");
            }
            return x;
          })
          .error((err) => ({ err, result: "handled in chain" })),
      )
      .step((result) => {
        expect(result).toEqual({
          err: expect.any(AveAzul.OperationalError),
          result: "handled in chain",
        });
        expect(result).toMatchObject({
          err: { message: "operational in then" },
        });
      });
  });
});
