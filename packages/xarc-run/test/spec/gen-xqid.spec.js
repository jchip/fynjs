import genXqId from "../../lib/gen-xqid.js";
import { expect } from "vitest";

describe("gen-xqid", function() {
  it("should gen ID with tag", () => {
    const a = genXqId("test");
    const b = genXqId("test");
    expect(a).toMatch(/^test/);
    expect(a).not.toBe(b);
  });

  it("should gen ID w/o tag", () => {
    const a = genXqId();
    const b = genXqId();
    expect(a).not.toBe(b);
  });
});
