import { describe, expect, expectTypeOf, it } from "vitest";
import { NixClap, type CommandMeta } from "../../src/index.js";

describe("coerced optsFull values", () => {
  it("retains numeric and boolean values at runtime", () => {
    const nc = new NixClap({ noDefaultHandlers: true }).init2({
      options: {
        count: { args: "<n number>" },
        flag: { args: "<value boolean>" }
      }
    });

    const parsed = nc.parse2(["--count", "2", "--flag", "true"]);

    expect(parsed.errorNodes).toEqual([]);
    expect(parsed.command.optsFull.count.n).toBe(2);
    expect(parsed.command.optsFull.flag.value).toBe(true);
  });

  // These assertions are checked by tsc -p tsconfig.test.json.
  it("includes coerced numbers and booleans in its public value type", () => {
    type FullValue = CommandMeta["optsFull"][string][string];

    expectTypeOf<number>().toMatchTypeOf<FullValue>();
    expectTypeOf<boolean>().toMatchTypeOf<FullValue>();
    expectTypeOf<number[]>().toMatchTypeOf<FullValue>();
    expectTypeOf<boolean[]>().toMatchTypeOf<FullValue>();
  });
});
