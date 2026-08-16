import { describe, it } from "vitest";
import { expect } from "chai";
import DepData from "../../lib/dep-data";

describe("dep-data", function() {
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
      expect(data.getPkgById("foo@1.0.0")).to.equal(data.pkgs.foo.versions["1.0.0"]);
    });

    it("resolves a scoped @scope/name@version (last '@' is the separator)", () => {
      expect(data.getPkgById("@babel/core@7.20.0")).to.equal(
        data.pkgs["@babel/core"].versions["7.20.0"]
      );
    });

    it("returns the whole version bucket when no version is given", () => {
      expect(data.getPkgById("foo")).to.equal(data.pkgs.foo);
      expect(data.getPkgById("@babel/core")).to.equal(data.pkgs["@babel/core"]);
    });
  });
});
