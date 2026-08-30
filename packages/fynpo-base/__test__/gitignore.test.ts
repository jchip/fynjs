import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fs from "fs";
import Os from "os";
import Path from "path";

import { makeGitignoreMatcher } from "../src/gitignore";

describe("makeGitignoreMatcher", () => {
  let dir: string;

  beforeEach(() => {
    dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fynpo-gitignore-"));
  });

  afterEach(() => {
    Fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reports no rules for a directory with no gitignore", () => {
    const m = makeGitignoreMatcher(dir);

    expect(m.hasRules).toBe(false);
    expect(m.ignores("_w/xsh")).toBe(false);
  });

  it("matches a plain directory rule", () => {
    Fs.writeFileSync(Path.join(dir, ".gitignore"), "_w\n");
    const m = makeGitignoreMatcher(dir);

    expect(m.hasRules).toBe(true);
    expect(m.ignores("_w")).toBe(true);
    expect(m.ignores("_w/xsh")).toBe(true);
    expect(m.ignores("packages/fyn")).toBe(false);
  });

  it("honors globs and negation", () => {
    Fs.writeFileSync(Path.join(dir, ".gitignore"), "dist-*\n!dist-keep\n");
    const m = makeGitignoreMatcher(dir);

    expect(m.ignores("dist-esm")).toBe(true);
    expect(m.ignores("dist-keep")).toBe(false);
    expect(m.ignores("distinct")).toBe(false);
  });

  it("also reads .git/info/exclude", () => {
    Fs.mkdirSync(Path.join(dir, ".git", "info"), { recursive: true });
    Fs.writeFileSync(Path.join(dir, ".git", "info", "exclude"), "scratch\n");
    const m = makeGitignoreMatcher(dir);

    expect(m.ignores("scratch")).toBe(true);
  });

  it("combines both sources", () => {
    Fs.writeFileSync(Path.join(dir, ".gitignore"), "_w\n");
    Fs.mkdirSync(Path.join(dir, ".git", "info"), { recursive: true });
    Fs.writeFileSync(Path.join(dir, ".git", "info", "exclude"), "scratch\n");
    const m = makeGitignoreMatcher(dir);

    expect(m.ignores("_w/xsh")).toBe(true);
    expect(m.ignores("scratch")).toBe(true);
  });

  it("refuses paths ignore cannot judge, rather than throwing", () => {
    Fs.writeFileSync(Path.join(dir, ".gitignore"), "_w\n");
    const m = makeGitignoreMatcher(dir);

    expect(m.ignores("")).toBe(false);
    expect(m.ignores(".")).toBe(false);
    expect(m.ignores(Path.join(dir, "_w"))).toBe(false); // absolute
    expect(m.ignores("../outside")).toBe(false);
  });

  it("normalizes a leading ./ and windows separators", () => {
    Fs.writeFileSync(Path.join(dir, ".gitignore"), "_w\n");
    const m = makeGitignoreMatcher(dir);

    expect(m.ignores("./_w/xsh")).toBe(true);
    expect(m.ignores(["_w", "xsh"].join(Path.sep))).toBe(true);
  });
});
