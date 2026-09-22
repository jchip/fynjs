import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fs from "node:fs";
import Path from "node:path";
import { execFileSync } from "node:child_process";
import { verify } from "run-verify";
import { execShell } from "../src/utils/exec-shell";

vi.mock("../src/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { checkGitClean, commitAndTagUpdates } from "../src/utils/git-commit-updates";

const makeSh = () => {
  const calls: string[] = [];
  const sh = vi.fn((command: string) => {
    calls.push(command);
    return Promise.resolve("ok");
  });
  return { sh, calls };
};

const baseCtx = (sh: any, over: any = {}) => ({
  sh,
  commit: true,
  tag: true,
  gitClean: true,
  isSelective: false,
  ...over,
});

describe("checkGitClean", () => {
  it("is clean when git status has no changes", async () => {
    const sh = vi.fn(() => Promise.resolve({ stdout: "" }));
    await verify({ timeout: 2000 })
      .step(() => checkGitClean(sh))
      .step((clean) => {
        expect(clean).toBe(true);
        expect(sh).toHaveBeenCalledWith("git status --porcelain --untracked-files=all");
      });
  });

  it("is dirty when git status rejects", async () => {
    const sh = vi.fn(() => Promise.reject(new Error("exit 1")));
    await verify({ timeout: 2000 })
      .step(() => checkGitClean(sh))
      .step((clean) => expect(clean).toBe(false));
  });

  describe("repository changes", () => {
    let cwd: string;
    const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });
    const sh = (command: string) => execShell(command, cwd);

    beforeEach(() => {
      Fs.mkdirSync(".temp", { recursive: true });
      cwd = Fs.mkdtempSync(Path.resolve(".temp/git-clean-"));
      Fs.writeFileSync(Path.join(cwd, ".gitignore"), "ignored.txt\n");
      Fs.writeFileSync(Path.join(cwd, "tracked.txt"), "original\n");
      git("init", "-q");
      git("config", "user.name", "Test");
      git("config", "user.email", "test@example.invalid");
      git("add", ".");
      git("commit", "-qm", "initial");
    });

    afterEach(() => Fs.rmSync(cwd, { recursive: true, force: true }));

    it("allows a clean repository with ignored files", async () => {
      await verify({ timeout: 2000 })
        .step(() => Fs.writeFileSync(Path.join(cwd, "ignored.txt"), "ignored\n"))
        .step(() => checkGitClean(sh))
        .step((clean) => expect(clean).toBe(true));
    });

    it.each(["staged", "unstaged", "untracked"])("detects %s changes", async (state) => {
      await verify({ timeout: 2000 })
        .step(() => {
          const file = state === "untracked" ? "new.txt" : "tracked.txt";
          Fs.writeFileSync(Path.join(cwd, file), "changed\n");
          if (state === "staged") git("add", file);
          // The caller's display preference must not hide untracked files from this check.
          git("config", "status.showUntrackedFiles", "no");
        })
        .step(() => checkGitClean(sh))
        .step((clean) => expect(clean).toBe(false));
    });
  });
});

describe("commitAndTagUpdates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips everything when commit is disabled", async () => {
    const { sh } = makeSh();
    const result = await commitAndTagUpdates(baseCtx(sh, { commit: false }), {
      packages: ["a/package.json"],
      tags: ["a@1.0.0"],
    });
    expect(result).toEqual({ committed: false, tagged: 0 });
    expect(sh).not.toHaveBeenCalled();
  });

  it("skips everything when the tree is dirty", async () => {
    const { sh } = makeSh();
    const result = await commitAndTagUpdates(baseCtx(sh, { gitClean: false }), {
      packages: ["a/package.json"],
      tags: ["a@1.0.0"],
    });
    expect(result).toEqual({ committed: false, tagged: 0 });
    expect(sh).not.toHaveBeenCalled();
  });

  it("stages only the quoted packages when no changelog file is given (prepare)", async () => {
    const { sh, calls } = makeSh();
    await verify({ timeout: 2000 })
      .step(() => commitAndTagUpdates(baseCtx(sh), {
        packages: ["a/package.json", "b/package.json"],
        tags: [],
      }))
      .step(() => expect(calls[0]).toBe(`git add -- 'a/package.json' 'b/package.json'`));
  });

  it("stages the changelog ahead of the packages when given (version, changelog)", async () => {
    const { sh, calls } = makeSh();
    await verify({ timeout: 2000 })
      .step(() => commitAndTagUpdates(baseCtx(sh, { changeLogFile: "/repo/CHANGELOG.md" }), {
        packages: ["a/package.json"],
        tags: [],
      }))
      .step(() => expect(calls[0]).toBe(`git add -- '/repo/CHANGELOG.md' 'a/package.json'`));
  });

  it("quotes shell metacharacters and protects paths starting with a dash", async () => {
    const { sh, calls } = makeSh();
    await verify({ timeout: 2000 })
      .step(() => commitAndTagUpdates(baseCtx(sh, { changeLogFile: "/repo/release notes.md" }), {
        packages: ["-$output`name`'\".txt"],
        tags: [],
      }))
      .step(() => expect(calls[0]).toBe("git add -- '/repo/release notes.md' '-$output`name`'\\''\".txt'"));
  });

  it("puts the tags in the commit body", async () => {
    const { sh, calls } = makeSh();
    await commitAndTagUpdates(baseCtx(sh), {
      packages: ["a/package.json"],
      tags: ["a@1.0.0", "b@2.0.0"],
    });
    expect(calls[1]).toContain(`-m " - a@1.0.0\n - b@2.0.0"`);
  });

  it("marks a selective release in the commit subject", async () => {
    const { sh, calls } = makeSh();
    await commitAndTagUpdates(baseCtx(sh, { isSelective: true }), {
      packages: ["a/package.json"],
      tags: [],
    });
    const full = calls[1];
    const { sh: sh2, calls: calls2 } = makeSh();
    await commitAndTagUpdates(baseCtx(sh2, { isSelective: false }), {
      packages: ["a/package.json"],
      tags: [],
    });
    expect(full).not.toBe(calls2[1]);
    expect(full).toContain("[Selective]");
  });

  it("creates one tag per tag, and reports how many", async () => {
    const { sh, calls } = makeSh();
    const result = await commitAndTagUpdates(baseCtx(sh), {
      packages: ["a/package.json"],
      tags: ["a@1.0.0", "b@2.0.0"],
    });
    expect(calls.slice(2)).toEqual(["git tag a@1.0.0", "git tag b@2.0.0"]);
    expect(result).toEqual({ committed: true, tagged: 2 });
  });

  it("commits but creates no tags when tag is off", async () => {
    const { sh, calls } = makeSh();
    const result = await commitAndTagUpdates(baseCtx(sh, { tag: false }), {
      packages: ["a/package.json"],
      tags: ["a@1.0.0"],
    });
    expect(calls.filter((c) => c.startsWith("git tag"))).toHaveLength(0);
    expect(result).toEqual({ committed: true, tagged: 0 });
  });
});
