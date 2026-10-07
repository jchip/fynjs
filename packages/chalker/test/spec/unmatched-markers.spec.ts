import { describe, it, expect } from "vitest";
import { Chalk } from "chalk";
import { verify } from "run-verify";
import ckChalk from "../../src/chalk.ts";
import ckAnsi from "../../src/ansi-colors.ts";
import ckStyleText from "../../src/style-text.ts";
import { makeChalker, type ChalkerFn } from "../../src/core.ts";

// FORCE_COLOR is set via vitest.config.ts `test.env` - see index.spec.ts.

const RED_X = "\u001b[31mx\u001b[39m";
const TIMEOUT = 1000;

const BACKENDS: { name: string; ck: ChalkerFn }[] = [
  { name: "chalk", ck: ckChalk },
  { name: "ansi-colors", ck: ckAnsi },
  { name: "style-text", ck: ckStyleText },
  { name: "core", ck: makeChalker(new Chalk({ level: 1 })) }
];

const OFF = { supportsColor: false };

BACKENDS.forEach(({ name, ck }) => {
  describe(`unmatched markers with ${name}`, () => {
    it("should keep a close marker that has no open marker", () =>
      verify({ timeout: TIMEOUT })
        .step(() => ck("abc</red>"))
        .step(r => expect(r).toBe("abc</red>"))
        .step(() => ck("</>"))
        .step(r => expect(r).toBe("</>"))
        .step(() => ck("<red>x</red></blue> y"))
        .step(r => expect(r).toBe(`${RED_X}</blue> y`))
        .step(() => ck("a</red>b<red>x</red>"))
        .step(r => expect(r).toBe(`a</red>b${RED_X}`)));

    it("should keep a stray < or > in text", () =>
      verify({ timeout: TIMEOUT })
        .step(() => ck("a < b"))
        .step(r => expect(r).toBe("a < b"))
        .step(() => ck("a > b"))
        .step(r => expect(r).toBe("a > b"))
        .step(() => ck("<>"))
        .step(r => expect(r).toBe("<>"))
        .step(() => ck("1 < 2 <red>x</red> 3 > 2"))
        .step(r => expect(r).toBe(`1 < 2 ${RED_X} 3 > 2`))
        .step(() => ck("<<red>x</red>>"))
        .step(r => expect(r).toBe(`<${RED_X}>`)));

    it("should handle null/undefined with colors off like with colors on", () =>
      verify({ timeout: TIMEOUT })
        .step(() => ck(null, OFF))
        .step(r => expect(r).toBe(""))
        .step(() => ck(undefined, OFF))
        .step(r => expect(r).toBe(""))
        .step(() => ck(null))
        .step(r => expect(r).toBe("")));

    it("should not trim with colors off", () =>
      verify({ timeout: TIMEOUT })
        .step(() => ck("  <red>x</red>  ", OFF))
        .step(r => expect(r).toBe("  x  "))
        .step(() => ck("  <red>x</red>  "))
        .step(r => expect(r).toBe(`  ${RED_X}  `)));

    it("should give the colors on output minus the colors with colors off", () =>
      verify({ timeout: TIMEOUT })
        .step(() => ck("abc</red>", OFF))
        .step(r => expect(r).toBe("abc</red>"))
        .step(() => ck("<red>x</red></blue> y", OFF))
        .step(r => expect(r).toBe("x</blue> y"))
        .step(() => ck("<>", OFF))
        .step(r => expect(r).toBe("<>"))
        .step(() => ck("1 < 2 <red>x</red> 3 > 2", OFF))
        .step(r => expect(r).toBe("1 < 2 x 3 > 2"))
        .step(() => ck("<<red>x</red>>&lt;", OFF))
        .step(r => expect(r).toBe("<x><")));

    it("should still drop unclosed or mismatched markers with colors off", () =>
      verify({ timeout: TIMEOUT })
        .step(() => ck("<red>x", OFF))
        .step(r => expect(r).toBe("x"))
        .step(() => ck("a < b > c", OFF))
        .step(r => expect(r).toBe("a  c"))
        .step(() => ck("<red>a<blue>b</red>", OFF))
        .step(r => expect(r).toBe("ab")));

    it("should leave invalid numeric entities as-is", () =>
      verify({ timeout: TIMEOUT })
        .step(() => ck.decodeHtml("&#xZZ;"))
        .step(r => expect(r).toBe("&#xZZ;"))
        .step(() => ck.decodeHtml("&#;"))
        .step(r => expect(r).toBe("&#;"))
        .step(() => ck.decodeHtml("&#12abc;"))
        .step(r => expect(r).toBe("&#12abc;"))
        .step(() => ck.decodeHtml("&#x110000;"))
        .step(r => expect(r).toBe("&#x110000;"))
        .step(() => ck("<red>x</red>&#xZZ;"))
        .step(r => expect(r).toBe(`${RED_X}&#xZZ;`)));

    it("should decode &#X with an uppercase X like HTML does", () =>
      verify({ timeout: TIMEOUT })
        .step(() => ck.decodeHtml("&#X41;&#x42;&#67;"))
        .step(r => expect(r).toBe("ABC")));
  });
});

describe("chalk 6 with colors off", () => {
  // a chalk 6 instance has no supportsColor; at level 0 chalk itself emits no codes
  const ck0 = makeChalker(new Chalk({ level: 0 }));
  const S = "<red.bold>a</> <#FF0000>b</> <orange>c</> <bg-orange>d</> abc</red> <>";

  it("should match the supportsColor false output", () =>
    verify({ timeout: TIMEOUT })
      .step(() => ck0(S))
      .step(r => expect(r).toBe("a b c d abc</red> <>"))
      .step(() => ck0(S, OFF))
      .step(r => expect(r).toBe("a b c d abc</red> <>")));
});
