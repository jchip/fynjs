import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, "../..");
const register = path.join(pkgRoot, "src/register.ts");
const fixture = (...p: string[]) => path.join(pkgRoot, "test/fixtures", ...p);

/** Run a fixture under the hook and return trimmed stdout. */
const run = (entry: string) =>
  execFileSync(process.execPath, ["--import", register, entry], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();

describe("register (end to end, real node)", () => {
  it("loads its own source with no bootstrap loader", () => {
    // src/*.ts use explicit .ts specifiers, so node's native stripping
    // resolves them unaided - the package needs nothing to load itself.
    expect(() => run(fixture("esm", "entry.ts"))).not.toThrow();
  });

  it("resolves every ESM specifier shape", () => {
    expect(JSON.parse(run(fixture("esm", "entry.ts")))).toEqual({
      label: "lib:5",
      id: "ok",
      which: "real-js",
      from: "nested-index"
    });
  });

  it("resolves CommonJS require() the same way", () => {
    expect(JSON.parse(run(fixture("cjs", "entry.ts")))).toEqual({
      label: "cjs-lib:3",
      id: "ok"
    });
  });

  it("fails without the hook, proving the hook is what fixes it", () => {
    expect(() =>
      execFileSync(process.execPath, [fixture("esm", "entry.ts")], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      })
    ).toThrow();
  });

  it("keeps stack traces exact without source maps", () => {
    let stderr = "";
    try {
      execFileSync(process.execPath, ["--import", register, fixture("esm", "boom.ts")], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (e: any) {
      stderr = String(e.stderr);
    }
    // `throw` sits on line 7 of boom.ts, after type-only lines that get erased.
    expect(stderr).toMatch(/boom\.ts:7:9/);
  });

  it("cannot load ESM syntax from a commonjs package (documents FPM-100)", () => {
    let stderr = "";
    try {
      execFileSync(process.execPath, ["--import", register, fixture("cjs", "esm-syntax.ts")], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (e: any) {
      stderr = String(e.stderr);
    }
    // Node strips types but never converts module syntax. The fix is
    // "type": "module" on the package, not anything this resolver can do.
    expect(stderr).toMatch(/Unexpected token 'export'/);
  });
});
