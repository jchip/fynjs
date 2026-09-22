import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fs from "node:fs";
import Path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { verify } from "run-verify";

const exec = promisify(execFile);
const bin = Path.resolve(import.meta.dirname, "../bin/fynpo.js");

describe("prepare CLI errors", () => {
  let cwd: string;
  const git = (...args: string[]) => execFileSync("git", args, { cwd });

  beforeEach(() => {
    Fs.mkdirSync(".temp", { recursive: true });
    cwd = Fs.mkdtempSync(Path.resolve(".temp/prepare-error-"));
    Fs.writeFileSync(Path.join(cwd, "fynpo.json"), "{}");
    git("init", "-q");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.invalid");
    git("config", "core.excludesFile", "/dev/null");
    git("add", ".");
    git("commit", "-qm", "initial");
  });

  afterEach(() => Fs.rmSync(cwd, { recursive: true, force: true }));

  it("reports a dirty tree with recovery guidance and no internal stack", () =>
    verify({ timeout: 3000 })
      .step(() => Fs.writeFileSync(Path.join(cwd, "user-work.txt"), "unfinished"))
      .expectError
      .step(() => exec(process.execPath, [bin, "prepare"], { cwd, timeout: 2000 }))
      .step((error: any) => {
        expect(error.code).toBe(1);
        const output = error.stdout + error.stderr;
        expect(output).toContain("dirty working tree");
        expect(output).toContain("Commit or stash");
        expect(output).not.toContain("fynpo failed");
        expect(output).not.toMatch(/\n\s+at /);
        expect(git("status", "--porcelain").toString()).toBe("?? user-work.txt\n");
      }));
});
