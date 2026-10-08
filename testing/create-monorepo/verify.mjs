// End to end check of starting a fynpo monorepo with this repo's create-monorepo, fyn and
// fynpo. It works in a new dir under the OS temp dir, outside any git repo, so create-monorepo
// runs `git init` itself and nothing is ever committed to fynjs. Run it after `fyn bootstrap`,
// since it uses each package's built bin. KEEP_TEMP=1 keeps the temp dir for a look.
import Fs from "node:fs";
import Os from "node:os";
import Path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { verify } from "run-verify";

const PACKAGES = Path.join(import.meta.dirname, "..", "..", "packages");
const CREATE_BIN = Path.join(PACKAGES, "create-monorepo/bin/create-monorepo.js");
const FYN_BIN = Path.join(PACKAGES, "fyn/bin/fyn.mjs");
const FYNPO_BIN = Path.join(PACKAGES, "fynpo/bin/fynpo.js");

const tmp = Fs.realpathSync(Fs.mkdtempSync(Path.join(Os.tmpdir(), "fynjs-create-monorepo-")));
const repo = Path.join(tmp, "my-repo");

/** Run a command and return its output. On failure, the error carries the output. */
const run = (cmd, args, cwd = repo, label = [cmd, ...args].join(" ")) => {
  console.log(`$ ${label}`);
  try {
    return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    err.message = `${err.message}\n${err.stdout || ""}\n${err.stderr || ""}`;
    throw err;
  }
};
const node = (bin, ...args) =>
  run(process.execPath, [bin, ...args], repo, [Path.basename(bin), ...args].join(" "));
const git = (...args) => run("git", args).trim();
const readJson = file => JSON.parse(Fs.readFileSync(Path.join(repo, file), "utf8"));
const writePkg = (name, pkg, code) => {
  const dir = Path.join(repo, "packages", name);
  Fs.mkdirSync(dir, { recursive: true });
  Fs.writeFileSync(Path.join(dir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  Fs.writeFileSync(Path.join(dir, "index.js"), code);
};

await verify({
  timeout: 300000,
  cleanup: () => {
    if (process.env.KEEP_TEMP) console.log(`\nkept ${tmp}`);
    else Fs.rmSync(tmp, { recursive: true, force: true });
  }
})
  .step(() => {
    run(process.execPath, [CREATE_BIN, "my-repo"], tmp, `create-monorepo my-repo  (in ${tmp})`);
    for (const f of ["package.json", "fynpo.json", ".gitignore", ".npmrc", "packages"]) {
      assert.ok(Fs.existsSync(Path.join(repo, f)), `create-monorepo did not write ${f}`);
    }
    // the guard that keeps every later commit inside my-repo
    assert.ok(Fs.existsSync(Path.join(repo, ".git")), "create-monorepo did not run git init");
    assert.equal(git("rev-parse", "--show-toplevel"), repo);
    git("config", "user.name", "create-monorepo e2e");
    git("config", "user.email", "e2e@example.invalid");
    git("config", "commit.gpgsign", "false");
  })
  .step(() => {
    node(FYN_BIN, "install", "--no-audit");
    assert.ok(Fs.existsSync(Path.join(repo, "node_modules/fynpo/package.json")), "fyn did not install fynpo");
  })
  .step(() => {
    writePkg(
      "pkg-a",
      { name: "pkg-a", version: "1.0.0", type: "module", main: "index.js", scripts: { test: "node test.js" } },
      "export const greet = n => `hello ${n}`;\n"
    );
    Fs.writeFileSync(
      Path.join(repo, "packages/pkg-a/test.js"),
      "import { greet } from './index.js';\nconsole.log('pkg-a test:', greet('a'));\n"
    );
    writePkg(
      "pkg-b",
      {
        name: "pkg-b",
        version: "1.0.0",
        type: "module",
        main: "index.js",
        dependencies: { "pkg-a": "^1.0.0" },
        scripts: { test: "node index.js" }
      },
      "import { greet } from 'pkg-a';\nconsole.log('pkg-b test:', greet('b'));\n"
    );
  })
  .step(() => {
    node(FYNPO_BIN);
    assert.ok(
      Fs.existsSync(Path.join(repo, "packages/pkg-b/node_modules/pkg-a/package.json")),
      "bootstrap did not link pkg-a into pkg-b"
    );
  })
  .step(() => {
    const out = node(FYNPO_BIN, "run", "test");
    assert.match(out, /pkg-a test: hello a/);
    assert.match(out, /pkg-b test: hello b/);
  })
  .step(() => {
    git("add", "-A");
    git("commit", "-q", "-m", "[minor] add pkg-a and pkg-b");
    node(FYNPO_BIN, "version");
    assert.equal(git("log", "-1", "--format=%s"), "[Publish]");
    assert.equal(git("status", "--porcelain"), "");
    assert.equal(readJson("packages/pkg-a/package.json").version, "1.1.0");
    assert.equal(readJson("packages/pkg-b/package.json").version, "1.1.0");
    assert.equal(readJson("packages/pkg-b/package.json").dependencies["pkg-a"], "^1.1.0");
    const changelog = Fs.readFileSync(Path.join(repo, "CHANGELOG.md"), "utf8");
    assert.match(changelog, /`pkg-a@1\.1\.0`/);
    assert.match(changelog, /`pkg-b@1\.1\.0`/);
    assert.ok(changelog.includes("[minor] add pkg-a and pkg-b"), "changelog is missing the commit");
  })
  .step(() => {
    const out = node(FYNPO_BIN, "publish", "--dry-run");
    assert.match(out, /Dry-run true, not doing actual npm publish/);
    for (const tgz of ["pkg-a/pkg-a-1.1.0.tgz", "pkg-b/pkg-b-1.1.0.tgz"]) {
      assert.ok(Fs.existsSync(Path.join(repo, "packages", tgz)), `publish --dry-run did not pack ${tgz}`);
    }
  });

console.log("\ncreate-monorepo e2e: all steps passed");
