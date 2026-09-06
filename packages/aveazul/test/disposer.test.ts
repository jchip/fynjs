import { describe, test, expect, vi } from "vitest";
import { Disposer } from "../src/disposer.ts";
import AveAzul from "./promise-lib.ts";

describe("Disposer", () => {
  test("should be exported as a class", () => {
    expect(typeof Disposer).toBe("function");
  });

  test("should throw if disposer function is not a function", () => {
    expect(() => {
      // Deliberately the wrong type: the runtime check under test is what throws.
      const notAFunction = "not a function" as unknown as (
        resource: unknown
      ) => void;
      AveAzul.resolve({}).disposer(notAFunction);
    }).toThrow(TypeError);
  });

  //
  // Asserts the disposer CONTRACT rather than the object's identity. `toBeInstanceOf(Disposer)`
  // used to stand here and could never hold in bluebird mode - bluebird's .disposer() returns
  // its own FunctionDisposer - so this file was permanently red under USE_BLUEBIRD (FPM-127).
  // What both libraries actually promise is that `using` hands the resource to the body and
  // then runs the cleanup with it. The aveazul-internal shape is pinned separately, in
  // test/only-aveazul/disposer-internal.test.ts.
  //
  test("should produce a disposer that using() disposes with the resource", async () => {
    const resource = { value: "test" };
    const cleanup = vi.fn();

    const seen = await AveAzul.using(
      AveAzul.resolve(resource).disposer(cleanup),
      (r) => {
        expect(cleanup).not.toHaveBeenCalled(); // not before the body runs
        return r;
      }
    );

    expect(seen).toBe(resource);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(cleanup.mock.calls[0][0]).toBe(resource);
  });
});
