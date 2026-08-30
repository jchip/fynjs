import { describe, it, expect } from "vitest";
import chalk from "chalk";
import ansiColors from "ansi-colors";
import ckChalk, { makeChalker } from "../../src/chalk.ts";
import ckAnsi from "../../src/ansi-colors.ts";
import ckAuto from "../../src/index.ts";

// FORCE_COLOR is set via vitest.config.ts `test.env` - see index.spec.ts.

const BASIC = "[31m[1mred bold text[22m[39m";
const MARKUP = "<red.bold>red bold text</>";

describe("static entries", () => {
  describe("chalker/chalk", () => {
    it("should colorize using a hard-imported chalk", () => {
      expect(ckChalk(MARKUP)).toBe(BASIC);
    });

    it("should use the very same chalk instance the consumer imported", () => {
      // this is the property a bundled consumer depends on: one chalk, one color-support
      // state, rather than the entry resolving a second copy of its own
      expect(ckChalk.CHALK).toBe(chalk);
    });

    it("should expose remove and decodeHtml like the default entry", () => {
      expect(ckChalk.remove("<red>text</>")).toBe("text");
      expect(ckChalk.decodeHtml("&lt;tag&gt;")).toBe("<tag>");
    });
  });

  describe("chalker/ansi-colors", () => {
    it("should colorize using a hard-imported ansi-colors", () => {
      expect(ckAnsi(MARKUP)).toBe(BASIC);
    });

    it("should use the very same ansi-colors instance the consumer imported", () => {
      expect(ckAnsi.CHALK).toBe(ansiColors);
    });
  });

  describe("instance isolation", () => {
    it("should not share CHALK between entries", () => {
      expect(ckChalk.CHALK).not.toBe(ckAnsi.CHALK);
    });

    it("should keep a reassigned CHALK local to one instance", () => {
      const a = makeChalker(chalk);
      const b = makeChalker(chalk);
      const saved = a.CHALK;

      a.CHALK = ansiColors;

      expect(a.CHALK).toBe(ansiColors);
      expect(b.CHALK).toBe(chalk);
      expect(ckChalk.CHALK).toBe(chalk);

      a.CHALK = saved;
    });

    it("should let each instance render with its own colors", () => {
      const own = makeChalker(chalk);
      expect(own(MARKUP)).toBe(BASIC);
      expect(own(MARKUP)).toBe(ckChalk(MARKUP));
    });
  });

  describe("default entry", () => {
    it("should still auto-detect and render the same", () => {
      expect(ckAuto(MARKUP)).toBe(BASIC);
    });

    it("should be a separate instance from the static entries", () => {
      expect(ckAuto).not.toBe(ckChalk);
    });
  });
});
