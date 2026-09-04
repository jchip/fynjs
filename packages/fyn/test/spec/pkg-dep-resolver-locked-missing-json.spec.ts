//
// `_missingJson` marks a lock entry whose package.json was never captured, so its dependencies
// are unknown rather than absent. An optional dep skipped on os/cpu is exactly that: fyn records
// it from its registry meta alone and never opens it, so the entry has no `dependencies` (FPM-93).
//
// Before, such an entry claimed no dependencies. A machine that could use the package resolved it
// straight from the lock and its deps never entered the tree. Marking it `_missingJson` fixes
// that, but the flag cannot be acted on unconditionally: a lock carries an entry for every
// platform variant precisely so the machines that cannot use them resolve them without a registry
// round trip (FPM-63), and fetching meta for all of them would give that back.
//
// checkPkgOsCpu asks about the CURRENT process.platform/process.arch, so these drive the real
// decision against the running machine rather than pinning darwin or linux.
//

import { describe, it } from "vitest";
import { expect } from "chai";
import { lockedMetaNeedsFetch } from "../../lib/pkg-dep-resolver";

/** os/cpu that always satisfy the running machine */
const thisPlatform = { os: [process.platform], cpu: [process.arch] };

/** os/cpu that never satisfy the running machine */
const otherPlatform = { os: ["!" + process.platform], cpu: ["!" + process.arch] };

describe("pkg-dep-resolver locked _missingJson evaluation", function () {
  describe("entry with no package.json recorded", () => {
    //
    // the fix: usable here, so its unknown deps have to be resolved for real
    //
    it("fetches when the package's os/cpu match this platform", () => {
      expect(lockedMetaNeedsFetch({ _missingJson: true, ...thisPlatform })).to.equal(true);
    });

    //
    // the constraint: this platform will never install it, so its deps do not matter and the
    // lock entry alone is enough - that is what keeps the platform variants free to resolve
    //
    it("does not fetch when os/cpu do not match this platform", () => {
      expect(lockedMetaNeedsFetch({ _missingJson: true, ...otherPlatform })).to.equal(false);
    });

    it("fetches when no os/cpu were recorded, since the package is usable anywhere", () => {
      expect(lockedMetaNeedsFetch({ _missingJson: true })).to.equal(true);
    });
  });

  describe("entry with a package.json recorded", () => {
    it("does not fetch, whatever the platform", () => {
      expect(lockedMetaNeedsFetch({ dependencies: { foo: "^1.0.0" }, ...thisPlatform })).to.equal(
        false
      );
      expect(lockedMetaNeedsFetch({ ...otherPlatform })).to.equal(false);
    });

    it("does not fetch for an entry that is simply absent", () => {
      expect(lockedMetaNeedsFetch(undefined)).to.equal(false);
    });
  });
});
