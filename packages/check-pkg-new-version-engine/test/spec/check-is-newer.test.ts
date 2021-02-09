/* eslint-disable no-magic-numbers */

import { internalCheckIsNewer } from "../../src/check-is-newer";
test("internalCheckIsNewer", () => {
  const runCheck = (v1: string, v2: string, shouldBe: boolean) => {
    const e1 = internalCheckIsNewer({ name: "test", version: v1 }, { latest: v2 }, "latest");
    expect(e1).toBe(shouldBe);
  };

  [
    ["1.0.0", "1.1.0", true],
    ["1.0.0", "1.0.0", false],
    ["1.1.0", "1.0.0", false],
  ].forEach((d: any[]) => {
    runCheck(d[0], d[1], d[2]);
  });
});
