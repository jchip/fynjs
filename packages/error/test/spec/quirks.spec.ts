import { describe, it, expect } from "vitest";
import { verify } from "run-verify";
import { cleanErrorStack, AggregateError, aggregateErrorStack } from "../../src/index.js";

describe("AggregateError with non-array iterables", () => {
  it("should spread a Set into errors", () => {
    const e1 = new Error("e1");
    const e2 = new Error("e2");
    return verify({ timeout: 1000 })
      .step(() => new AggregateError(new Set([e1, e2]), "set"))
      .keep.step((x) => expect(x.errors).toEqual([e1, e2]))
      .step((x) => expect(x.stack).toContain("  Error: e2"));
  });

  it("should spread a generator into errors", () => {
    const e1 = new Error("e1");
    const e2 = new Error("e2");
    function* gen() {
      yield e1;
      yield e2;
    }
    return verify({ timeout: 1000 })
      .step(() => new AggregateError(gen(), "gen"))
      .step((x) => expect(x.errors).toEqual([e1, e2]));
  });

  it("should spread a string like the native AggregateError", () => {
    return verify({ timeout: 1000 })
      .step(() => new AggregateError("ab" as any, "str"))
      .step((x) => expect(x.errors).toEqual(new globalThis.AggregateError("ab").errors));
  });
});

describe("AggregateError options", () => {
  it("should pass cause to the native AggregateError", () => {
    const cause = new Error("root");
    return verify({ timeout: 1000 })
      .step(() => new AggregateError([], "m", { cause }))
      .step((x) => expect(x.cause).toBe(cause));
  });
});

describe("aggregateErrorStack with a native AggregateError", () => {
  it("should keep the header and frames of the native stack", () => {
    const native = new globalThis.AggregateError([new Error("inner")], "msg");
    return verify({ timeout: 1000 })
      .step(() => aggregateErrorStack(native as any))
      .keep.step((s) => expect(s.startsWith(native.stack)).toBe(true))
      .keep.step((s) => expect(s).toMatch(/^AggregateError: msg\n {4}at /))
      .step((s) => expect(s).toContain("\n  Error: inner"));
  });

  it("should not recurse when the saved stack is empty", () => {
    const saved = Error.prepareStackTrace;
    return verify({
      timeout: 1000,
      cleanup: () => {
        Error.prepareStackTrace = saved;
      },
    })
      .step(() => {
        Error.prepareStackTrace = () => "";
      })
      .step(() => new AggregateError([], "empty"))
      .step((x) => expect(x.stack).toBe("empty"));
  });
});

describe("cleanErrorStack line handling", () => {
  it("should keep blank lines in the message", () => {
    const x = new Error("x");
    x.stack = "Error: line 1\n\nline 3\n    at f (/abs/x.js:1:1)";
    return verify({ timeout: 1000 })
      .step(() => cleanErrorStack(x, { replacePath: false }))
      .step((s) => expect(s).toBe("Error: line 1\n\nline 3\n    at f (/abs/x.js:1:1)"));
  });

  it("should drop an at line with no location", () => {
    const x = new Error("x");
    x.stack = "Error: x\n    at\n    at g (/p/keep.js:2:2)";
    return verify({ timeout: 1000 })
      .step(() => cleanErrorStack(x, { replacePath: false }))
      .step((s) => expect(s).toBe("Error: x\n    at g (/p/keep.js:2:2)"));
  });

  it("should match filters against the whole path when it has a )", () => {
    const x = new Error("x");
    x.stack = "Error: x\n    at f (/p/(x)/skip/y.js:1:1)\n    at g (/p/keep.js:2:2)";
    return verify({ timeout: 1000 })
      .step(() => cleanErrorStack(x, { replacePath: false, ignorePathFilter: ["/skip/"] }))
      .step((s) => expect(s).toBe("Error: x\n    at g (/p/keep.js:2:2)"));
  });
});
