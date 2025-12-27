import { describe, it, expect } from "vitest";
import { cleanErrorStack, AggregateError, aggregateErrorStack } from "../../src/index.ts";

describe("cleanErrorStack", () => {
  it("should clean and replace stack path", () => {
    const x = new Error("oops");
    // Create a mock stack with absolute paths for consistent testing
    x.stack = `Error: oops
    at testFunc (/Users/test/project/test/spec/index.spec.ts:10:5)
    at Object.<anonymous> (/Users/test/project/test/spec/index.spec.ts:1:1)`;

    const s = cleanErrorStack(x, { replacePath: "/Users/test/project/" });

    expect(s).toContain(`Error: oops`);
    expect(s).toContain(`test/spec/index.spec.ts`);
  });

  it("should clean and not replace stack path", () => {
    const x = new Error("oops");
    const s = cleanErrorStack(x, { replacePath: false });
    expect(s).not.toContain(`(test/spec`);
  });

  it("should handle bad input", () => {
    expect(cleanErrorStack({} as any)).toBe("undefined");
  });

  it("should filter paths matching ignorePathFilter", () => {
    const x = new Error("test");
    // Create a fake stack that includes a path to filter
    const originalStack = x.stack;
    x.stack = `Error: test
    at someFunction (/Users/test/project/node_modules/pirates/lib/index.js:1:1)
    at anotherFunction (/Users/test/project/src/index.ts:10:5)`;

    const s = cleanErrorStack(x, { replacePath: "/Users/test/project/" });
    expect(s).not.toContain("/pirates/");
    expect(s).toContain("src/index.ts");
    x.stack = originalStack;
  });

  it("should handle custom ignorePathFilter", () => {
    const x = new Error("test");
    x.stack = `Error: test
    at someFunction (/Users/test/project/custom/path.js:1:1)
    at anotherFunction (/Users/test/project/src/index.ts:10:5)`;

    const s = cleanErrorStack(x, {
      replacePath: "/Users/test/project/",
      ignorePathFilter: ["/custom/"]
    });
    expect(s).not.toContain("/custom/");
    expect(s).toContain("src/index.ts");
  });

  it("should handle error with only message", () => {
    const x = { message: "test message" } as Error;
    const s = cleanErrorStack(x);
    expect(s).toBe("test message");
  });
});

describe("AggregateError", () => {
  it("should return [] for Object.keys", () => {
    const x = new AggregateError([], "test");
    expect(Object.keys(x)).toEqual([]);
  });

  it("should have name", () => {
    const x = new AggregateError([], "test");
    expect(x.stack).toContain(`AggregateError: test`);
  });

  it("should fail with TypeError for non-iterable", () => {
    expect(() => new AggregateError(undefined as any)).toThrow("iterable");
    expect(() => new AggregateError({} as any)).toThrow("iterable");
  });

  it("should have aggregate stack", () => {
    const x = new AggregateError(
      ["string error 1", new Error("test error 1"), null, undefined],
      "oops"
    );
    expect(x.stack).toContain(`AggregateError: oops`);
    expect(x.stack).toContain(`  string error 1`);
    expect(x.stack).toContain(`  Error: test error 1`);
    expect(x.stack).toContain(`  null`);
    expect(x.stack).toContain(`  undefined`);
  });

  it("should have name property as AggregateError", () => {
    const x = new AggregateError([], "test");
    expect(x.name).toBe("AggregateError");
  });

  it("should store errors array", () => {
    const errors = [new Error("e1"), new Error("e2")];
    const x = new AggregateError(errors, "test");
    expect(x.errors).toEqual(errors);
  });
});

describe("aggregateErrorStack", () => {
  it("should work with alike objects", () => {
    const s = aggregateErrorStack({ message: "test test" } as any);
    expect(s).toBe("test test\n");
  });

  it("should work with string", () => {
    const s = aggregateErrorStack("blah blah" as any);
    expect(s).toBe("blah blah\n");
  });
});
