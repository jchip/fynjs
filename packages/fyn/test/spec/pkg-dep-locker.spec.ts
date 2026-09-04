import { describe, it } from "vitest";
import { expect } from "chai";
import Fs from "fs";
import Os from "os";
import Path from "path";
import PkgDepLocker from "../../lib/pkg-dep-locker";
import { RSEMVERS, OPT_FAILED_PLATFORM } from "../../lib/types";

describe("pkg-dep-locker", function() {
  const item = { name: "@anthropic-ai/sdk" };
  const version = "0.52.0";

  const convertTarball = (registry, tarballUrl) => {
    const locker = new PkgDepLocker(false, true, {
      _pkgSrcMgr: {
        getRegistryUrl: () => registry
      }
    });

    locker._lockData = {
      [item.name]: {
        _: {
          "^0.52.0": version
        },
        [version]: {
          $: 0,
          _: tarballUrl
        }
      }
    };

    return locker.convert(item).versions[version].dist.tarball;
  };

  it("should keep a pathful registry tarball URL unchanged", () => {
    const tarballUrl =
      "https://packages.idme.co/artifactory/api/npm/npm/@anthropic-ai/sdk/-/sdk-0.52.0.tgz";

    expect(convertTarball("https://packages.idme.co/artifactory/api/npm/npm/", tarballUrl)).to.equal(
      tarballUrl
    );
  });

  it("should rewrite a pathful registry tarball URL without duplicating the registry path", () => {
    const currentRegistry = "https://packages.idme.co/artifactory/api/npm/npm/";
    const tarballUrl =
      "https://old-packages.idme.co/artifactory/api/npm/npm/@anthropic-ai/sdk/-/sdk-0.52.0.tgz";

    expect(convertTarball(currentRegistry, tarballUrl)).to.equal(
      "https://packages.idme.co/artifactory/api/npm/npm/@anthropic-ai/sdk/-/sdk-0.52.0.tgz"
    );
  });

  it("should rebuild the tarball URL when the registry base path changes", () => {
    const currentRegistry = "https://packages.idme.co/artifactory/api/npm/npm/";
    const tarballUrl =
      "https://packages.idme.co/repository/npm-private/@anthropic-ai/sdk/-/sdk-0.52.0.tgz";

    expect(convertTarball(currentRegistry, tarballUrl)).to.equal(
      "https://packages.idme.co/artifactory/api/npm/npm/@anthropic-ai/sdk/-/sdk-0.52.0.tgz"
    );
  });

  describe("corrupt lock detection", function() {
    const makeLocker = lockData => {
      const locker = new PkgDepLocker(false, true, {
        _pkgSrcMgr: { getRegistryUrl: () => "https://registry.npmjs.org/" }
      });
      locker._lockData = lockData;
      return locker;
    };

    // a self-contained, consistent lock: react@10.49.0 -> core@10.49.0, and core@10.49.0 exists
    const consistentLock = () => ({
      "@sentry/react": {
        _: { "^10.44.0": "10.49.0" },
        "10.49.0": { $: 0, _: "react.tgz", dependencies: { "@sentry/core": "10.49.0" } }
      },
      "@sentry/core": {
        _: { "10.49.0": "10.49.0" },
        "10.49.0": { $: 0, _: "core.tgz" }
      }
    });

    it("convert() accepts a self-consistent lock entry", () => {
      const locked = makeLocker(consistentLock()).convert({ name: "@sentry/react" });
      expect(locked).to.be.an("object");
      expect(locked.versions).to.have.property("10.49.0");
    });

    it("convert() rejects an entry whose dep pin is unsatisfiable within the lock", () => {
      // the rebase/merge corruption signature: react@10.49.0's deps point at core@10.55.0,
      // but the lock only has core@10.49.0 -> trusting it produces a broken install
      const lock = consistentLock();
      lock["@sentry/react"]["10.49.0"].dependencies["@sentry/core"] = "10.55.0";
      expect(makeLocker(lock).convert({ name: "@sentry/react" })).to.equal(false);
    });

    it("convert() rejects an entry with a non-semver version key", () => {
      const lock = {
        "@sentry/react": {
          _: { "^10.44.0": "[object Promise]" },
          "[object Promise]": { $: 0, _: "react.tgz" }
        }
      };
      expect(makeLocker(lock).convert({ name: "@sentry/react" })).to.equal(false);
    });

    it("convert() expands the serialized form instead of handing it back", () => {
      // What convert() returns is used as a package meta - the resolver reads it like one
      // and `update()` merges registry versions straight into it - so the serialized-only
      // fields must not survive the trip, and the `1` flags must come back as booleans
      // (FJM-158).
      const lock = consistentLock();
      lock["@sentry/react"]["10.49.0"]._hasShrinkwrap = 1;
      lock["@sentry/react"]["10.49.0"].top = 1;

      const vpkg = makeLocker(lock).convert({ name: "@sentry/react" }).versions["10.49.0"];

      expect(vpkg).to.not.have.property("$");
      expect(vpkg).to.not.have.property("_");
      expect(vpkg).to.not.have.property("top");
      expect(vpkg._hasShrinkwrap).to.equal(true);
      expect(vpkg.dist).to.deep.equal({ integrity: undefined, tarball: "react.tgz" });
      expect(vpkg.fromLocked).to.equal(true);
      expect(vpkg.name).to.equal("@sentry/react");
      expect(vpkg.version).to.equal("10.49.0");
      // the entry carried over from the lock, untouched
      expect(vpkg.dependencies).to.deep.equal({ "@sentry/core": "10.49.0" });
    });

    it("convert() leaves _hasShrinkwrap false when the lock does not set it", () => {
      const vpkg = makeLocker(consistentLock()).convert({ name: "@sentry/react" }).versions[
        "10.49.0"
      ];

      expect(vpkg._hasShrinkwrap).to.equal(false);
    });

    it("read() ignores a lockfile with git conflict markers", async () => {
      const file = Path.join(Os.tmpdir(), `fyn-lock-conflict-${Date.now()}.yaml`);
      Fs.writeFileSync(
        file,
        ["'@sentry/react':", "<<<<<<< HEAD", "  _latest: 10.49.0", "=======", "  _latest: 10.55.0", ">>>>>>> branch", ""].join(
          "\n"
        )
      );
      const locker = new PkgDepLocker(false, true, { _shownMissingFiles: new Set() });
      const ok = await locker.read(file);
      Fs.unlinkSync(file);
      expect(ok).to.equal(false);
      expect(locker._lockData).to.deep.equal({});
    });
  });

  // FPM-92: what a failed optional records in the lock. A platform (os/cpu) failure is this
  // machine's verdict, re-derivable by any reader from the os/cpu on the same entry, and
  // honoring another machine's copy of it skipped packages that were perfectly usable
  // (FPM-67). A failed check or install has no such fallback, so it is still recorded.
  describe("failed optional dependencies", function() {
    const genLock = (optFailed, json?) => {
      const locker = new PkgDepLocker(false, true, {
        _pkgSrcMgr: { getRegistryUrl: () => "https://registry.npmjs.org/" }
      });

      const vpkg = {
        name: "mod-bad-os",
        version: "1.0.0",
        dsrc: "opt",
        preInstalled: true,
        // what pkg-dep-resolver leaves behind for a package it skipped on os/cpu: the os/cpu
        // that explain the skip, plus whatever its meta said about its deps (FPM-94)
        json: json || { os: ["linux"], cpu: ["x64"] },
        dist: {
          integrity: "sha512-test",
          tarball: "https://registry.npmjs.org/mod-bad-os/-/mod-bad-os-1.0.0.tgz"
        },
        optFailed
      };

      const pkgsData = {
        "mod-bad-os": {
          versions: { "1.0.0": vpkg },
          [RSEMVERS]: { "^1.0.0": "1.0.0" }
        }
      };

      locker.generate({
        getPkgsData: (failed?: boolean) => (failed ? pkgsData : {})
      });

      return locker._lockData["mod-bad-os"]["1.0.0"];
    };

    it("should not record a platform failure, which any reader re-derives from os/cpu", () => {
      const meta = genLock(OPT_FAILED_PLATFORM);
      expect(meta).to.not.have.property("optFailed");
      // the entry still has to carry everything that lets another platform resolve it from
      // the lock alone, without a registry packument fetch
      expect(meta.os).to.deep.equal(["linux"]);
      expect(meta.cpu).to.deep.equal(["x64"]);
      expect(meta.$).to.equal("sha512-test");
      expect(meta._).to.equal("https://registry.npmjs.org/mod-bad-os/-/mod-bad-os-1.0.0.tgz");
    });

    // FPM-94: the entry a machine writes for a package it skips has to match the one a machine
    // that installs it writes, or the lock churns with whoever ran the install. The deps come
    // from the meta the resolver used, so a package with none records none - not "unknown".
    it("should not claim a platform failure has no package.json recorded", () => {
      expect(genLock(OPT_FAILED_PLATFORM)).to.not.have.property("_missingJson");
      expect(genLock(OPT_FAILED_PLATFORM)).to.not.have.property("dependencies");
    });

    it("should record the dependencies a platform failure's meta carried", () => {
      const meta = genLock(OPT_FAILED_PLATFORM, {
        os: ["linux"],
        cpu: ["x64"],
        dependencies: { "mod-a": "^1.0.0" },
        peerDependencies: { "mod-b": "^2.0.0" }
      });
      expect(meta.dependencies).to.deep.equal({ "mod-a": "^1.0.0" });
      expect(meta.peerDependencies).to.deep.equal({ "mod-b": "^2.0.0" });
      expect(meta).to.not.have.property("_missingJson");
    });

    // an entry read from a lock written before FPM-94 recorded nothing about its deps. That is
    // not the same as having none, so the admission is carried through rather than laundered
    // into a false claim.
    it("should carry _missingJson through from a meta that had it", () => {
      const meta = genLock(OPT_FAILED_PLATFORM, {
        os: ["linux"],
        cpu: ["x64"],
        _missingJson: true
      });
      expect(meta._missingJson).to.equal(true);
      expect(meta).to.not.have.property("dependencies");
    });

    it("should record a failed optional check (1)", () => {
      expect(genLock(1).optFailed).to.equal(1);
    });

    it("should record a failed install (2)", () => {
      expect(genLock(2).optFailed).to.equal(2);
    });
  });
});
