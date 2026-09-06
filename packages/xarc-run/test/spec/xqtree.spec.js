import XQTree from "../../lib/xqtree.js";
import { expect } from "vitest";

describe("xqtree", function() {
  it("should create an item and add it to parent", () => {
    const xqtree = new XQTree();
    const a = xqtree.create({ name: "a" });
    a.level = undefined;
    const b = xqtree.create({ name: "b" }, a);
    expect(b.level).toBe(0);
    expect(xqtree.parent(b)).toBe(a);
  });

  it("parentName should resolve parent name", () => {
    const xqtree = new XQTree();
    const a = xqtree.create({ name: "a" });
    a.level = undefined;
    const b = xqtree.create({ name: "b" }, a);
    expect(xqtree.parentName(b)).toBe("a");
  });

  it("should fail if creating an item w/o name", () => {
    const xqtree = new XQTree();
    expect(() => xqtree.create({})).toThrow(Error);
  });
});
