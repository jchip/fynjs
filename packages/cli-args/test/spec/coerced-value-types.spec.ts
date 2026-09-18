import { describe, expect, expectTypeOf, it } from "vitest";
import { NixClap, type CommandMeta, type CommandNode } from "../../src/index.js";

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

  it("retains custom coerced values and multi-argument maps", () => {
    const nc = new NixClap({ noDefaultHandlers: true }).init2({
      options: {
        date: {
          args: "<value date>",
          customTypes: { date: value => new Date(value) }
        },
        pair: { args: "<count number> <enabled boolean>" }
      }
    });

    const parsed = nc.parse2(["--date", "2026-09-18", "--pair", "2", "true"]);

    expect(parsed.errorNodes).toEqual([]);
    expect(parsed.command.optsFull.date.value).toEqual(new Date("2026-09-18"));
    expect(parsed.command.opts.pair).toEqual({ 0: 2, 1: true, count: 2, enabled: true });
  });

  // These assertions are checked by tsc -p tsconfig.test.json.
  it("includes coerced numbers and booleans in its public value type", () => {
    type FullValue = CommandMeta["optsFull"][string][string];

    expectTypeOf<number>().toMatchTypeOf<FullValue>();
    expectTypeOf<boolean>().toMatchTypeOf<FullValue>();
    expectTypeOf<number[]>().toMatchTypeOf<FullValue>();
    expectTypeOf<boolean[]>().toMatchTypeOf<FullValue>();
    expectTypeOf<Date>().toMatchTypeOf<FullValue>();
    expectTypeOf<CommandNode["argsMap"][string]>().toEqualTypeOf<FullValue>();
    expectTypeOf<{ count: number; enabled: boolean }>().toMatchTypeOf<
      CommandMeta["opts"][string]
    >();
    expectTypeOf<FullValue>().not.toBeAny();
    expectTypeOf<Exclude<FullValue, unknown[]>>().not.toMatchTypeOf<string>();
  });
});
