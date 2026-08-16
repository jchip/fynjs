import { describe, it } from "vitest";
import { expect } from "chai";
import os from "os";
import path from "path";
import logger from "../../../lib/logger";
import { checkPkgNeedInstall } from "../../../lib/util/check-pkg-need-install";

describe("check-pkg-need-install", function () {
  it("warns and rejects when a local dep can't be read", async () => {
    const origWarn = logger.warn;
    const warnings: string[] = [];
    (logger as any).warn = (...args: any[]) => warnings.push(args.join(" "));

    try {
      const missingDir = path.join(os.tmpdir(), `fyn-no-such-pkg-${Date.now()}`);
      let error;
      try {
        await checkPkgNeedInstall(missingDir, 1);
      } catch (err) {
        error = err;
      }

      expect(error).to.exist;
      expect(warnings.some(w => w.includes(missingDir))).to.equal(true);
    } finally {
      (logger as any).warn = origWarn;
    }
  });
});
