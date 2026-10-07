import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fs from "node:fs";
import Os from "node:os";
import Path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { verify } from "run-verify";

//
// CLI options driven through the real entry (bin/fynpo.js loads src in a dev checkout).
// Every run happens in a temp dir outside the repo, so config search never reaches the
// repo root and nothing fynpo writes lands in the checkout.
//

const execFileAsync = promisify(execFile);
const bin = Path.resolve(import.meta.dirname, "../bin/fynpo.js");

const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1" };
delete env.FORCE_COLOR;

const fynpo = (cwd: string, ...args: string[]) =>
  execFileAsync(process.execPath, [bin, ...args], { cwd, env, timeout: 15000 });

const output = (r: { stdout: string; stderr: string }) => r.stdout + r.stderr;

const writeJson = (file: string, data: unknown) => {
  Fs.mkdirSync(Path.dirname(file), { recursive: true });
  Fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
};

let tmp: string;

beforeEach(() => {
  tmp = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fynpo-cli-options-"));
});

afterEach(() => Fs.rmSync(tmp, { recursive: true, force: true }));

/** a one-package repo whose `echo` script prints the args it receives */
const makeRepo = (fynpoConfig: Record<string, unknown> = {}) => {
  writeJson(Path.join(tmp, "fynpo.json"), fynpoConfig);
  writeJson(Path.join(tmp, "package.json"), { name: "root", private: true });
  writeJson(Path.join(tmp, "packages/a/package.json"), {
    name: "a",
    version: "1.0.0",
    scripts: { echo: "node echo.js" },
  });
  Fs.writeFileSync(
    Path.join(tmp, "packages/a/echo.js"),
    "console.log('ARGS=' + JSON.stringify(process.argv.slice(2)));\n"
  );
  return tmp;
};

describe("removed options", () => {
  // `--skip a` keeps bootstrap from running fyn install if the option were still accepted
  it.each([
    ["bootstrap", "--skip", "a", "--no-build"],
    ["bootstrap", "--skip", "a", "--build"],
  ])("rejects %s %s %s %s as unknown", (...args) =>
    verify({ timeout: 20000 })
      .step(() => makeRepo())
      .expectError.step((cwd) => fynpo(cwd, ...args))
      .keep.step((err: any) => expect(err.code).toBe(1))
      .step((err: any) => output(err))
      .step((out) => expect(out).toContain("unknown CLI option 'build'"))
  );

  it.each([
    [["local", "--deps", "3"], "deps"],
    [["local", "-d", "3"], "d"],
  ])("rejects %j as unknown", (args, name) =>
    verify({ timeout: 20000 })
      .step(() => makeRepo())
      .expectError.step((cwd) => fynpo(cwd, ...args))
      .keep.step((err: any) => expect(err.code).toBe(1))
      .step((err: any) => output(err))
      .step((out) => expect(out).toContain(`unknown CLI option '${name}'`))
  );
});

describe("run forwards args after --", () => {
  it.each([
    [["run", "echo", "--", "--foo", "bar", "a b"], 'ARGS=["--foo","bar","a b"]'],
    [["run", "echo", "--stream", "--", "--x"], 'a: ARGS=["--x"]'],
    [["run", "echo"], "ARGS=[]"],
  ])("%j prints %s", (args, expected) =>
    verify({ timeout: 20000 })
      .step(() => makeRepo())
      .step((cwd) => fynpo(cwd, ...args))
      .step((r) => output(r))
      .step((out) => expect(out).toContain(expected))
  );
});

describe("--cwd for init and commitlint", () => {
  it("init initializes the --cwd dir, not the current dir", () =>
    verify({ timeout: 20000 })
      .step(() => Fs.mkdirSync(Path.join(tmp, "run")))
      .step(() => writeJson(Path.join(tmp, "target/package.json"), { name: "t", private: true }))
      .step(() => fynpo(Path.join(tmp, "run"), "init", "--cwd", Path.join(tmp, "target")))
      .keep.step(() => expect(Fs.existsSync(Path.join(tmp, "target/fynpo.json"))).toBe(true))
      .step(() => expect(Fs.existsSync(Path.join(tmp, "run/fynpo.json"))).toBe(false))
  );

  it("commitlint reads config and the edit file from the --cwd dir", () =>
    verify({ timeout: 20000 })
      .step(() => Fs.mkdirSync(Path.join(tmp, "run")))
      .step(() =>
        writeJson(Path.join(tmp, "target/fynpo.json"), {
          commitlint: { rules: { "type-enum": [2, "always", ["feat"]] } },
        })
      )
      .step(() => Fs.writeFileSync(Path.join(tmp, "target/MSG"), "fix: x\n"))
      .step(() => execFileSync("git", ["init", "-q"], { cwd: Path.join(tmp, "target") }))
      .expectError.step(() =>
        fynpo(Path.join(tmp, "run"), "commitlint", "--cwd", Path.join(tmp, "target"), "--edit", "MSG")
      )
      .keep.step((err: any) => expect(err.code).toBe(1))
      .step((err: any) => output(err))
      .step((out) => expect(out).toContain("type must be one of [feat] [type-enum]"))
  );
});

describe("bootstrap honors config fynOpts", () => {
  // `--skip a` stops before fyn runs; the command line is logged first
  it("adds fynOpts from fynpo.json to the fyn command", () =>
    verify({ timeout: 20000 })
      .step(() => makeRepo({ fynOpts: ["--no-rcfile"] }))
      .step((cwd) => fynpo(cwd, "bootstrap", "--skip", "a"))
      .step((r) => output(r))
      .step((out) => expect(out).toMatch(/bootstrap command: fyn .*--no-rcfile .*install/))
  );
});

describe("changelog --tag help", () => {
  it("says --tag needs --publish", () =>
    verify({ timeout: 20000 })
      .step(() => fynpo(tmp, "changelog", "--help"))
      .step((r) => output(r))
      .step((out) => expect(out).toMatch(/--tag\s+create tags for individual packages \(only with --publish\)/))
  );
});
