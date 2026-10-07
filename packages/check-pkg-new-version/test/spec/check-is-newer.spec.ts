import { describe, it, expect } from "vitest";
import { internalCheckIsNewer } from "../../src/check-is-newer.js";
import { verify } from "run-verify";

describe("internalCheckIsNewer", () => {
  it("should check if newer version exists", () => {
    const runCheck = (v1: string, v2: string, expectedIsNewer: boolean) => {
      const result = internalCheckIsNewer({ name: "test", version: v1 }, { latest: v2 }, "latest");
      expect(result.isNewer).toBe(expectedIsNewer);
      expect(result.version).toBe(v2);
    };

    // Test cases: [currentVersion, latestVersion, expectedIsNewer]
    runCheck("1.0.0", "1.1.0", true);
    runCheck("1.0.0", "1.0.0", false);
    runCheck("1.1.0", "1.0.0", false);
  });

  it("should return version from distTags", () => {
    const result = internalCheckIsNewer(
      { name: "test", version: "1.0.0" },
      { latest: "2.0.0", beta: "3.0.0-beta.1" },
      "beta"
    );
    expect(result.version).toBe("3.0.0-beta.1");
    expect(result.isNewer).toBe(true);
  });

  it("reports no newer version, without throwing, when the dist-tag is missing", () =>
    verify({ timeout: 1000 })
      .step(() => ({ name: "test", version: "1.0.0" }))
      .keep.step((pkg) =>
        expect(internalCheckIsNewer(pkg, { latest: "2.0.0" }, "next")).toEqual({ isNewer: false })
      )
      .step((pkg) => expect(internalCheckIsNewer(pkg, {}, "latest")).toEqual({ isNewer: false })));
});
