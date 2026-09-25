import { describe, it, expect } from "vitest";
import DepData from "../../lib/dep-data";

describe("dep-data", function() {
  it("keeps package identities in resolution order", () => {
    const data = new DepData();
    const first = { name: "foo", version: "1.0.0" };
    const second = { name: "foo", version: "2.0.0" };
    data.addResolved(first);
    data.addResolved(second);
    expect(data.resolvedPackages).toStrictEqual([first, second]);
    expect(data.resolvedPackages[0]).toBe(first);
  });

  describe("getPkgById", function() {
    // KnownPackage shape: versions live under the `versions` map
    const data = new DepData({
      pkgs: {
        foo: { versions: { "1.0.0": { name: "foo", version: "1.0.0" } } },
        "@babel/core": {
          versions: { "7.20.0": { name: "@babel/core", version: "7.20.0" } }
        }
      } as any
    });

    it("resolves an unscoped name@version", () => {
      expect(data.getPkgById("foo@1.0.0")).toBe(data.pkgs.foo.versions["1.0.0"]);
    });

    it("resolves a scoped @scope/name@version (last '@' is the separator)", () => {
      expect(data.getPkgById("@babel/core@7.20.0")).toBe(
        data.pkgs["@babel/core"].versions["7.20.0"]
      );
    });

    it("returns the whole version bucket when no version is given", () => {
      expect(data.getPkgById("foo")).toBe(data.pkgs.foo);
      expect(data.getPkgById("@babel/core")).toBe(data.pkgs["@babel/core"]);
    });
  });
});
