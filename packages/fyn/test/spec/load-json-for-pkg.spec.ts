import { describe, it, beforeEach, afterEach, expect } from "vitest";
import Fs from "fs";
import Os from "os";
import Path from "path";
import Fyn from "../../lib/fyn";

//
// loadJsonForPkg decides whether a directory already holds the package fyn is about to
// install. pkg-dist-fetcher's `find()` reads the `_invalid` flag it sets: unset means
// "this dir is the right package", so the existing content is kept and not re-extracted.
//
// The only mismatch check was `json._id !== pkgId`. fyn writes `_id` itself, in
// pkg-installer (`depInfo.json._id = name@version`), from the version it believed it was
// installing - and `pkgId` is built from that same belief. Stamp and expectation always
// agree, so the check could never see that the directory held a different version.
//
// A directory carrying a newer version then passes as the older one. Its dependency
// ranges are what a lock entry records (pkg-dep-locker: `meta.dependencies =
// json.dependencies`), so the lock ends up claiming the older version depends on what the
// newer one declares. fyn rejects that lock on the next run as "lockfile stale for
// entry ... - refreshing".
//
describe("loadJsonForPkg version validation", () => {
  let dir: string;

  const writePkgJson = (json: Record<string, unknown>) => {
    Fs.writeFileSync(Path.join(dir, "package.json"), JSON.stringify(json, null, 2));
  };

  beforeEach(() => {
    dir = Fs.realpathSync(Fs.mkdtempSync(Path.join(Os.tmpdir(), "fyn-load-json-")));
  });

  afterEach(() => {
    Fs.rmSync(dir, { recursive: true, force: true });
  });

  const loadJson = (pkg: Record<string, unknown>) =>
    Fyn.prototype.loadJsonForPkg.call({} as never, pkg as never, dir);

  it("rejects a directory holding a different version", async () => {
    // What a drifted node_modules looks like: 11.3.0 on disk, stamped with the 11.2.0 id
    // fyn assigned when it thought it was installing 11.2.0.
    writePkgJson({
      name: "@fastify/cors",
      version: "11.3.0",
      _id: "@fastify/cors@11.2.0",
      dependencies: { "fastify-plugin": "^6.0.0" }
    });

    const json = await loadJson({ name: "@fastify/cors", version: "11.2.0" });

    expect(json._invalid).toBe(true);
  });

  it("does not adopt the wrong version's dependencies onto the pkg", async () => {
    const pkg: Record<string, unknown> = { name: "pg", version: "8.21.0" };

    writePkgJson({
      name: "pg",
      version: "8.23.0",
      _id: "pg@8.21.0",
      dependencies: { "pg-connection-string": "^2.14.0" }
    });

    await loadJson(pkg);

    // pkg.json is what the locker writes a lock entry's dependencies from. Leaving it
    // unset is what makes the caller re-extract instead of recording 8.23.0's ranges
    // under the 8.21.0 key.
    expect(pkg.json).toBeUndefined();
  });

  it("accepts a directory holding the expected version", async () => {
    writePkgJson({
      name: "@fastify/cors",
      version: "11.2.0",
      _id: "@fastify/cors@11.2.0",
      dependencies: { "fastify-plugin": "^5.0.0" }
    });

    const json = await loadJson({ name: "@fastify/cors", version: "11.2.0" });

    expect(json._invalid).toBeUndefined();
    expect(json.dependencies).toEqual({ "fastify-plugin": "^5.0.0" });
  });

  it("accepts a version that only differs by needing semver cleanup", async () => {
    writePkgJson({ name: "mod-a", version: "v1.2.3", _id: "mod-a@1.2.3" });

    const json = await loadJson({ name: "mod-a", version: "1.2.3" });

    expect(json._invalid).toBeUndefined();
    expect(json.version).toBe("1.2.3");
    expect(json._origVersion).toBe("v1.2.3");
  });

  it("accepts a locally linked package, whose version carries a fynlocal tag", async () => {
    // localify() appends the tag to the version fyn tracks; the directory on disk keeps
    // the plain version, so a raw string comparison would reject every linked package.
    writePkgJson({ name: "mod-local", version: "1.0.0" });

    const json = await loadJson({ name: "mod-local", version: "1.0.0-fynlocal_h" });

    expect(json._invalid).toBeUndefined();
  });

  it("still rejects a mismatch when the directory has no _id to check", async () => {
    writePkgJson({ name: "mod-a", version: "2.0.0" });

    const json = await loadJson({ name: "mod-a", version: "1.0.0" });

    expect(json._invalid).toBe(true);
  });
});
