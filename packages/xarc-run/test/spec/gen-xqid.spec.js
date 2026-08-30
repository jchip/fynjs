import genXqId from "../../lib/gen-xqid.js";
import { expect as expect } from "chai";

describe("gen-xqid", function() {
  it("should gen ID with tag", () => {
    const a = genXqId("test");
    const b = genXqId("test");
    expect(a).to.match(/^test/);
    expect(a).to.not.equal(b);
  });

  it("should gen ID w/o tag", () => {
    const a = genXqId();
    const b = genXqId();
    expect(a).to.not.equal(b);
  });
});
