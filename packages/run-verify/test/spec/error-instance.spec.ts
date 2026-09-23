import { describe, it, expect, expectTypeOf } from "vitest";
import { asyncVerify, expectErrorToBe, verify } from "../../src/index.js";

class CustomError extends Error {
  constructor(readonly code: number) {
    super("custom failure");
  }
}

function constructorTypes() {
  abstract class BaseError extends Error {
    abstract code: number;
  }
  const chain = verify()
    .expectErrorToBe(BaseError)
    .step(() => {
      throw new CustomError(42);
    });
  expectTypeOf<Awaited<typeof chain>>().toEqualTypeOf<BaseError>();
  // @ts-expect-error - instances are not constructors
  verify().expectErrorToBe(new TypeError());
  // @ts-expect-error - arrow functions are not constructors
  verify().expectErrorToBe(() => new TypeError());
}
void constructorTypes;

describe("expectErrorToBe constructors", () => {
  const failure = new CustomError(42);

  it("accepts subclasses and forwards the original error", async () => {
    const result = await verify()
      .expectErrorToBe(Error)
      .step(() => {
        throw failure;
      });
    expect(result).toBe(failure);
    expectTypeOf(result).toEqualTypeOf<Error>();
  });

  it("infers custom instances from rejections, including asyncStep", async () => {
    const result = await verify()
      .expectErrorToBe(CustomError)
      .asyncStep(() => [Promise.reject(failure)]);
    expect(result).toBe(failure);
    expectTypeOf(result).toEqualTypeOf<CustomError>();
  });

  it("supports asynchronous callbacks and takes precedence over keep", async () => {
    const result = await verify()
      .step(123)
      .keep.expectErrorToBe(CustomError)
      .callbackStep(next => {
        queueMicrotask(() => next(failure));
      });
    expect(result).toBe(failure);
    expectTypeOf(result).toEqualTypeOf<CustomError>();
  });

  it.each([new Error("wrong"), "failure", null, undefined, { name: "CustomError" }])(
    "rejects a thrown value outside the prototype chain: %s",
    async value => {
      let reached = false;
      await expect(
        Promise.resolve(
          verify()
            .expectErrorToBe(CustomError)
            .step(() => {
              throw value;
            })
            .step(() => {
              reached = true;
            })
        )
      ).rejects.toThrow("expecting error to be instance of 'CustomError'");
      expect(reached).toBe(false);
    }
  );

  it.each([() => failure, () => Promise.resolve(failure)])(
    "rejects successful completion",
    async (operation: () => CustomError | Promise<CustomError>) => {
      await expect(
        Promise.resolve(verify().expectErrorToBe(CustomError).step(operation))
      ).rejects.toThrow("expecting error from check function");
    }
  );

  it("rejects successful callbacks", async () => {
    await expect(
      Promise.resolve(
        verify()
          .expectErrorToBe(CustomError)
          .callbackStep(next => next())
      )
    ).rejects.toThrow("expecting error from check function");
  });

  it("rejects mismatched Promise and callback errors and runs cleanup", async () => {
    let cleaned = 0;
    await expect(
      Promise.resolve(
        verify({
          cleanup: () => {
            cleaned++;
          }
        })
          .expectErrorToBe(CustomError)
          .step(() => Promise.reject(new TypeError("wrong")))
      )
    ).rejects.toThrow("instance of 'CustomError'");
    await expect(
      Promise.resolve(
        verify({
          cleanup: () => {
            cleaned++;
          }
        })
          .expectErrorToBe(CustomError)
          .callbackStep(next => {
            queueMicrotask(() => next(new TypeError("wrong")));
          })
      )
    ).rejects.toThrow("instance of 'CustomError'");
    expect(cleaned).toBe(2);
  });

  it("supports an optional code with the constructor", async () => {
    expect(
      await verify()
        .expectErrorToBe(CustomError, 42)
        .step(() => {
          throw failure;
        })
    ).toBe(failure);
    await expect(
      Promise.resolve(
        verify()
          .expectErrorToBe(CustomError, 0)
          .step(() => {
            throw failure;
          })
      )
    ).rejects.toThrow("code to be '0' but got '42'");
  });

  it("composes with message and code assertions in either order", async () => {
    const first = await verify()
      .expectErrorToBe(CustomError)
      .expectErrorToBe("custom failure", 42)
      .step(() => {
        throw failure;
      });
    const second = await verify()
      .expectErrorHas("failure", 42)
      .expectErrorToBe(CustomError)
      .step(() => Promise.reject(failure));
    expect(first).toBe(failure);
    expect(second).toBe(failure);
    expectTypeOf(first).toEqualTypeOf<CustomError>();
    expectTypeOf(second).toEqualTypeOf<CustomError>();
    await expect(
      Promise.resolve(
        verify()
          .expectErrorToBe(CustomError)
          .expectErrorHas("absent")
          .step(() => {
            throw failure;
          })
      )
    ).rejects.toThrow("message has 'absent'");
    await expect(
      Promise.resolve(
        verify()
          .expectErrorToBe("custom failure")
          .expectErrorToBe(TypeError)
          .step(() => {
            throw failure;
          })
      )
    ).rejects.toThrow("instance of 'TypeError'");
  });

  it("keeps prefixes immutable, replaces the constructor and consumes the modifier", async () => {
    const prefix = verify().expectErrorToBe(CustomError);
    const changed = await prefix.expectErrorToBe(TypeError).step(() => {
      throw new TypeError("changed");
    });
    expectTypeOf(changed).toEqualTypeOf<TypeError>();
    expect(changed).toBeInstanceOf(TypeError);
    expect(
      await prefix
        .step(() => {
          throw failure;
        })
        .step(err => err.code)
    ).toBe(42);
    const plain = await prefix
      .step(() => {
        throw failure;
      })
      .expectError.step(() => {
        throw "plain";
      });
    expectTypeOf(plain).toEqualTypeOf<unknown>();
    expect(plain).toBe("plain");
  });

  it("supports constructors for thrown objects that do not extend Error", async () => {
    class Failure {
      reason = "failed";
    }
    const result = await verify()
      .expectErrorToBe(Failure)
      .step(() => {
        throw new Failure();
      });
    expectTypeOf(result).toEqualTypeOf<Failure>();
    expect(result.reason).toBe("failed");
  });

  it("supports the positional helper and wrapper callback modifier", async () => {
    expect(
      await asyncVerify(
        expectErrorToBe(() => {
          throw failure;
        }, CustomError)
      )
    ).toBe(failure);
    expect(
      await asyncVerify(
        expectErrorToBe((finish: (err: Error) => void) => {
          queueMicrotask(() => finish(failure));
        }, CustomError).withCallback!.expectErrorHas!("failure", 42)
      )
    ).toBe(failure);
  });
});
