import { signal, verify } from "run-verify";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { AveAzul } from "../../src/index.ts";
import { AggregateError } from "@jchip/error";
import Bluebird from "bluebird";

describe("AveAzul.using", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    // restore, not clear: the first test replaces the static
    // ___throwUncaughtError, and clearAllMocks would leave the replacement in
    // place. Restoring here keeps it from outliving the test that installed it
    // even if an assertion above the end of that test fails.
    vi.restoreAllMocks();
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
  test("should throw exception if a disposer throws", () => {
    const cleanupCalled = [false, false, false];
    const resources = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const thrown = signal<unknown>();
    let restore = () => {};
    return verify({
      timeout: 1000,
      signals: { thrown },
      cleanup: () => restore(),
    })
      .step(() => {
        const spy = vi
          .spyOn(AveAzul, "___throwUncaughtError")
          .mockImplementation((error) => thrown.resolve(error));
        restore = () => spy.mockRestore();
      })
      .step(() => {
        const disposers = resources.map((resource, index) =>
          AveAzul.resolve(resource).disposer(() => {
            cleanupCalled[index] = true;
            if (index === 1)
              return AveAzul.delay(10).throw(new Error("Cleanup error"));
            return undefined;
          })
        );
        return AveAzul.using(
          disposers[0],
          disposers[1],
          disposers[2],
          () => "success"
        );
      })
      .step((result) => {
        expect(result).toBe("success");
        expect(cleanupCalled).toEqual([true, true, true]);
      })
      .awaiting(thrown)
      .step((error) => {
        expect(error).toBeInstanceOf(AggregateError);
        const aggregate = error as AggregateError;
        expect(aggregate.message).toBe("cleanup resources failed");
        expect(aggregate.errors).toEqual([new Error("Cleanup error")]);
      });
  });

  test("should throw for invalid or missing arguments", () => {
    // Called with no arguments on purpose, to exercise the runtime guard. The
    // signature requires at least one argument, so the call goes through a
    // deliberately widened view of the static.
    const usingUnchecked = AveAzul.using as (...args: unknown[]) => unknown;

    return verify({ timeout: 1000 })
      .expectErrorToBe("resrouces and handler function required")
      .step(() => usingUnchecked())
      .expectErrorToBe("resrouces and handler function required")
      .step(() => AveAzul.using([]))
      .expectErrorToBe(
        "only two arguments are allowed when passing an array of resources"
      )
      .step(() => AveAzul.using([], () => {}, "blah"))
      .expectErrorToBe("handler must be a function")
      .step(() => AveAzul.using([], "blah"));
  });

  test("should work with objects that look like Disposers but aren't instances of Disposer class", () => {
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

    return verify({ timeout: 1000 })
      .step(() =>
        AveAzul.using([disposerLike], (res) => {
          expect(res[0]).toBe(resource);
          expect(res[0].disposed).toBe(false);
          return "success with disposer-like object";
        })
      )
      .step((result) => {
        expect(resource.disposed).toBe(true);
        expect(result).toBe("success with disposer-like object");
      });
  });
});

// Add test for Bluebird interoperability
describe("AveAzul.using with Bluebird", () => {
  test("should work with disposers created by Bluebird", () => {
    // Create a resource
    const resource = { value: "bluebird resource", disposed: false };

    // Create a disposer using Bluebird
    const bluebirdDisposer = Bluebird.resolve(resource).disposer((res) => {
      res.disposed = true;
    });

    // Use the Bluebird disposer with AveAzul's using

    return verify({ timeout: 1000 })
      .step(() =>
        AveAzul.using([bluebirdDisposer], (res) => {
          // Verify we received the resource properly
          expect(res[0]).toBe(resource);
          expect(res[0].value).toBe("bluebird resource");
          expect(res[0].disposed).toBe(false);
          return "success with bluebird disposer";
        })
      )
      .step((result) => {
        expect(resource.disposed).toBe(true);
        expect(result).toBe("success with bluebird disposer");
      });
  });

  test("should handle multiple Bluebird disposers", () => {
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

    return verify({ timeout: 1000 })
      .step(() =>
        AveAzul.using(disposers, (res) => {
          // Record usage order
          res.forEach((r) => usageOrder.push(r.id));

          // Verify none are disposed yet
          expect(res[0].disposed).toBe(false);
          expect(res[1].disposed).toBe(false);
          expect(res[2].disposed).toBe(false);

          return "success";
        })
      )
      .step(() => {
        expect(resources[0].disposed).toBe(true);
        expect(resources[1].disposed).toBe(true);
        expect(resources[2].disposed).toBe(true);
        expect(usageOrder).toEqual([1, 2, 3]);
      });
  });

  test("should handle errors in handler with Bluebird disposers", () => {
    // Create a resource
    const resource = { value: "error test", disposed: false };

    // Create a disposer using Bluebird
    const bluebirdDisposer = Bluebird.resolve(resource).disposer((res) => {
      res.disposed = true;
    });

    // Handler throws error
    const error = new Error("Handler error");

    return verify({ timeout: 1000 })
      .expectError.step(() =>
        AveAzul.using([bluebirdDisposer], () => {
          throw error;
        })
      )
      .step((caught) => {
        expect(caught).toBe(error);
      })
      .step(() => {
        expect(resource.disposed).toBe(true);
      });
  });
});
