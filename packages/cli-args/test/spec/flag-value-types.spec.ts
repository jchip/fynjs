import { describe, expect, it } from "vitest";
import { verify } from "run-verify";
import { NixClap } from "../../src/index.js";

// A declared option with no value spec is a flag, so `=0`/`=1` mean false/true.
// Unknown options have no spec, so numeric values stay numbers.
describe("flag value types", () => {
  const parseDeclared = (arg: string) =>
    new NixClap({ noDefaultHandlers: true })
      .init2({ options: { flag: {} } })
      .parse2(["node", "cli.js", arg], 2);

  const parseUnknown = (arg: string) =>
    new NixClap({ noDefaultHandlers: true, allowUnknownOption: true })
      .init2({})
      .parse2(["node", "cli.js", arg], 2);

  const cases: [string, boolean][] = [
    ["--flag=0", false],
    ["--flag=1", true],
    ["--flag=true", true],
    ["--flag=false", false]
  ];

  for (const [arg, expected] of cases) {
    it(`declared flag ${arg} gives ${expected}`, async () => {
      await verify({ timeout: 500 })
        .step(() => parseDeclared(arg))
        .keep.step(parsed => expect(parsed.errorNodes).toEqual([]))
        .step(parsed => parsed.command.opts.flag)
        .step(value => expect(value).toBe(expected));
    });
  }

  it("declared flag with a non-boolean value keeps the string", async () => {
    await verify({ timeout: 500 })
      .step(() => parseDeclared("--flag=abc"))
      .step(parsed => expect(parsed.command.opts.flag).toBe("abc"));
  });

  const unknownCases: [string, number][] = [
    ["--port=0", 0],
    ["--port=8080", 8080]
  ];

  for (const [arg, expected] of unknownCases) {
    it(`unknown option ${arg} keeps number ${expected}`, async () => {
      await verify({ timeout: 500 })
        .step(() => parseUnknown(arg))
        .keep.step(parsed => expect(parsed.errorNodes).toEqual([]))
        .step(parsed => parsed.command.opts.port)
        .step(value => expect(value).toBe(expected));
    });
  }
});
