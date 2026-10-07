import { verify } from "run-verify";
import { describe, test, expect } from "vitest";
import AveAzul from "./promise-lib.ts";

// Filtered catch: `.catch(filter..., handler)` handles only matching errors.

class CustomError extends Error {}

describe("filtered catch", () => {
  test("error class filter handles a matching error", () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.reject(new TypeError("t")).catch(TypeError, () => "handled"))
      .step((result) => expect(result).toBe("handled"));
  });

  test("error class filter passes the error to the handler", () => {
    const err = new CustomError("c");
    return verify({ timeout: 1000 })
      .step(() => AveAzul.reject(err).catch(CustomError, (e) => e))
      .step((result) => expect(result).toBe(err));
  });

  test("error class filter rethrows a non-matching error", () => {
    return verify({ timeout: 1000 })
      .expectErrorToBe(TypeError)
      .step(() => AveAzul.reject(new TypeError("t")).catch(RangeError, () => "handled"));
  });

  test("Error matches any error subclass", () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.reject(new CustomError("c")).catch(Error, () => "handled"))
      .step((result) => expect(result).toBe("handled"));
  });

  test("several class filters handle an error matching any of them", () => {
    return verify({ timeout: 1000 })
      .step(() =>
        AveAzul.reject(new TypeError("t")).catch(RangeError, TypeError, () => "handled")
      )
      .step((result) => expect(result).toBe("handled"));
  });

  test("several class filters rethrow when none match", () => {
    return verify({ timeout: 1000 })
      .expectErrorToBe(CustomError)
      .step(() =>
        AveAzul.reject(new CustomError("c")).catch(RangeError, TypeError, () => "handled")
      );
  });

  test("predicate filter handles when it returns truthy", () => {
    return verify({ timeout: 1000 })
      .step(() =>
        AveAzul.reject(new Error("boom")).catch(
          (e: Error) => e.message === "boom",
          () => "handled"
        )
      )
      .step((result) => expect(result).toBe("handled"));
  });

  test("predicate filter rethrows when it returns falsy", () => {
    return verify({ timeout: 1000 })
      .expectErrorToBe("boom")
      .step(() =>
        AveAzul.reject(new Error("boom")).catch(
          (e: Error) => e.message === "other",
          () => "handled"
        )
      );
  });

  test("object filter handles when its properties match the error", () => {
    return verify({ timeout: 1000 })
      .step(() =>
        AveAzul.reject(Object.assign(new Error("e"), { code: "E1" })).catch(
          { code: "E1" },
          () => "handled"
        )
      )
      .step((result) => expect(result).toBe("handled"));
  });

  test("object filter rethrows when a property differs", () => {
    return verify({ timeout: 1000 })
      .expectErrorToBe("e", "E2")
      .step(() =>
        AveAzul.reject(Object.assign(new Error("e"), { code: "E2" })).catch(
          { code: "E1" },
          () => "handled"
        )
      );
  });

  test("filtered catch leaves a fulfilled value alone", () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.resolve(1).catch(TypeError, () => 2))
      .step((result) => expect(result).toBe(1));
  });

  test("a non-function handler throws TypeError", () => {
    // Deliberately widened so a non-function handler type-checks.
    const catchUnchecked = AveAzul.prototype.catch as (...args: unknown[]) => unknown;
    return verify({ timeout: 1000 })
      .expectErrorToBe(TypeError)
      .step(() => catchUnchecked.call(AveAzul.resolve(1), TypeError, "nope"));
  });
});
