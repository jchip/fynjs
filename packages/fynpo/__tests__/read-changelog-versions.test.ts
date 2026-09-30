import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fs from "fs";
import Os from "os";
import Path from "path";
import { readChangelogVersions } from "../src/read-changelog-versions";

describe("readChangelogVersions skipHeading", () => {
  let dir: string;
  const markers = ["## Packages", "## Commits"];
  const packages = { a: {}, b: {} };

  beforeAll(() => {
    dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "cl-"));
    Fs.writeFileSync(
      Path.join(dir, "CHANGELOG.md"),
      [
        "# 1/1/2026",
        "",
        "## Packages",
        "",
        "### Directly Updated",
        "",
        "-   `a@1.0.1` `(1.0.0 => 1.0.1)`",
        "",
        "### Fynpo Updated",
        "",
        "-   `b@2.0.1` `(2.0.0 => 2.0.1)`",
        "",
        "## Commits",
        "",
      ].join("\n")
    );
  });

  afterAll(() => Fs.rmSync(dir, { recursive: true, force: true }));

  it("reads every section by default", () => {
    expect(readChangelogVersions(dir, packages, markers).versions).toEqual({
      a: "1.0.1",
      b: "2.0.1",
    });
  });

  it("ignores the named section only", () => {
    const res = readChangelogVersions(dir, packages, markers, "### Fynpo Updated");
    expect(res.versions).toEqual({ a: "1.0.1" });
    expect(res.tags).toEqual(["a@1.0.1"]);
  });
});
