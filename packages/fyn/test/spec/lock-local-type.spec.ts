import { describe, it, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { expect } from "chai";
import Fs from "fs";
import Path from "path";
import Fyn from "../../lib/fyn";
import PkgInstaller from "../../lib/pkg-installer";
import mockNpm from "../fixtures/mock-npm";
import logger from "../../lib/logger";

//
// A local package's link type - "hard", "sym" or "sym1" - is what the installer dispatches
// on: `_linkLocalPkg` hard-links only for "hard" and throws for anything else, `_savePkgJson`
// skips "sym", the dep linker looks for "sym1", local-exports wants "hard".
//
// The lockfile records only THAT a package was local (`$: local`), never which of the three.
// The version key does carry it though - `localify()` writes `-fynlocal_h` for hard - so the
// dep locker reads it back from there rather than setting a bare `true` (FJM-159).
//
describe("local link type through the lockfile", function() {
  logger.setItemType(false);
  let server;
  let cwd;

  beforeAll(() => mockNpm({ port: 0, logLevel: "warn" }).then(s => (server = s)));
  afterAll(() => server && server.stop());

  beforeEach(() => {
    logger._logLevel = 999;
    cwd = Path.join(
      __dirname,
      "..",
      `.tmp_lock_local_${process.pid.toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    );
    Fs.mkdirSync(Path.join(cwd, "local-mod-a"), { recursive: true });
    Fs.writeFileSync(
      Path.join(cwd, "local-mod-a", "package.json"),
      JSON.stringify({ name: "mod-a", version: "1.1.0" })
    );
  });

  afterEach(() => Fs.rmSync(cwd, { recursive: true, force: true }));

  const lockWith = (semverKey: string, lockedVersion = "1.1.0-fynlocal_h") =>
    [
      "mod-a:",
      "  _:",
      `    "${semverKey}": ${lockedVersion}`,
      `  ${lockedVersion}:`,
      "    $: local",
      "    _: ./local-mod-a",
      "    version: 1.1.0",
      ""
    ].join("\n");

  const resolveWithLock = async (
    semver: string,
    opts: Record<string, unknown> = {},
    lockedVersion?: string
  ) => {
    Fs.writeFileSync(
      Path.join(cwd, "package.json"),
      JSON.stringify({ name: "app", version: "1.0.0", dependencies: { "mod-a": semver } })
    );
    Fs.writeFileSync(Path.join(cwd, "fyn-lock.yaml"), lockWith(semver, lockedVersion));

    const fyn = new Fyn({
      opts: {
        registry: `http://localhost:${server.info.port}`,
        pkgFile: Path.join(cwd, "package.json"),
        targetDir: "xout",
        cwd,
        fynDir: Path.join(cwd, ".fyn"),
        lockfile: true,
        ignoreDist: true,
        ...opts
      }
    });

    await fyn.resolveDependencies();
    return fyn._data.pkgs["mod-a"];
  };

  //
  // The normal shape for a local dependency: the dep's own semver is the path, so
  // `semverUtil.analyze()` reads "hard" off it and the lock never has to say.
  //
  it("keeps the link type when the dep is declared as a path", async () => {
    const kpkg = await resolveWithLock("./local-mod-a");

    expect(kpkg.versions["1.1.0-fynlocal_h"].local).to.equal("hard");
  });

  //
  // Without --prefer-lock, a lock entry that resolves to a local version is rejected outright
  // (`noLocal` in _resolveWithMeta), so the boolean never gets a chance to escape.
  //
  it("ignores a local lock entry for a plain semver range by default", async () => {
    const kpkg = await resolveWithLock("^1.1.0");

    expect(kpkg.versions["1.1.0-fynlocal_h"]).to.equal(undefined);
  });

  //
  // With --prefer-lock the entry IS used, and nothing else carries a link type: the dep's
  // semver is a plain range, so `analyze()` reads nothing off it, and the lock is the only
  // thing saying "local". (`satisfies()` strips the -fynlocal_h tag, which is why ^1.1.0
  // matches the local version at all.) This used to yield a bare `true` and crash the
  // install - FJM-159.
  //
  it("recovers the hard link type from the locked version under --prefer-lock (FJM-159)", async () => {
    const kpkg = await resolveWithLock("^1.1.0", { preferLock: true });

    expect(kpkg.versions["1.1.0-fynlocal_h"].local).to.equal("hard");
  });

  //
  // The untagged form is everything that is not a hard link. `sym` vs `sym1` is not
  // recoverable - `localify` writes `-fynlocal` for both - and nothing can act on that
  // difference today, since `_linkLocalPkg` throws for either.
  //
  it("reads an untagged locked version as a symlink", async () => {
    const kpkg = await resolveWithLock("^1.1.0", { preferLock: true }, "1.1.0-fynlocal");

    expect(kpkg.versions["1.1.0-fynlocal"].local).to.equal("sym");
  });

  //
  // Why the string matters: `_gatherPkg` branches on `local` being truthy, `_linkLocalPkg`
  // on it being exactly "hard". Anything else - a bare `true` included - lands on a throw
  // whose message blames symlinking.
  //
  it("makes _linkLocalPkg throw for a link type that is not hard", async () => {
    const installer = Object.create(PkgInstaller.prototype);
    installer._fyn = {
      getInstalledPkgDir: () => Path.join(cwd, "xout", "mod-a"),
      _options: {},
      _cwd: cwd
    };

    let err;
    await installer
      ._linkLocalPkg({ name: "mod-a", version: "1.1.0-fynlocal_h", local: true, dir: cwd })
      .catch(e => (err = e));

    expect(err, "expected _linkLocalPkg to reject").to.exist;
    expect(err.message).to.contain("only hard linking local mode supported");
  });
});
