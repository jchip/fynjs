import { describe, it, expect } from "vitest";
import Path from "path";
import { pathToFileURL } from "url";
import { createRequire } from "module";

const requireAt = createRequire(import.meta.url)("../../stubs/require-at.js");

//
// fyn would not start AT ALL on Windows before this: optional-require 2.1.0 runs
//
//   const appPath = setAppPathAtTopNodeModules(import.meta.url);   // unchanged - the bundle
//   const optionalRequire = makeOptionalRequire(appPath);          // path has no /node_modules/
//
// at import time, and its `_getRequire` converts the string with `new URL(x).pathname`. On POSIX
// that gives `/Users/...`, which resolves. On Windows it gives `/C:/Users/...` - a leading slash
// before the drive letter - which Path.resolve mangles into `C:\C:\Users\...`; that stat fails,
// optional-require's catch retries with the raw `file://` string, and the real error surfaced as
//
//   require-at: stat 'C:\Users\joel1\file:\C:\Users\joel1\...\dist\fyn.mjs' failed: ENOENT
//
// The bundle aliases require-at to this stub, so normalizing here fixes every caller inside it.
//
describe("require-at stub url handling", () => {
  const thisDir = Path.dirname(new URL(import.meta.url).pathname);

  it("accepts a plain directory path", () => {
    const req = requireAt(process.cwd());
    expect(typeof req).to.equal("function");
  });

  it("accepts a file:// URL for a directory", () => {
    const req = requireAt(pathToFileURL(process.cwd()).href);
    expect(typeof req).to.equal("function");
  });

  it("accepts a file:// URL for a file, falling back to its dirname", () => {
    const req = requireAt(pathToFileURL(import.meta.url.replace(/^file:\/\//, "")).href);
    expect(typeof req).to.equal("function");
  });

  //
  // The exact shape optional-require hands over on Windows. On POSIX this is already a valid
  // absolute path, so the test asserts the same thing on both: it must not throw.
  //
  it("accepts the `new URL(x).pathname` form, including a leading-slash drive letter", () => {
    expect(() => requireAt(thisDir)).to.not.throw();
    // simulate the Windows shape regardless of the host platform
    expect(() => requireAt("/C:/definitely/not/here")).to.throw(/require-at/);
  });

  it("resolves a real module from the returned require", () => {
    const req = requireAt(pathToFileURL(process.cwd()).href);
    expect(req("path")).to.equal(Path);
  });

  it("still reports a genuinely missing directory", () => {
    expect(() => requireAt(Path.join(process.cwd(), "no", "such", "dir", "at", "all"))).to.throw(
      /require-at/
    );
  });
});
