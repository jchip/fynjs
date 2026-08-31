import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "child_process";
import { existsSync } from "fs";
import Path from "path";
import { promisify } from "util";

import { loadCk, plainCk, stripMarkers } from "../src/ck";

const execFileAsync = promisify(execFile);

describe("stripMarkers", () => {
  it("removes color markers and keeps the text", () => {
    expect(stripMarkers("<cyan>cd dir\nfyn</>")).toEqual("cd dir\nfyn");
  });

  it("leaves a string with no markers alone", () => {
    expect(stripMarkers("plain text")).toEqual("plain text");
  });
});

describe("plainCk", () => {
  it("interpolates a tagged template and drops the markers", () => {
    const dir = "my-repo";
    expect(plainCk`<cyan>cd ${dir}</> then <green>fyn</>`).toEqual("cd my-repo then fyn");
  });

  it("handles a template with no interpolation", () => {
    expect(plainCk`<cyan>hello</>`).toEqual("hello");
  });

  it("interpolates every argument, including a trailing one", () => {
    expect(plainCk`${1}-${2}-${3}`).toEqual("1-2-3");
  });

  it("passes a plain string through", () => {
    expect(plainCk("<cyan>hi</>" as any)).toEqual("hi");
  });

  it("returns empty string for null/undefined", () => {
    expect(plainCk(undefined as any)).toEqual("");
    expect(plainCk(null as any)).toEqual("");
  });
});

describe("loadCk", () => {
  it("loads the real chalker and renders the template", async () => {
    const ck = await loadCk();
    const dir = "my-repo";
    // chalker consumes the markers whether or not colors are available, so the
    // text survives and the markers do not - same contract as the fallback.
    const out = ck`<cyan>cd ${dir}</>`;
    expect(out).toContain("cd my-repo");
    expect(out).not.toContain("<cyan>");
  });

  it("never rejects", async () => {
    await expect(loadCk()).resolves.toBeTypeOf("function");
  });
});

// These run against the compiled CJS in dist, which is the only place the two FPO-29 bugs are
// observable - a unit test importing src through vitest's ESM transform cannot reproduce either.
describe("bin entry (FPO-29 regression)", () => {
  const pkgDir = Path.join(__dirname, "..");

  beforeAll(() => {
    if (!existsSync(Path.join(pkgDir, "dist", "index.js"))) {
      throw new Error("dist is not built - run `fyn build` in packages/create-monorepo first");
    }
  });

  // chalker is ESM with a top-level await. A static `import ck from "chalker"` compiles to
  // require() under module: CommonJS and killed the bin with ERR_REQUIRE_ASYNC_MODULE before it
  // printed anything.
  it("requires dist/create.js without throwing ERR_REQUIRE_ASYNC_MODULE", async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        "-e",
        `try { require("./dist/create.js"); console.log("LOADED"); }
         catch (err) { console.log("THREW:" + err.code); }`,
      ],
      { cwd: pkgDir }
    );

    expect(stdout.trim()).toEqual("LOADED");
  });

  // nix-clap 1.x (the pre-rename package) does `module.exports = NixClap`, so destructuring a named `NixClap` gave
  // undefined and the bin died with "NixClap is not a constructor".
  it("runs the bin end to end and prints usage", async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [Path.join(pkgDir, "bin", "create-monorepo.js"), "--help"],
      { cwd: pkgDir }
    );

    expect(stdout).toContain("Create a new fynpo monorepo");
    expect(stdout).toContain("--commitlint");
  });
});
