import { describe, it, expect, expectTypeOf } from "vitest";
import {
  asyncVerify,
  expectErrorMatch,
  expectErrorInstanceMatch,
  verify,
  wrapCheck
} from "../../src/index.js";

class BlahError extends Error {
  readonly blah = true;
}
const failure = Object.assign(new BlahError("invalid input"), { code: "E_BAD" });
const fail = () => {
  throw failure;
};

function types() {
  const single = verify().expectErrorInstanceMatch(BlahError).step(fail);
  const union = verify().expectErrorInstanceMatch([TypeError, BlahError]).step(fail);
  const tuple = [TypeError, BlahError] as const;
  const callback = verify()
    .expectErrorInstanceMatch(tuple)
    .callbackStep(next => next(failure));
  const async = verify()
    .expectErrorInstanceMatch(tuple)
    .asyncStep(() => Promise.reject(failure));
  const message = verify().expectErrorMatch("invalid").step(fail);
  expectTypeOf<Awaited<typeof single>>().toEqualTypeOf<BlahError>();
  expectTypeOf<Awaited<typeof union>>().toEqualTypeOf<TypeError | BlahError>();
  expectTypeOf<Awaited<typeof callback>>().toEqualTypeOf<TypeError | BlahError>();
  expectTypeOf<Awaited<typeof async>>().toEqualTypeOf<TypeError | BlahError>();
  expectTypeOf<Awaited<typeof message>>().toEqualTypeOf<unknown>();
  // @ts-expect-error - a message matcher is not a constructor
  verify().expectErrorMatch(TypeError);
  // @ts-expect-error - at least one constructor is required
  verify().expectErrorInstanceMatch([]);
  // @ts-expect-error - instances are not constructors
  verify().expectErrorInstanceMatch(new TypeError());
}
void types;

describe("error match modifiers", () => {
  it.each(["invalid", /INPUT/i, /^invalid input$/])("matches messages with %s", async matcher => {
    expect(await verify().expectErrorMatch(matcher, "E_BAD").step(fail)).toBe(failure);
  });

  it.each(["absent", /^invalid$/])("rejects a mismatched message %s", async matcher => {
    await expect(Promise.resolve(verify().expectErrorMatch(matcher).step(fail))).rejects.toThrow(
      "message"
    );
  });

  it("supports single classes, subclasses and either member of an array", async () => {
    expect(await verify().expectErrorInstanceMatch(Error, "input", "E_BAD").step(fail)).toBe(
      failure
    );
    for (const error of [new TypeError("invalid input"), failure]) {
      expect(
        await verify()
          .expectErrorInstanceMatch([TypeError, BlahError], /invalid/)
          .step(() => {
            throw error;
          })
      ).toBe(error);
    }
    await expect(
      Promise.resolve(verify().expectErrorInstanceMatch([TypeError, RangeError]).step(fail))
    ).rejects.toThrow("TypeError or RangeError");
  });

  it("captures constructor alternatives when declaring the requirement", async () => {
    const classes: [typeof TypeError | typeof BlahError] = [BlahError];
    const prefix = verify().expectErrorInstanceMatch(classes);
    classes[0] = TypeError;
    expect(await prefix.step(fail)).toBe(failure);
  });

  it("supports instance-only and code-only constraints", async () => {
    expect(await verify().expectErrorInstanceMatch(BlahError).step(fail)).toBe(failure);
    expect(await verify().expectErrorInstanceMatch(BlahError, undefined, "E_BAD").step(fail)).toBe(
      failure
    );
    expect(
      await verify()
        .expectErrorMatch("", 0)
        .step(() => {
          throw { message: "", code: 0 };
        })
    ).toEqual({ message: "", code: 0 });
    await expect(
      Promise.resolve(verify().expectErrorMatch("invalid", 0).step(fail))
    ).rejects.toThrow("code");
    await expect(
      Promise.resolve(verify().expectErrorInstanceMatch(BlahError, "invalid", "WRONG").step(fail))
    ).rejects.toThrow("code");
  });

  it("handles Promise and asynchronous callback failures", async () => {
    expect(
      await verify()
        .expectErrorMatch(/input/)
        .step(() => Promise.reject(failure))
    ).toBe(failure);
    const error = await verify()
      .keep.expectErrorInstanceMatch([TypeError, BlahError], "invalid", "E_BAD")
      .callbackStep(next => {
        queueMicrotask(() => next(failure));
      });
    expect(error).toBe(failure);
    expectTypeOf(error).toEqualTypeOf<TypeError | BlahError>();
  });

  it("rejects ordinary, Promise and callback success, including returned errors", async () => {
    await expect(
      Promise.resolve(verify().expectErrorMatch("invalid").step(failure))
    ).rejects.toThrow("expecting error");
    await expect(
      Promise.resolve(
        verify()
          .expectErrorInstanceMatch(BlahError)
          .step(() => Promise.resolve(failure))
      )
    ).rejects.toThrow("expecting error");
    await expect(
      Promise.resolve(
        verify()
          .expectErrorInstanceMatch(BlahError)
          .callbackStep(next => next())
      )
    ).rejects.toThrow("expecting error");
  });

  it("accumulates requirements and preserves omitted message/code constraints", async () => {
    const prefix = verify().expectErrorInstanceMatch([TypeError, BlahError], "invalid", "E_BAD");
    const result = await prefix
      .expectErrorInstanceMatch(BlahError)
      .expectErrorMatch(/input/)
      .expectError.step(fail);
    expect(result).toBe(failure);
    expect(result.blah).toBe(true);
    await expect(Promise.resolve(prefix.expectErrorMatch("absent").step(fail))).rejects.toThrow(
      "message"
    );
    await expect(
      Promise.resolve(
        verify()
          .expectErrorMatch("input", "WRONG")
          .expectErrorInstanceMatch(BlahError)
          .expectErrorMatch("invalid")
          .step(fail)
      )
    ).rejects.toThrow("code");
    await expect(
      Promise.resolve(
        verify().expectErrorInstanceMatch(TypeError).expectErrorInstanceMatch(BlahError).step(fail)
      )
    ).rejects.toThrow("TypeError");
    expect(
      await prefix
        .step(fail)
        .step(error => error.message)
        .step("done")
    ).toBe("done");
  });

  it("combines new and legacy requirements without weakening either", async () => {
    expect(
      await verify()
        .expectErrorMatch(/input/)
        .expectErrorToBe("invalid input", "E_BAD")
        .expectErrorInstanceMatch(BlahError)
        .step(fail)
    ).toBe(failure);
    await expect(
      Promise.resolve(
        verify().expectErrorInstanceMatch(TypeError).expectErrorToBe(BlahError).step(fail)
      )
    ).rejects.toThrow("TypeError");
  });

  it.each([/invalid/g, /invalid/y])("does not consume state of %s", async matcher => {
    matcher.lastIndex = 3;
    const prefix = verify().expectErrorMatch(matcher);
    expect(await prefix.step(fail)).toBe(failure);
    expect(await prefix.step(fail)).toBe(failure);
    expect(matcher.lastIndex).toBe(3);
  });

  it.each([null, undefined, 1, "invalid", { message: 42 }])(
    "fails safely on non-message values: %s",
    async value => {
      let cleaned = 0;
      await expect(
        Promise.resolve(
          verify({
            cleanup: () => {
              cleaned++;
            }
          })
            .expectErrorMatch(/invalid/)
            .step(() => {
              throw value;
            })
        )
      ).rejects.toThrow("message");
      expect(cleaned).toBe(1);
    }
  );

  it("routes asynchronous mismatches and throwing message access through cleanup", async () => {
    let cleaned = 0;
    const config = {
      cleanup: () => {
        cleaned++;
      }
    };
    await expect(
      Promise.resolve(
        verify(config)
          .expectErrorMatch("invalid")
          .step(() => Promise.reject(null))
      )
    ).rejects.toThrow("message");
    await expect(
      Promise.resolve(
        verify(config)
          .expectErrorMatch("absent")
          .callbackStep(next => {
            queueMicrotask(() => next(failure));
          })
      )
    ).rejects.toThrow("message");
    const getterError = new Error("getter failed");
    await expect(
      Promise.resolve(
        verify(config)
          .expectErrorMatch("invalid")
          .step(() => {
            throw {
              get message() {
                throw getterError;
              }
            };
          })
      )
    ).rejects.toBe(getterError);
    expect(cleaned).toBe(3);
  });

  it("supports non-Error instances and preserves original identity", async () => {
    class Failure {
      value = 42;
    }
    const value = new Failure();
    const result = await verify()
      .expectErrorInstanceMatch(Failure)
      .step(() => {
        throw value;
      });
    expect(result).toBe(value);
    expectTypeOf(result).toEqualTypeOf<Failure>();
  });

  it("rejects empty constructor arrays at the API boundary", () => {
    expect(() => verify().expectErrorInstanceMatch([] as any)).toThrow("at least one");
    expect(() => expectErrorInstanceMatch(fail, [] as any)).toThrow("at least one");
  });

  it("supports positional and wrapper APIs, including callbacks and accumulated checks", async () => {
    expect(await asyncVerify(expectErrorMatch(fail, /invalid/, "E_BAD"))).toBe(failure);
    expect(
      await asyncVerify(expectErrorInstanceMatch(fail, [TypeError, BlahError], "input", "E_BAD"))
    ).toBe(failure);
    const wrap = wrapCheck((finish: (error: Error) => void) => {
      queueMicrotask(() => finish(failure));
    }).withCallback!.expectErrorInstanceMatch!(BlahError).expectErrorMatch!(
      "input",
      "E_BAD"
    ).expectError!;
    expect(await asyncVerify(wrap)).toBe(failure);
    await expect(
      asyncVerify(wrapCheck(fail).expectErrorMatch!("absent").expectErrorMatch!("input"))
    ).rejects.toThrow("message");
  });
});
