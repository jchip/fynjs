//
// A lockfile's `optFailed` is written by whichever machine generated the lock, so it is only
// portable as far as the failure it recorded was (FPM-67).
//
// Regenerating a lock on darwin-arm64 wrote `optFailed: 3` (platform mismatch) for every
// non-local platform, including `@esbuild/linux-x64` with `os: [linux] cpu: [x64]`. fyn honored
// that flag on linux CI, skipped the binary, and esbuild's install.js postinstall exited 1 -
// failing bootstrap on every node version until the lock commit was reverted (FJM-133).
//
// checkPkgOsCpu asks about the CURRENT process.platform/process.arch, so these drive the real
// decision against the running machine rather than pinning darwin or linux.
//

import { describe, it } from "vitest";
import { expect } from "chai";
import { evalLockedOptFailure, OPT_FAILED_PLATFORM } from "../../lib/pkg-opt-resolver";

/** os/cpu that always satisfy the running machine */
const thisPlatform = { os: [process.platform], cpu: [process.arch] };

/** os/cpu that never satisfy the running machine */
const otherPlatform = { os: ["!" + process.platform], cpu: ["!" + process.arch] };

describe("pkg-opt-resolver locked optFailed evaluation", function () {
  describe("optFailed = platform (3)", () => {
    //
    // the regression: recorded on a different machine, but usable here
    //
    it("re-checks when the package's os/cpu match this platform", () => {
      expect(evalLockedOptFailure(OPT_FAILED_PLATFORM, thisPlatform)).to.equal("recheck");
    });

    it("still skips, quietly, when os/cpu do not match this platform", () => {
      expect(evalLockedOptFailure(OPT_FAILED_PLATFORM, otherPlatform)).to.equal(
        "platform-mismatch"
      );
    });

    //
    // an entry with no os/cpu recorded cannot be re-decided from the lock. It is not a platform
    // mismatch here, so the flag is treated as a platform record from elsewhere and re-checked
    // rather than silently dropping a package this machine may well be able to use.
    //
    it("re-checks when no os/cpu were recorded at all", () => {
      expect(evalLockedOptFailure(OPT_FAILED_PLATFORM, {})).to.equal("recheck");
    });
  });

  describe("non-platform failures stay honored", () => {
    it("honors optFailed = 1 (opt check failed) even where the platform matches", () => {
      expect(evalLockedOptFailure(1, thisPlatform)).to.equal("honor");
    });

    it("honors optFailed = 2 (install failed) even where the platform matches", () => {
      expect(evalLockedOptFailure(2, thisPlatform)).to.equal("honor");
    });

    //
    // an incompatible platform outranks the reason: skip quietly, no warning worth showing
    //
    it("reports a platform mismatch ahead of a non-platform failure code", () => {
      expect(evalLockedOptFailure(1, otherPlatform)).to.equal("platform-mismatch");
      expect(evalLockedOptFailure(2, otherPlatform)).to.equal("platform-mismatch");
    });
  });

  describe("partial os/cpu records", () => {
    it("treats a matching os with no cpu constraint as usable here", () => {
      expect(evalLockedOptFailure(OPT_FAILED_PLATFORM, { os: [process.platform] })).to.equal(
        "recheck"
      );
    });

    it("treats a mismatched cpu as unusable even when os matches", () => {
      expect(
        evalLockedOptFailure(OPT_FAILED_PLATFORM, {
          os: [process.platform],
          cpu: ["!" + process.arch]
        })
      ).to.equal("platform-mismatch");
    });
  });

  it("has no undefined metaJson crash", () => {
    expect(evalLockedOptFailure(OPT_FAILED_PLATFORM, undefined)).to.equal("recheck");
    expect(evalLockedOptFailure(1, undefined)).to.equal("honor");
  });
});
