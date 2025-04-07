"use strict";

const AveAzul = require("./promise-lib");

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
  test("should catch operational errors", async () => {
    const promise = AveAzul.reject(
      new AveAzul.OperationalError("test operational error")
    );

    const result = await promise
      .error((err) => {
        expect(err).toBeInstanceOf(AveAzul.OperationalError);
        expect(err.message).toBe("test operational error");
        return "handled";
      })
      .catch(() => "should not reach here");

    expect(result).toBe("handled");
  });

  test("should catch errors marked as operational", async () => {
    const error = new Error("marked as operational");
    error.isOperational = true;

    const promise = AveAzul.reject(error);

    const result = await promise
      .error((err) => {
        expect(err).toBeInstanceOf(Error);
        expect(err.isOperational).toBe(true);
        expect(err.message).toBe("marked as operational");
        return "handled";
      })
      .catch(() => "should not reach here");

    expect(result).toBe("handled");
  });

  test("should not catch programmer errors", async () => {
    const promise = AveAzul.reject(new TypeError("programmer error"));

    const result = await promise
      .error(() => "should not reach here")
      .catch((err) => {
        expect(err).toBeInstanceOf(TypeError);
        expect(err.message).toBe("programmer error");
        return "caught programmer error";
      });

    expect(result).toBe("caught programmer error");
  });

  test("should propagate errors from handler", async () => {
    const promise = AveAzul.reject(new AveAzul.OperationalError("test error"));

    const result = await promise
      .error(() => {
        throw new Error("error from handler");
      })
      .catch((err) => {
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe("error from handler");
        return "caught handler error";
      });

    expect(result).toBe("caught handler error");
  });

  test("should work with resolved promises", async () => {
    const promise = AveAzul.resolve("success");

    const result = await promise.error(() => "should not reach here");

    expect(result).toBe("success");
  });

  test("should work with promise chains", async () => {
    const result = await AveAzul.resolve(1)
      .then((x) => {
        if (x === 1) {
          throw new AveAzul.OperationalError("operational in then");
        }
        return x;
      })
      .error((err) => {
        expect(err).toBeInstanceOf(AveAzul.OperationalError);
        expect(err.message).toBe("operational in then");
        return "handled in chain";
      });

    expect(result).toBe("handled in chain");
  });
});
