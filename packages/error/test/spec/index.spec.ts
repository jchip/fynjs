import { expect } from "chai";
import { cleanErrorStack, AggregateError, aggregateErrorStack } from "../../src";
import { addHook } from "pirates";
import { asyncVerify, expectError } from "run-verify";

describe("cleanErrorStack", function () {
  it("should clean and replace stack path", () => {
    const x = new Error("oops");

    const s = cleanErrorStack(x);

    expect(s).contains(`Error: oops`);
    expect(s).contains(`(test/spec/index.spec.ts`);
  });

  it("should clean and not replace stack path", () => {
    const x = new Error("oops");
    const s = cleanErrorStack(x, { replacePath: false });
    expect(s).not.contains(`(test/spec`);
  });

  it("should handle bad input", () => {
    expect(cleanErrorStack({} as any)).to.equal("undefined");
  });

  it("should clean extra stacks (pirates etc)", () => {
    const revert = addHook((code) => code, { exts: [".js"] });
    let err: Error;
    try {
      require("../bad");
    } catch (e: any) {
      err = e;
    }
    expect(err).to.exist;
    const s = cleanErrorStack(err, { ignorePathFilter: ["/mocha/"] });

    if (err.stack.includes("node:internal")) {
      expect(err.stack).contains(`(node:internal`);
      expect(s).to.not.contains(`(node:internal`);
    } else {
      expect(err.stack).contains(`(internal`);
      expect(s).to.not.contains(`(internal`);
    }

    expect(err.stack).contains("/pirates/");
    expect(err.stack).contains("/mocha/");
    expect(s).to.not.contains("/pirates/");
    expect(s).to.contains("test/bad.js");
    expect(s).to.not.contains("/mocha/");
    revert();
  });
});

describe("AggregateError", function () {
  it("should return [] for Object.keys", () => {
    const x = new AggregateError([], "test");
    expect(Object.keys(x)).to.deep.equal([]);
  });

  it("should have name", () => {
    const x = new AggregateError([], "test");
    expect(x.stack).contains(`AggregateError: test`);
  });

  it("should fail with TypeError", () => {
    return asyncVerify(
      expectError(() => {
        return new AggregateError();
      }),
      (err: Error) => {
        expect(err.message).contains(`iterable`);
      },
      expectError(() => {
        return new AggregateError({} as any);
      }),
      (err: Error) => {
        expect(err.message).contains(`iterable`);
      }
    );
  });

  it("should have aggregate stack", () => {
    const x = new AggregateError(
      ["string error 1", new Error("test error 1"), null, undefined],
      "oops"
    );
    expect(x.stack).contains(`AggregateError: oops`);
    expect(x.stack).contains(`  string error 1`);
    expect(x.stack).contains(`  Error: test error 1`);
    expect(x.stack).contains(`  null`);
    expect(x.stack).contains(`  undefined`);
  });
});

describe("aggregateErrorStack", function () {
  it("should work with alike objects", () => {
    const s = aggregateErrorStack({ message: "test test" } as any);
    expect(s).equals("test test\n");
  });

  it("should work with string", () => {
    const s = aggregateErrorStack("blah blah" as any);
    expect(s).equals("blah blah\n");
  });
});
