import { describe, it, expect, vi, beforeEach } from "vitest";

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
  it("is clean when git diff --quiet resolves", async () => {
    const sh = vi.fn(() => Promise.resolve(""));
    await expect(checkGitClean(sh)).resolves.toBe(true);
    expect(sh).toHaveBeenCalledWith("git diff --quiet");
  });

  it("is dirty when git diff --quiet rejects", async () => {
    const sh = vi.fn(() => Promise.reject(new Error("exit 1")));
    await expect(checkGitClean(sh)).resolves.toBe(false);
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
    await commitAndTagUpdates(baseCtx(sh), {
      packages: ["a/package.json", "b/package.json"],
      tags: [],
    });
    expect(calls[0]).toBe(`git add "a/package.json" "b/package.json"`);
  });

  it("stages the changelog ahead of the packages when given (version, changelog)", async () => {
    const { sh, calls } = makeSh();
    await commitAndTagUpdates(baseCtx(sh, { changeLogFile: "/repo/CHANGELOG.md" }), {
      packages: ["a/package.json"],
      tags: [],
    });
    expect(calls[0]).toBe(`git add /repo/CHANGELOG.md "a/package.json"`);
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
