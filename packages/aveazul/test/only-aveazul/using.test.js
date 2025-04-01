"use strict";

const AveAzul = require("../../lib/aveazul");

describe("AveAzul.using", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * If a disposer throws or rejects, then bluebird throw an exception (crashing the process in node.js)
   * by doing this: `setTimeout(function(){throw e;}, 0);`, which is out of band exception that only
   * uncaughtException handler can catch.  So `.catch()` can't handle it.
   *
   * Recommendation from bluebird:
   *  As a result, if you anticipate thrown errors or promise rejections while disposing of the resource you
   *  should use a try..catch block (or Promise.try) and write the appropriate catch code to handle the
   *  errors. If it's not possible to sensibly handle the error, letting the process crash is the next best
   *  option.
   */
  test("should throw exception if a disposer throws", async () => {
    const cleanupCalled = [false, false, false];
    const resources = [{ id: 1 }, { id: 2 }, { id: 3 }];
    let uncaughtError;
    jest.spyOn(AveAzul, "___throwUncaughtError").mockImplementation((err) => {
      uncaughtError = err;
    });

    const disposer1 = AveAzul.resolve(resources[0]).disposer(() => {
      cleanupCalled[0] = true;
    });

    const disposer2 = AveAzul.resolve(resources[1]).disposer(() => {
      cleanupCalled[1] = true;
      throw new Error("Cleanup error");
    });

    const disposer3 = AveAzul.resolve(resources[2]).disposer(() => {
      cleanupCalled[2] = true;
    });

    let errorThrown = false;
    // Should not throw even though a disposer throws
    // test using ...args syntax with multiple disposers
    const result = await AveAzul.using(
      disposer1,
      disposer2,
      disposer3,
      () => "success"
    ).catch(() => {
      errorThrown = true;
    });

    expect(result).toBe("success");
    expect(cleanupCalled).toEqual([true, true, true]);
    expect(uncaughtError).toBeInstanceOf(Error);
    expect(uncaughtError.message).toBe("cleanup resources failed");
  });

  test("should throw for invalid or missing arguments", async () => {
    expect(() => AveAzul.using()).toThrow(
      "resrouces and handler function required"
    );
    expect(() => AveAzul.using([])).toThrow(
      "resrouces and handler function required"
    );
    expect(() => AveAzul.using([], () => {}, "blah")).toThrow(
      "only two arguments are allowed when passing an array of resources"
    );
    expect(() => AveAzul.using([], "blah")).toThrow(
      "handler must be a function"
    );
  });
});
