import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fs from "fs";
import Path from "path";
import { execFileSync } from "child_process";
import { FynpoDepGraph } from "@fynpo/base";
import Changelog from "../src/update-changelog";

describe("repeating changelog before prepare", () => {
  let dir: string;
  let graph: FynpoDepGraph;
  let changelogFile: string;

  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  const readChangelog = () => Fs.readFileSync(changelogFile, "utf8");
  const commit = (message: string) => {
    git("add", "-A");
    git("commit", "-q", "-m", message);
  };
  const runChangelog = async (options = {}) => {
    const command = new Changelog({ cwd: dir, commit: true, ...options }, graph);
    command._changeLogFile = changelogFile;
    command._changeLog = Fs.existsSync(changelogFile) ? readChangelog() : "";
    await command.exec();
  };

  beforeEach(async () => {
    const tempDir = Path.resolve(import.meta.dirname, "../../../.temp");
    Fs.mkdirSync(tempDir, { recursive: true });
    dir = Fs.mkdtempSync(Path.join(tempDir, "changelog-repeat-"));
    changelogFile = Path.join(dir, "CHANGELOG.md");
    git("init", "-q", "-b", "main");
    git("config", "user.name", "fynpo test");
    git("config", "user.email", "test@example.com");
    git("config", "commit.gpgsign", "false");
    for (const name of ["a", "b"]) {
      const pkgDir = Path.join(dir, "packages", name);
      Fs.mkdirSync(pkgDir, { recursive: true });
      Fs.writeFileSync(
        Path.join(pkgDir, "package.json"),
        JSON.stringify({ name, version: "1.0.0" })
      );
      Fs.writeFileSync(Path.join(pkgDir, "index.js"), "module.exports = 1;\n");
    }
    commit("[Publish]");
    git("tag", "fynpo-rel-20260920-test");
    // Keep the dropped final stdin SHA in diff-tree from obscuring these repeat cases.
    git("commit", "-q", "--allow-empty", "-m", "start next release");
    for (const name of ["a", "b"]) {
      Fs.writeFileSync(Path.join(dir, "packages", name, "index.js"), "module.exports = 2;\n");
    }
    commit("fix: update both packages");
    graph = new FynpoDepGraph({ cwd: dir, patterns: ["packages/*"] });
    await graph.resolve();
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`Unexpected process.exit(${code})`);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Fs.rmSync(dir, { recursive: true, force: true });
  });

  it.each([false, true])("leaves HEAD and changelog unchanged on repeat (next day: %s)", async (nextDay) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 20, 12));
    await runChangelog();
    const firstText = readChangelog();
    const firstHead = git("rev-parse", "HEAD");
    expect(git("log", "-1", "--format=%s")).toBe("Update changelog");

    if (nextDay) vi.setSystemTime(new Date(2026, 8, 21, 12));
    await runChangelog();

    expect(readChangelog()).toBe(firstText);
    expect(git("rev-parse", "HEAD")).toBe(firstHead);
    expect(readChangelog().match(/^# /gm)).toHaveLength(1);
    expect(readChangelog()).not.toContain("Update changelog");
    expect(git("status", "--porcelain")).toBe("");
  });

  it("leaves an uncommitted changelog unchanged on repeat without exiting", async () => {
    const firstHead = git("rev-parse", "HEAD");
    await runChangelog({ commit: false });
    const firstText = readChangelog();

    await runChangelog({ commit: false });

    expect(readChangelog()).toBe(firstText);
    expect(git("rev-parse", "HEAD")).toBe(firstHead);
    expect(process.exit).not.toHaveBeenCalled();
  });

  it.each(["fix: additional package change", "Update changelog"])(
    "includes new package changes titled %s while excluding generated changelog commits",
    async (subject) => {
      await runChangelog();
      const firstHead = git("rev-parse", "HEAD");
      Fs.writeFileSync(Path.join(dir, "packages/a/index.js"), "module.exports = 3;\n");
      commit(subject);
      const sourceHead = git("rev-parse", "HEAD");

      await runChangelog();

      expect(git("rev-parse", "HEAD")).not.toBe(sourceHead);
      expect(readChangelog()).toContain(subject);
      expect(readChangelog()).toContain(sourceHead);
      expect(readChangelog()).not.toContain(firstHead);
      if (subject !== "Update changelog") {
        expect(readChangelog()).not.toContain("Update changelog");
      }
    }
  );

  it("generates the newly selected package even when its commit was already listed", async () => {
    await runChangelog({ only: ["a"], commit: false });
    expect(readChangelog()).toContain("`a@1.0.1`");
    expect(readChangelog()).not.toContain("`b@1.0.1`");
    const firstText = readChangelog();

    await runChangelog({ only: ["b"], commit: false });

    expect(readChangelog()).not.toBe(firstText);
    expect(readChangelog().split(/^# /m)[1]).toContain("`b@1.0.1`");
    expect(process.exit).not.toHaveBeenCalled();
  });

  it("honors a narrower --since range after generating the full range", async () => {
    await runChangelog();
    const since = git("rev-parse", "HEAD");
    git("commit", "-q", "--allow-empty", "-m", "start narrower range");
    Fs.writeFileSync(Path.join(dir, "packages/a/index.js"), "module.exports = 3;\n");
    commit("fix: newer change in a");
    await runChangelog();
    const fullText = readChangelog();
    expect(fullText.split(/^# /m)[1]).toContain("`b@1.0.1`");

    await runChangelog({ since });

    const latestEntry = readChangelog().split(/^# /m)[1];
    expect(readChangelog()).not.toBe(fullText);
    expect(latestEntry).toContain("`a@1.0.1`");
    expect(latestEntry).toContain("newer change in a");
    expect(latestEntry).not.toContain("`b@1.0.1`");
    expect(latestEntry).not.toContain("update both packages");
  });

  it("preserves historical sections when the latest entry already matches", async () => {
    const history = "# 1/1/2025\n\n## Packages\n\n-   `a@1.0.0`\n\n## Commits\n\nEarlier release\n";
    Fs.writeFileSync(changelogFile, history);
    commit("docs: retain release history");
    await runChangelog();
    const firstText = readChangelog();
    const firstHead = git("rev-parse", "HEAD");

    await runChangelog();

    expect(readChangelog()).toBe(firstText);
    expect(readChangelog().endsWith(history)).toBe(true);
    expect(readChangelog().match(/^# /gm)).toHaveLength(2);
    expect(git("rev-parse", "HEAD")).toBe(firstHead);
  });

  it("still prepares versions for --publish when the changelog is already current", async () => {
    await runChangelog();
    const firstText = readChangelog();
    const firstHead = git("rev-parse", "HEAD");
    const command = new Changelog({ cwd: dir, commit: true, publish: true }, graph);
    command._changeLogFile = changelogFile;
    command._changeLog = firstText;
    const prepare = vi.spyOn(command, "preparePackages").mockResolvedValue(undefined);

    await command.exec();

    expect(prepare).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      versions: { a: "1.0.1", b: "1.0.1" },
      tags: ["a@1.0.1", "b@1.0.1"],
    }));
    expect(readChangelog()).toBe(firstText);
    expect(git("rev-parse", "HEAD")).toBe(firstHead);
  });
});
