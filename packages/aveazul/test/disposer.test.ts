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

  test("should create a disposer with promise and cleanup function", () => {
    const resource = { value: "test" };
    const cleanup = vi.fn();

    const disposer = AveAzul.resolve(resource).disposer(cleanup);

    expect(disposer).toBeInstanceOf(Disposer);
    expect(disposer._data).toBe(cleanup);
    expect(disposer._promise).toBeInstanceOf(AveAzul);
  });
});
