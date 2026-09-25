import { describe, it, expect } from "vitest";
import chalk from "chalk";
import ansiColors from "ansi-colors";
import { verify } from "run-verify";
import ckChalk, { makeChalker } from "../../src/chalk.ts";
import ckAnsi from "../../src/ansi-colors.ts";
import ckStyleText from "../../src/style-text.ts";
import ckAuto from "../../src/index.ts";

// FORCE_COLOR is set via vitest.config.ts `test.env` - see index.spec.ts.

const BASIC = "[31m[1mred bold text[22m[39m";
const MARKUP = "<red.bold>red bold text</>";

describe("static entries", () => {
  describe("chalker/chalk", () => {
    it("should colorize using a hard-imported chalk", () =>
      verify()
        .step(() => ckChalk(MARKUP))
        .step(r => expect(r).toBe(BASIC)));

    it("should use the very same chalk instance the consumer imported", () =>
      // this is the property a bundled consumer depends on: one chalk, one color-support
      // state, rather than the entry resolving a second copy of its own
      verify().step(() => expect(ckChalk.CHALK).toBe(chalk)));

    it("should expose remove and decodeHtml like the default entry", () =>
      verify()
        .step(() => expect(ckChalk.remove("<red>text</>")).toBe("text"))
        .step(() => expect(ckChalk.decodeHtml("&lt;tag&gt;")).toBe("<tag>")));
  });

  describe("chalker/ansi-colors", () => {
    it("should colorize using a hard-imported ansi-colors", () =>
      verify()
        .step(() => ckAnsi(MARKUP))
        .step(r => expect(r).toBe(BASIC)));

    it("should use the very same ansi-colors instance the consumer imported", () =>
      verify().step(() => expect(ckAnsi.CHALK).toBe(ansiColors)));
  });

  describe("chalker/style-text", () => {
    it("should colorize using node:util's built-in styleText", () =>
      verify()
        .step(() => ckStyleText(MARKUP))
        .step(r => expect(r).toBe(BASIC)));

    it("should not depend on any external colors module", () =>
      // the point of this entry: no chalk, no ansi-colors, no peer dependency at all
      verify()
        .step(() => expect(ckStyleText.CHALK).not.toBe(chalk))
        .step(() => expect(ckStyleText.CHALK).not.toBe(ansiColors)));
  });

  describe("instance isolation", () => {
    it("should not share CHALK between entries", () =>
      verify().step(() => expect(ckChalk.CHALK).not.toBe(ckAnsi.CHALK)));

    it("should keep a reassigned CHALK local to one instance", () => {
      const a = makeChalker(chalk);
      const b = makeChalker(chalk);
      const saved = a.CHALK;

      return verify({
        cleanup: () => {
          a.CHALK = saved;
        }
      })
        .step(() => {
          a.CHALK = ansiColors;
        })
        .step(() => expect(a.CHALK).toBe(ansiColors))
        .step(() => expect(b.CHALK).toBe(chalk))
        .step(() => expect(ckChalk.CHALK).toBe(chalk));
    });

    it("should let each instance render with its own colors", () => {
      const own = makeChalker(chalk);
      return verify()
        .step(() => expect(own(MARKUP)).toBe(BASIC))
        .step(() => expect(own(MARKUP)).toBe(ckChalk(MARKUP)));
    });
  });

  describe("default entry", () => {
    it("should still auto-detect and render the same", () =>
      verify()
        .step(() => ckAuto(MARKUP))
        .step(r => expect(r).toBe(BASIC)));

    it("should be a separate instance from the static entries", () =>
      verify().step(() => expect(ckAuto).not.toBe(ckChalk)));
  });
});
