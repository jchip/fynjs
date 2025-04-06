"use strict";

const AveAzul = require("../../lib/aveazul");
const { AggregateError } = require("@jchip/error");

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
      return AveAzul.delay(500).throw(new Error("Cleanup error"));
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
    expect(uncaughtError).toBeInstanceOf(AggregateError);
    expect(uncaughtError.message).toBe("cleanup resources failed");
    expect(uncaughtError.errors).toEqual([new Error("Cleanup error")]);
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

  test("should work with objects that look like Disposers but aren't instances of Disposer class", async () => {
    // Create an object that has the same interface as a Disposer but isn't an instance
    const resource = { value: "test resource", disposed: false };

    // This object has _promise and _data properties like a Disposer but is not an instance of Disposer
    const disposerLike = {
      _promise: Promise.resolve(resource),
      _data: (res) => {
        res.disposed = true;
        return Promise.resolve(); // Disposer functions can be async
      },
    };

    const result = await AveAzul.using([disposerLike], (res) => {
      expect(res[0]).toBe(resource);
      expect(res[0].disposed).toBe(false);
      return "success with disposer-like object";
    });

    expect(resource.disposed).toBe(true);
    expect(result).toBe("success with disposer-like object");
  });
});

// Add test for Bluebird interoperability
describe("AveAzul.using with Bluebird", () => {
  // Require the real Bluebird library
  const Bluebird = require("bluebird");

  test("should work with disposers created by Bluebird", async () => {
    // Create a resource
    const resource = { value: "bluebird resource", disposed: false };

    // Create a disposer using Bluebird
    const bluebirdDisposer = Bluebird.resolve(resource).disposer((res) => {
      res.disposed = true;
    });

    // Use the Bluebird disposer with AveAzul's using
    const result = await AveAzul.using([bluebirdDisposer], (res) => {
      // Verify we received the resource properly
      expect(res[0]).toBe(resource);
      expect(res[0].value).toBe("bluebird resource");
      expect(res[0].disposed).toBe(false);
      return "success with bluebird disposer";
    });

    // Verify the disposer function was called
    expect(resource.disposed).toBe(true);
    expect(result).toBe("success with bluebird disposer");
  });

  test("should handle multiple Bluebird disposers", async () => {
    // Create multiple resources
    const resources = [
      { id: 1, disposed: false },
      { id: 2, disposed: false },
      { id: 3, disposed: false },
    ];

    // Create disposers using Bluebird
    const disposers = resources.map((res) =>
      Bluebird.resolve(res).disposer((r) => {
        r.disposed = true;
      })
    );

    // Track the order resources are used
    const usageOrder = [];

    // Use the Bluebird disposers with AveAzul's using
    await AveAzul.using(disposers, (res) => {
      // Record usage order
      res.forEach((r) => usageOrder.push(r.id));

      // Verify none are disposed yet
      expect(res[0].disposed).toBe(false);
      expect(res[1].disposed).toBe(false);
      expect(res[2].disposed).toBe(false);

      return "success";
    });

    // Verify all disposers were called
    expect(resources[0].disposed).toBe(true);
    expect(resources[1].disposed).toBe(true);
    expect(resources[2].disposed).toBe(true);

    // Verify usage order matches resource order
    expect(usageOrder).toEqual([1, 2, 3]);
  });

  test("should handle errors in handler with Bluebird disposers", async () => {
    // Create a resource
    const resource = { value: "error test", disposed: false };

    // Create a disposer using Bluebird
    const bluebirdDisposer = Bluebird.resolve(resource).disposer((res) => {
      res.disposed = true;
    });

    // Handler throws error
    const error = new Error("Handler error");
    await expect(
      AveAzul.using([bluebirdDisposer], () => {
        throw error;
      })
    ).rejects.toThrow(error);

    // Verify cleanup still happened
    expect(resource.disposed).toBe(true);
  });
});
