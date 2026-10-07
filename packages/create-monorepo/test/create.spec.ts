import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "child_process";
import Fs from "fs";
import Os from "os";
import Path from "path";
import { promisify } from "util";
import { verify } from "run-verify";

const execFileAsync = promisify(execFile);
const pkgDir = Path.resolve(import.meta.dirname, "..");
const bin = Path.join(pkgDir, "bin/create-monorepo.js");

describe("create-monorepo e2e", () => {
  let tmp: string;
  const run = (args: string[]) => execFileAsync(process.execPath, [bin, ...args], { cwd: tmp });
  const readJson = (file: string) => JSON.parse(Fs.readFileSync(file, "utf8"));

  beforeAll(() => {
    tmp = Fs.mkdtempSync(Path.join(Os.tmpdir(), "create-monorepo-"));
  });

  afterAll(() => {
    Fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("scaffolds a repo with commitlint and husky", () =>
    verify({ timeout: 60000 })
      .step(() => run(["r1", "--commitlint"]))
      .step(() => {
        const dir = Path.join(tmp, "r1");
        for (const f of ["package.json", "fynpo.config.js", ".gitignore", ".npmrc", "README.md", ".git"]) {
          expect(Fs.existsSync(Path.join(dir, f)), f).toBe(true);
        }
        expect(Fs.statSync(Path.join(dir, "packages")).isDirectory()).toBe(true);
        expect(Fs.existsSync(Path.join(dir, "fynpo.json"))).toBe(false);
        return readJson(Path.join(dir, "package.json"));
      })
      .step((pkg: any) => {
        expect(pkg.devDependencies.fynpo).toBe("^3.2.3");
        expect(pkg.devDependencies.husky).toBeDefined();
        expect(pkg.scripts.prepare).toBe("husky install");
      }), 120000);

  it("scaffolds a repo without commitlint by default", () =>
    verify({ timeout: 60000 })
      .step(() => run(["r2"]))
      .step(() => {
        const dir = Path.join(tmp, "r2");
        expect(Fs.existsSync(Path.join(dir, "fynpo.config.js"))).toBe(false);
        expect(readJson(Path.join(dir, "fynpo.json")).changeLogMarkers).toBeDefined();
        return readJson(Path.join(dir, "package.json"));
      })
      .step((pkg: any) => {
        expect(pkg.devDependencies.fynpo).toBe("^3.2.3");
        expect(pkg.devDependencies.husky).toBeUndefined();
        expect(pkg.scripts.prepare).toBeUndefined();
      }), 120000);
});
