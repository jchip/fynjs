import { setImmediate as nextTurn } from "node:timers/promises";
import { verify } from "run-verify";
import { describe, expect, test } from "vitest";
import AveAzul from "./promise-lib.ts";

describe("public Promise method regressions", () => {
  test("any works without test-side initialization", () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.any([AveAzul.resolve(42)]))
      .step((value) => expect(value).toBe(42))
      .step(() => AveAzul.resolve([42]).any())
      .step((value) => expect(value).toBe(42));
  });

  test("instance delay preserves the value and AveAzul methods", () => {
    return verify({ timeout: 1000 })
      .step(() => {
        const delayed = AveAzul.resolve(42).delay(1);
        expect(delayed).toBeInstanceOf(AveAzul);
        return delayed;
      })
      .step((value) => expect(value).toBe(42));
  });

  test("instance delay waits for its receiver", () => {
    let release = () => {};
    let delayed: Promise<unknown>;
    let settled = false;
    return verify({ timeout: 1000, cleanup: () => release() })
      .step(() => {
        const source = new AveAzul<number>((resolve) => {
          release = () => resolve(42);
        });
        delayed = source.delay(0).then((value) => {
          settled = true;
          return value;
        });
        return AveAzul.delay(20);
      })
      .step(() => {
        expect(settled).toBe(false);
        release();
        return delayed;
      })
      .step((value) => expect(value).toBe(42));
  });

  test("instance delay propagates receiver rejection", () => {
    const error = new Error("source failed");
    return verify({ timeout: 1000 })
      .expectError.step(() => AveAzul.reject(error).delay(1))
      .step((reason) => expect(reason).toBe(error));
  });

  test("tapCatch waits for an asynchronous side effect", () => {
    const error = new Error("source failed");
    const events: string[] = [];
    let release = () => {};
    let result: Promise<unknown>;
    return verify({ timeout: 1000, cleanup: () => release() })
      .step(() => {
        const gate = new Promise<void>((resolve) => { release = resolve; });
        result = AveAzul.reject(error)
          .tapCatch(async () => {
            await gate;
            events.push("side effect");
          })
          .catch((reason) => {
            events.push("caught");
            return reason;
          });
        return nextTurn();
      })
      .step(() => {
        expect(events).toEqual([]);
        release();
        return result;
      })
      .step((reason) => {
        expect(reason).toBe(error);
        expect(events).toEqual(["side effect", "caught"]);
      });
  });

  test("tapCatch propagates a rejected side effect", () => {
    const error = new Error("side effect failed");
    return verify({ timeout: 1000 })
      .expectError.step(() => AveAzul.reject(new Error("source failed"))
        .tapCatch(async () => { throw error; }))
      .step((reason) => expect(reason).toBe(error));
  });

  test("throw waits for receiver fulfillment", () => {
    const error = new Error("replacement");
    let release = () => {};
    let result: Promise<unknown>;
    let settled = false;
    return verify({ timeout: 1000, cleanup: () => release() })
      .step(() => {
        const source = new AveAzul<void>((resolve) => { release = resolve; });
        result = source.throw(error).catch((reason) => {
          settled = true;
          return reason;
        });
        return nextTurn();
      })
      .step(() => {
        expect(settled).toBe(false);
        release();
        return result;
      })
      .step((reason) => expect(reason).toBe(error));
  });

  test("throw preserves receiver rejection", () => {
    const error = new Error("source failed");
    return verify({ timeout: 1000 })
      .expectError.step(() => AveAzul.reject(error).throw(new Error("replacement")))
      .step((reason) => expect(reason).toBe(error));
  });

  test("some resolves zero requested results for empty and pending inputs", () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.some([], 0))
      .step((value) => expect(value).toEqual([]))
      .step(() => AveAzul.resolve([]).some(0))
      .step((value) => expect(value).toEqual([]))
      .step(() => AveAzul.some([new AveAzul(() => {})], 0))
      .step((value) => expect(value).toEqual([]));
  });

  test("some rejects requests exceeding the input length", () => {
    return verify({ timeout: 1000 })
      .expectErrorInstanceMatch(RangeError)
      .step(() => AveAzul.some([], 1))
      .expectErrorInstanceMatch(RangeError)
      .step(() => AveAzul.resolve([1]).some(2));
  });

  test.each([-1, 0.5, NaN, Infinity, 2147483648])(
    "some rejects invalid count %s",
    async (count) => {
      await verify({ timeout: 1000 })
        .expectErrorInstanceMatch(TypeError)
        .step(() => AveAzul.some([1], count))
        .expectErrorInstanceMatch(TypeError)
        .step(() => AveAzul.resolve([1]).some(count));
    }
  );

  test("some observes rejected inputs when the requested count is impossible", () => {
    return verify({ timeout: 1000 })
      .expectErrorInstanceMatch(RangeError)
      .step(() => AveAzul.some([Promise.reject(new Error("input failed"))], 2))
      .step(() => nextTurn());
  });
});
