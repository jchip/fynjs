import { describe, it, beforeEach, afterEach, expect } from "vitest";
import fs from "fs/promises";
import os from "os";
import Path from "path";
import fyntil from "../../../lib/util/fyntil";

describe("fyntil", function () {
  describe("exit", function () {
    it("call process.exit", () => {
      const save = process.exit;
      let code;
      process.exit = (c) => (code = c);
      fyntil.exit();
      expect(code).toBe(0);
      fyntil.exit(new Error());
      expect(code).toBe(1);
      process.exit = save;
    });

    it("passes through a numeric exit code", () => {
      const save = process.exit;
      let code;
      process.exit = (c) => (code = c);
      fyntil.exit(0);
      expect(code).toBe(0);
      fyntil.exit(2);
      expect(code).toBe(2);
      fyntil.exit(137);
      expect(code).toBe(137);
      process.exit = save;
    });
  });

  describe("retry", function () {
    it("should retry if checks array contains allowed code", () => {
      let count = 0;
      return fyntil
        .retry(
          () => {
            count++;
            if (count < 2) {
              const err = new Error("test");
              err.code = "test";
              throw err;
            }
          },
          ["test"],
          5,
          10,
        )
        .then(() => {
          expect(count).toBe(2);
        });
    });

    it("should not retry if checks array does not contains allowed code", () => {
      let count = 0;
      let error;

      return fyntil
        .retry(
          () => {
            count++;
            if (count < 2) {
              const err = new Error("test");
              err.code = "test";
              throw err;
            }
          },
          ["blah"],
          5,
          10,
        )
        .catch((err) => {
          error = err;
        })
        .then(() => {
          expect(error).toEqual(expect.anything());
          expect(error.message).toBe("test");
          expect(count).toBe(1);
        });
    });

    it("should not retry if func succeeds first time", () => {
      return fyntil.retry(
        () => {},
        () => {
          throw new Error("should not retry");
        },
        5,
        10,
      );
    });

    it("should not retry if check returns false", () => {
      let error;
      let count = 0;
      return fyntil
        .retry(
          () => {
            count++;
            throw new Error("test");
          },
          () => false,
          5,
          10,
        )
        .catch((err) => (error = err))
        .then(() => {
          expect(error).toEqual(expect.anything());
          expect(count).toBe(1);
        });
    });

    it("should fail afer all retries", () => {
      let error;
      return fyntil
        .retry(
          () => {
            throw new Error("test failure");
          },
          () => {
            return true;
          },
          3,
          10,
        )
        .catch((err) => (error = err))
        .then(() => {
          expect(error).toEqual(expect.anything());
          expect(error.message).toBe("test failure");
        });
    });
  });

  describe("checkValueSatisfyRules", () => {
    it("should return true for no rules", () => {
      expect(fyntil.checkValueSatisfyRules(null, "a")).toBe(true);
      expect(fyntil.checkValueSatisfyRules("", "a")).toBe(true);
    });

    it("should deny ! value", () => {
      expect(fyntil.checkValueSatisfyRules(["!test"], "test")).toBe(false);
    });

    it("should return true for no explicit accept values", () => {
      expect(fyntil.checkValueSatisfyRules([], "blah")).toBe(true);
      expect(fyntil.checkValueSatisfyRules(["!foo"], "blah")).toBe(true);
    });

    it("should deny value that's not listed", () => {
      expect(fyntil.checkValueSatisfyRules(["foo"], "blah")).toBe(false);
    });
  });

  describe("resolveGitMainWorktreeDir", () => {
    let tmpRoot;

    beforeEach(async () => {
      tmpRoot = await fs.mkdtemp(Path.join(os.tmpdir(), "fyn-wt-"));
    });

    afterEach(async () => {
      if (tmpRoot) {
        await fs.rm(tmpRoot, { recursive: true, force: true });
      }
    });

    it("returns dir unchanged when not in a git repo", async () => {
      const dir = Path.join(tmpRoot, "no-git");
      await fs.mkdir(dir, { recursive: true });
      expect(await fyntil.resolveGitMainWorktreeDir(dir)).toBe(dir);
    });

    it("returns dir unchanged for a normal repo with a .git directory", async () => {
      const dir = Path.join(tmpRoot, "normal");
      await fs.mkdir(Path.join(dir, ".git"), { recursive: true });
      expect(await fyntil.resolveGitMainWorktreeDir(dir)).toBe(dir);
    });

    // create a main worktree with a linked worktree pointing back at it
    const setupWorktree = async () => {
      const mainTree = Path.join(tmpRoot, "main");
      const wtGitDir = Path.join(mainTree, ".git", "worktrees", "wt1");
      await fs.mkdir(wtGitDir, { recursive: true });
      await fs.writeFile(Path.join(wtGitDir, "commondir"), "../..\n");

      const worktree = Path.join(tmpRoot, "wt1");
      await fs.mkdir(worktree, { recursive: true });
      await fs.writeFile(Path.join(worktree, ".git"), `gitdir: ${wtGitDir}\n`);

      return { mainTree, worktree };
    };

    it("resolves a linked worktree root to the main worktree", async () => {
      const { mainTree, worktree } = await setupWorktree();
      expect(await fyntil.resolveGitMainWorktreeDir(worktree)).toBe(mainTree);
    });

    it("preserves the sub-path when the dir is below the worktree root", async () => {
      const { mainTree, worktree } = await setupWorktree();
      const sub = Path.join(worktree, "packages", "foo");
      await fs.mkdir(sub, { recursive: true });
      expect(await fyntil.resolveGitMainWorktreeDir(sub)).toBe(
        Path.join(mainTree, "packages", "foo"),
      );
    });

    it("returns dir unchanged when the .git file has no gitdir", async () => {
      const worktree = Path.join(tmpRoot, "bad");
      await fs.mkdir(worktree, { recursive: true });
      await fs.writeFile(Path.join(worktree, ".git"), "not a gitdir line\n");
      expect(await fyntil.resolveGitMainWorktreeDir(worktree)).toBe(worktree);
    });
  });

  describe("relativePath", () => {
    it("return dir with leading .", () => {
      expect(fyntil.relativePath("/blah/foo/test/abc", "/blah/foo/test/abc/def")).toBe("./def");
    });

    it("return relative dir", () => {
      expect(fyntil.relativePath("/blah/foo/test/abc", "/blah/foo/test/xyz/123")).toBe(
        "../xyz/123",
      );
    });
  });
});
