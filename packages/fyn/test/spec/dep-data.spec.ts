import { describe, it, expect } from "vitest";
import DepData from "../../lib/dep-data";
import type { PkgVersionInfo } from "../../lib/types";

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

  it("resets link counts on every version without discarding metadata", () => {
    const version = (value: string, linked?: number): PkgVersionInfo => ({
      name: "foo", version: value, src: "dep", dsrc: "dep", requests: [],
      priority: 1, linked
    });
    const first = version("1.0.0", 2);
    const second = version("2.0.0");
    const data = new DepData({ pkgs: { foo: { versions: { "1.0.0": first, "2.0.0": second } } } });
    data.cleanLinked();
    expect(first.linked).toBe(0);
    expect(second.linked).toBe(0);
    expect(data.pkgs.foo.versions["1.0.0"]).toBe(first);
    expect(first.requests).toStrictEqual([]);
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
