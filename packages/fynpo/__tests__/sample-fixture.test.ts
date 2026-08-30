import { describe, it, expect } from "vitest";
import Fs from "fs";
import Path from "path";

import { makeSampleFixture, removeSampleFixture } from "./helpers/sample-fixture";

const SAMPLE_DIR = Path.join(__dirname, "..", "test", "sample");

describe("makeSampleFixture", () => {
  it("produces a copy that is independent of the shared sample", () => {
    const dir = makeSampleFixture("selftest");

    try {
      expect(Fs.existsSync(Path.join(dir, "package.json"))).toBe(true);

      const before = Fs.readFileSync(Path.join(SAMPLE_DIR, "lerna.json"), "utf8");
      Fs.writeFileSync(Path.join(dir, "lerna.json"), '{"mutated":true}\n');

      // the shared fixture must not see it
      expect(Fs.readFileSync(Path.join(SAMPLE_DIR, "lerna.json"), "utf8")).toEqual(before);
    } finally {
      removeSampleFixture(dir);
    }
  });

  it("hands out a different directory each call", () => {
    const a = makeSampleFixture("selftest");
    const b = makeSampleFixture("selftest");

    try {
      expect(a).not.toEqual(b);
    } finally {
      removeSampleFixture(a);
      removeSampleFixture(b);
    }
  });

  it("removes the fixture, and tolerates being called twice", () => {
    const dir = makeSampleFixture("selftest");
    removeSampleFixture(dir);

    expect(Fs.existsSync(dir)).toBe(false);
    expect(() => removeSampleFixture(dir)).not.toThrow();
  });
});

// FPO-14: `utils.loadConfig` writes while it loads (it stamps a fynpo signature into
// lerna.json and rewrites package.json). vitest runs test files in parallel with no
// isolation configured, so any file that both points at the shared `test/sample` AND
// writes is racing every other file on one directory. Mutating suites must take a copy
// via makeSampleFixture instead.
describe("shared test/sample fixture is read-only (FPO-14)", () => {
  const WRITE_CALLS = /\b(writeFileSync|writeFile|shell\.cp|copyFileSync|mkdirSync|rmSync|unlinkSync|rmdirSync)\b/;

  it("no test file both references test/sample and writes", () => {
    const offenders: string[] = [];

    for (const name of Fs.readdirSync(__dirname)) {
      if (!name.endsWith(".test.ts")) {
        continue;
      }

      const src = Fs.readFileSync(Path.join(__dirname, name), "utf8");
      // this file names test/sample only to describe the rule
      if (name === "sample-fixture.test.ts") {
        continue;
      }

      if (/test\/sample/.test(src) && WRITE_CALLS.test(src)) {
        offenders.push(name);
      }
    }

    expect(
      offenders,
      `these write to the shared fixture - use makeSampleFixture() instead: ${offenders.join(", ")}`
    ).toEqual([]);
  });
});
