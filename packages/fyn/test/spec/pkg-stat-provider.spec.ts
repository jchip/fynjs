/**
 * Unit tests for pkg-stat-provider.ts
 *
 * Tests the reusable stat data provider that can be invoked
 * multiple times within a single process.
 */

const { describe, it, beforeEach } = require("mocha");
const { expect } = require("chai");

const PkgStatProvider = require("../../lib/pkg-stat-provider");

describe("pkg-stat-provider", () => {
  // Mock Fyn instance with resolved data
  const createMockFyn = (pkgs = {}, res = {}, pkg = {}) => ({
    _data: { pkgs, res },
    _pkg: pkg,
    _options: {}
  });

  describe("findPkgsById()", () => {
    it("should find package by name", () => {
      const fyn = createMockFyn({
        lodash: {
          "4.17.21": { name: "lodash", version: "4.17.21", promoted: true },
          "4.17.15": { name: "lodash", version: "4.17.15", promoted: false }
        }
      });

      const provider = new PkgStatProvider({ fyn });
      const matches = provider.findPkgsById("lodash");

      expect(matches).to.have.lengthOf(2);
    });

    it("should find package by name@version", () => {
      const fyn = createMockFyn({
        lodash: {
          "4.17.21": { name: "lodash", version: "4.17.21", promoted: true },
          "4.17.15": { name: "lodash", version: "4.17.15", promoted: false }
        }
      });

      const provider = new PkgStatProvider({ fyn });
      const matches = provider.findPkgsById("lodash@4.17.21");

      expect(matches).to.have.lengthOf(1);
      expect(matches[0].version).to.equal("4.17.21");
    });

    it("should find package by name@semver range", () => {
      const fyn = createMockFyn({
        lodash: {
          "4.17.21": { name: "lodash", version: "4.17.21", promoted: true },
          "4.17.15": { name: "lodash", version: "4.17.15", promoted: false },
          "3.10.1": { name: "lodash", version: "3.10.1", promoted: false }
        }
      });

      const provider = new PkgStatProvider({ fyn });
      const matches = provider.findPkgsById("lodash@^4.0.0");

      expect(matches).to.have.lengthOf(2);
      expect(matches.every(m => m.version.startsWith("4."))).to.be.true;
    });

    it("should return empty array for non-existent package", () => {
      const fyn = createMockFyn({
        lodash: {
          "4.17.21": { name: "lodash", version: "4.17.21", promoted: true }
        }
      });

      const provider = new PkgStatProvider({ fyn });
      const matches = provider.findPkgsById("express");

      expect(matches).to.have.lengthOf(0);
    });

    it("should handle scoped packages", () => {
      const fyn = createMockFyn({
        "@types/node": {
          "18.0.0": { name: "@types/node", version: "18.0.0", promoted: true }
        }
      });

      const provider = new PkgStatProvider({ fyn });
      const matches = provider.findPkgsById("@types/node@18.0.0");

      expect(matches).to.have.lengthOf(1);
      expect(matches[0].name).to.equal("@types/node");
    });

    it("should return empty when no data", () => {
      const fyn = { _data: null, _options: {} };
      const provider = new PkgStatProvider({ fyn });
      const matches = provider.findPkgsById("lodash");

      expect(matches).to.have.lengthOf(0);
    });
  });

  describe("findMatchingVersions()", () => {
    it("should return matching versions result", () => {
      const fyn = createMockFyn({
        lodash: {
          "4.17.21": { name: "lodash", version: "4.17.21", promoted: true },
          "4.17.15": { name: "lodash", version: "4.17.15", promoted: false }
        }
      });

      const provider = new PkgStatProvider({ fyn });
      const result = provider.findMatchingVersions("lodash");

      expect(result.searchId).to.equal("lodash");
      expect(result.versions).to.have.lengthOf(2);
      expect(result.versions[0]).to.have.property("name", "lodash");
      expect(result.versions[0]).to.have.property("version");
      expect(result.versions[0]).to.have.property("promoted");
    });

    it("should sort versions (newest first)", () => {
      const fyn = createMockFyn({
        lodash: {
          "4.17.21": { name: "lodash", version: "4.17.21", promoted: true },
          "4.17.15": { name: "lodash", version: "4.17.15", promoted: false },
          "4.17.10": { name: "lodash", version: "4.17.10", promoted: false }
        }
      });

      const provider = new PkgStatProvider({ fyn });
      const result = provider.findMatchingVersions("lodash");

      // Should be sorted by semver descending (newest first)
      expect(result.versions.map(v => v.version)).to.deep.equal([
        "4.17.21",
        "4.17.15",
        "4.17.10"
      ]);
    });
  });

  describe("findDependents()", () => {
    it("should find packages that depend on the given package", () => {
      const fyn = createMockFyn(
        {
          lodash: {
            "4.17.21": { name: "lodash", version: "4.17.21", promoted: true, res: {} }
          },
          express: {
            "4.18.0": {
              name: "express",
              version: "4.18.0",
              promoted: true,
              res: {
                dep: {
                  lodash: { semver: "^4.17.0", resolved: "4.17.21" }
                }
              }
            }
          }
        },
        {} // res
      );

      const provider = new PkgStatProvider({ fyn });
      const dependents = provider.findDependents({ name: "lodash", version: "4.17.21" });

      expect(dependents).to.have.lengthOf(1);
      expect(dependents[0].name).to.equal("express");
    });

    it("should return empty array when no dependents", () => {
      const fyn = createMockFyn({
        lodash: {
          "4.17.21": { name: "lodash", version: "4.17.21", promoted: true, res: {} }
        }
      });

      const provider = new PkgStatProvider({ fyn });
      const dependents = provider.findDependents({ name: "lodash", version: "4.17.21" });

      expect(dependents).to.have.lengthOf(0);
    });

    it("should check multiple dependency types", () => {
      const fyn = createMockFyn(
        {
          lodash: {
            "4.17.21": { name: "lodash", version: "4.17.21", promoted: true, res: {} }
          },
          "pkg-a": {
            "1.0.0": {
              name: "pkg-a",
              version: "1.0.0",
              res: { dep: { lodash: { semver: "^4.0.0", resolved: "4.17.21" } } }
            }
          },
          "pkg-b": {
            "1.0.0": {
              name: "pkg-b",
              version: "1.0.0",
              res: { opt: { lodash: { semver: "^4.0.0", resolved: "4.17.21" } } }
            }
          },
          "pkg-c": {
            "1.0.0": {
              name: "pkg-c",
              version: "1.0.0",
              res: { per: { lodash: { semver: "^4.0.0", resolved: "4.17.21" } } }
            }
          }
        },
        {}
      );

      const provider = new PkgStatProvider({ fyn });
      const dependents = provider.findDependents({ name: "lodash", version: "4.17.21" });

      expect(dependents).to.have.lengthOf(3);
    });
  });

  describe("getPackageStat()", () => {
    it("should return null for non-existent package", async () => {
      const fyn = createMockFyn({});
      const provider = new PkgStatProvider({ fyn });

      const stat = await provider.getPackageStat("lodash", "4.17.21");

      expect(stat).to.be.null;
    });

    it("should return stat result with dependents", async () => {
      const fyn = createMockFyn(
        {
          lodash: {
            "4.17.21": { name: "lodash", version: "4.17.21", promoted: true, res: {} }
          },
          express: {
            "4.18.0": {
              name: "express",
              version: "4.18.0",
              promoted: true,
              res: {
                dep: {
                  lodash: { semver: "^4.17.0", resolved: "4.17.21" }
                }
              }
            }
          }
        },
        {}
      );

      const provider = new PkgStatProvider({ fyn });
      const stat = await provider.getPackageStat("lodash", "4.17.21");

      expect(stat).to.not.be.null;
      expect(stat.name).to.equal("lodash");
      expect(stat.version).to.equal("4.17.21");
      expect(stat.promoted).to.be.true;
      expect(stat.dependents).to.have.lengthOf(1);
      expect(stat.dependents[0].name).to.equal("express");
    });

    it("should include allPaths and significantPaths", async () => {
      const fyn = createMockFyn({
        lodash: {
          "4.17.21": { name: "lodash", version: "4.17.21", promoted: true, res: {} }
        }
      });

      const provider = new PkgStatProvider({ fyn });
      const stat = await provider.getPackageStat("lodash", "4.17.21");

      expect(stat).to.have.property("allPaths").that.is.an("array");
      expect(stat).to.have.property("significantPaths").that.is.an("array");
    });
  });

  describe("getPackageStats()", () => {
    it("should get stats for all versions of a package", async () => {
      const fyn = createMockFyn({
        lodash: {
          "4.17.21": { name: "lodash", version: "4.17.21", promoted: true, res: {} },
          "4.17.15": { name: "lodash", version: "4.17.15", promoted: false, res: {} }
        }
      });

      const provider = new PkgStatProvider({ fyn });
      const stats = await provider.getPackageStats("lodash");

      expect(stats).to.have.lengthOf(2);
    });

    it("should get stats for specific version", async () => {
      const fyn = createMockFyn({
        lodash: {
          "4.17.21": { name: "lodash", version: "4.17.21", promoted: true, res: {} },
          "4.17.15": { name: "lodash", version: "4.17.15", promoted: false, res: {} }
        }
      });

      const provider = new PkgStatProvider({ fyn });
      const stats = await provider.getPackageStats("lodash", "4.17.21");

      expect(stats).to.have.lengthOf(1);
      expect(stats[0].version).to.equal("4.17.21");
    });
  });

  describe("formatPaths()", () => {
    it("should format paths as strings", () => {
      const fyn = createMockFyn({});
      const provider = new PkgStatProvider({ fyn });

      const paths = [["a@1.0.0", "b@2.0.0", "c@3.0.0"]];
      const formatted = provider.formatPaths(paths);

      expect(formatted).to.have.lengthOf(1);
      expect(formatted[0]).to.equal("a@1.0.0 > b@2.0.0 > c@3.0.0");
    });

    it("should handle empty paths", () => {
      const fyn = createMockFyn({});
      const provider = new PkgStatProvider({ fyn });

      const formatted = provider.formatPaths([]);

      expect(formatted).to.have.lengthOf(0);
    });
  });

  describe("reset()", () => {
    it("should clear internal caches", () => {
      const fyn = createMockFyn({
        lodash: {
          "4.17.21": { name: "lodash", version: "4.17.21", promoted: true, res: {} }
        }
      });

      const provider = new PkgStatProvider({ fyn });

      // Access to populate cache
      provider.findDependents({ name: "lodash", version: "4.17.21" });

      // Reset should clear without error
      provider.reset();

      // Should work again after reset
      const dependents = provider.findDependents({ name: "lodash", version: "4.17.21" });
      expect(dependents).to.be.an("array");
    });
  });

  describe("multiple invocations", () => {
    it("should be reusable for multiple package lookups", async () => {
      const fyn = createMockFyn({
        lodash: {
          "4.17.21": { name: "lodash", version: "4.17.21", promoted: true, res: {} }
        },
        express: {
          "4.18.0": { name: "express", version: "4.18.0", promoted: true, res: {} }
        }
      });

      const provider = new PkgStatProvider({ fyn });

      // Multiple lookups should work
      const stat1 = await provider.getPackageStat("lodash", "4.17.21");
      const stat2 = await provider.getPackageStat("express", "4.18.0");

      expect(stat1).to.not.be.null;
      expect(stat2).to.not.be.null;
      expect(stat1.name).to.equal("lodash");
      expect(stat2.name).to.equal("express");
    });
  });
});
