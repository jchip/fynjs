/* eslint-disable no-magic-numbers */

import { describe, it, expect } from "vitest";
import { internalCheckIsNewer } from "../../src/check-is-newer.ts";
import { CheckResult } from "../../src/types.ts";

describe("internalCheckIsNewer", () => {
  it("should check if version is newer", () => {
    const runCheck = (v1: string, v2: string, shouldBe: CheckResult) => {
      const e1 = internalCheckIsNewer({ name: "test", version: v1 }, { latest: v2 }, "latest");
      expect(e1.isNewer).toBe(shouldBe.isNewer);
      expect(e1.version).toBe(shouldBe.version);
    };

    [
      ["1.0.0", "1.1.0", { isNewer: true, version: "1.1.0" }],
      ["1.0.0", "1.0.0", { isNewer: false }],
      ["1.1.0", "1.0.0", { isNewer: false }],
    ].forEach((d: any[]) => {
      runCheck(d[0], d[1], d[2]);
    });
  });
});
