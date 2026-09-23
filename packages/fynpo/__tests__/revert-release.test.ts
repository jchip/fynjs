import { afterEach, describe, expect, it, vi } from "vitest";
import Fs from "fs";
import Os from "os";
import Path from "path";
import { execFileSync } from "child_process";
import { FynpoDepGraph } from "@fynpo/base";

vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { getUpdatedPackages } from "../src/utils/get-updated-packages";
import { getNewCommits, collateCommitsPackages } from "../src/utils/git-list-commits";
import { determinePackageVersions } from "../src/utils/get-package-version";
import { updateChangelog } from "../src/utils/update-changelog-file";

const git = (cwd: string, ...args: string[]) =>
  execFileSync(
    "git",
    ["-c", "user.name=fynpo test", "-c", "user.email=test@example.com", ...args],
    { cwd, encoding: "utf8" },
  ).trim();

const write = (cwd: string, file: string, contents: string) => {
  const target = Path.join(cwd, file);
  Fs.mkdirSync(Path.dirname(target), { recursive: true });
  Fs.writeFileSync(target, contents);
};

const commit = (cwd: string, message: string, body?: string) => {
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", message, ...(body ? ["-m", body] : []));
  return git(cwd, "rev-parse", "HEAD");
};

const makeRepo = () => {
  const cwd = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fynpo-revert-release-"));
  git(cwd, "init", "-q", "-b", "main");
  write(cwd, "package.json", JSON.stringify({ name: "root", private: true }));
  write(cwd, "packages/widget/package.json", JSON.stringify({ name: "widget", version: "1.0.0" }));
  write(cwd, "packages/widget/index.js", "export const base = true;\n");
  write(cwd, "packages/other/package.json", JSON.stringify({ name: "other", version: "1.0.0" }));
  write(cwd, "packages/other/index.js", "export const base = true;\n");
  commit(cwd, "chore: initial packages");
  return cwd;
};

const analyze = async (cwd: string, since: string) => {
  const graph = new FynpoDepGraph({ cwd, patterns: ["packages/*"] });
  await graph.resolve();
  const opts = {
    cwd,
    since,
    graph,
    fynpoRc: {},
    versionLockMap: {},
    forcePublish: [],
    changeLog: "",
    changeLogFile: Path.join(cwd, "CHANGELOG.md"),
  };
  const changed = getUpdatedPackages(graph, opts);
  const commits = await getNewCommits(opts, changed);
  const collated = await collateCommitsPackages(commits);
  const versioned = await determinePackageVersions(collated);
  const release = await updateChangelog(versioned);

  return {
    release,
    changelog: Fs.readFileSync(opts.changeLogFile, "utf8"),
  };
};

describe("matched commit/revert pairs in release analysis (FPO-101)", () => {
  const repos: string[] = [];
  const repo = () => {
    const cwd = makeRepo();
    repos.push(cwd);
    return cwd;
  };

  afterEach(() => {
    repos.splice(0).forEach((cwd) => Fs.rmSync(cwd, { recursive: true, force: true }));
  });

  it("omits a reverted feature and its revert, leaving a surviving fix as a patch", async () => {
    const cwd = repo();
    const since = git(cwd, "rev-parse", "HEAD");
    write(cwd, "release-marker.txt", "release started\n");
    commit(cwd, "chore: open release range");
    write(cwd, "packages/widget/feature.js", "export const feature = true;\n");
    const feature = commit(cwd, "feat: add temporary feature");
    git(cwd, "revert", "--no-edit", feature);
    write(cwd, "packages/widget/fix.js", "export const fixed = true;\n");
    commit(cwd, "fix: retain useful correction");

    const { release, changelog } = await analyze(cwd, since);

    expect(release.versions).toEqual({ widget: "1.0.1" });
    expect(changelog).toContain("fix: retain useful correction");
    expect(changelog).not.toContain("    -   feat: add temporary feature");
    expect(changelog).not.toContain("    -   Revert feat: add temporary feature");
  });

  it("keeps an in-range revert when its original commit predates the boundary", async () => {
    const cwd = repo();
    write(cwd, "packages/widget/feature.js", "export const feature = true;\n");
    const feature = commit(cwd, "feat: add released feature");
    const since = git(cwd, "rev-parse", "HEAD");
    write(cwd, "release-marker.txt", "release started\n");
    commit(cwd, "chore: open release range");
    git(cwd, "revert", "--no-edit", feature);

    const { release, changelog } = await analyze(cwd, since);

    expect(release.versions).toEqual({ widget: "1.0.1" });
    expect(changelog).toContain("Revert feat: add released feature");
  });

  it("keeps manually written revert text without a matching commit", async () => {
    const cwd = repo();
    const since = git(cwd, "rev-parse", "HEAD");
    write(cwd, "release-marker.txt", "release started\n");
    commit(cwd, "chore: open release range");
    write(cwd, "packages/widget/index.js", "export const base = false;\n");
    commit(
      cwd,
      'Revert "feat: change unavailable behavior"',
      "This is a manual rollback without a matching commit.",
    );

    const { release, changelog } = await analyze(cwd, since);

    expect(release.versions).toEqual({ widget: "1.0.1" });
    expect(changelog).toContain("Revert feat: change unavailable behavior");
  });

  it("filters each package after its selective-release boundary", async () => {
    const cwd = repo();
    const since = git(cwd, "rev-parse", "HEAD");
    write(cwd, "packages/widget/feature.js", "export const feature = true;\n");
    write(cwd, "packages/other/feature.js", "export const feature = true;\n");
    const feature = commit(cwd, "feat: add temporary shared feature");
    git(
      cwd,
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "[Publish][Selective]",
      "-m",
      " - widget@1.1.0",
    );
    git(cwd, "revert", "--no-edit", feature);
    write(cwd, "packages/other/fix.js", "export const fixed = true;\n");
    commit(cwd, "fix: retain other correction");

    const { release, changelog } = await analyze(cwd, since);

    expect(release.versions).toEqual({ widget: "1.0.1", other: "1.0.1" });
    expect(changelog).toContain("Revert feat: add temporary shared feature");
    expect(changelog).toContain("fix: retain other correction");
    expect(changelog).not.toContain("    -   feat: add temporary shared feature");
  });
});
