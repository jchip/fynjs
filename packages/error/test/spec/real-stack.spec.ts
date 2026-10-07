import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import Path from "node:path";
import { verify } from "run-verify";
import { cleanErrorStack, aggregateStack } from "../../src/index.js";

// The fixtures run on the node running the tests, so these check the stack text of that version.
const FIXTURES = Path.join(import.meta.dirname, "..", "fixtures");
const replacePath = `${FIXTURES}/`;

const loadStacks = (file: string): Record<string, string> =>
  JSON.parse(execFileSync(process.execPath, [Path.join(FIXTURES, file)], { encoding: "utf8" }));

const clean = (stack: string, opts = { replacePath }) => cleanErrorStack({ stack } as Error, opts);

describe("cleanErrorStack with real CommonJS stacks", () => {
  it("should keep the user frames and shorten their paths", () => {
    return verify({ timeout: 5000 })
      .step(() => loadStacks("stack.cjs"))
      .keep.step((s) =>
        expect(clean(s.thrown)).toBe(
          "Error: boom\n    at thrower (stack.cjs:2:28)\n    at Object.<anonymous> (stack.cjs:4:7)"
        )
      )
      .keep.step((s) =>
        expect(clean(s.require)).toBe(
          `Error: Cannot find module 'oops'\nRequire stack:\n- ${FIXTURES}/stack.cjs\n` +
            "    at Object.<anonymous> (stack.cjs:5:7)"
        )
      )
      .keep.step((s) =>
        expect(clean(s.anonymous)).toBe(
          "Error: anon\n    at stack.cjs:6:40\n    at Object.<anonymous> (stack.cjs:6:5)"
        )
      )
      .step((s) =>
        expect(clean(aggregateStack(s.aggregate, [{ stack: s.require }]))).toBe(
          "AggregateError: require failed\n    at Object.<anonymous> (stack.cjs:7:20)\n" +
            `  Error: Cannot find module 'oops'\n  Require stack:\n  - ${FIXTURES}/stack.cjs\n` +
            "      at Object.<anonymous> (stack.cjs:5:7)"
        )
      );
  });
});

describe("cleanErrorStack with real ES module stacks", () => {
  it("should keep the user frames and shorten their file URLs", () => {
    return verify({ timeout: 5000 })
      .step(() => loadStacks("stack.mjs"))
      .keep.step((s) =>
        expect(clean(s.thrown)).toBe("Error: boom\n    at thrower (stack.mjs:2:28)\n    at stack.mjs:4:7")
      )
      .keep.step((s) => expect(clean(s.topLevel)).toBe("Error: top\n    at stack.mjs:5:19"))
      .step((s) =>
        expect(clean(s.anonymous)).toBe("Error: anon\n    at stack.mjs:6:40\n    at stack.mjs:6:5")
      );
  });

  it("should keep the file URLs whole when replacePath does not match", () => {
    return verify({ timeout: 5000 })
      .step(() => loadStacks("stack.mjs"))
      .keep.step((s) =>
        expect(clean(s.thrown, { replacePath: "/nowhere/" })).toBe(
          `Error: boom\n    at thrower (file://${FIXTURES}/stack.mjs:2:28)\n    at file://${FIXTURES}/stack.mjs:4:7`
        )
      )
      .step((s) =>
        expect(clean(s.thrown, { replacePath: false } as any)).toBe(
          `Error: boom\n    at thrower (file://${FIXTURES}/stack.mjs:2:28)\n    at file://${FIXTURES}/stack.mjs:4:7`
        )
      );
  });
});
