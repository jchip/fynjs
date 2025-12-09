/**
 * Unit tests for audit-report.ts
 *
 * Tests bulk payload building and vulnerability matching.
 * Network calls are not tested here (integration tests would cover that).
 */

const { describe, it } = require("mocha");
const { expect } = require("chai");

const AuditReport = require("../../../lib/audit/audit-report");

describe("audit-report", () => {
  // Mock Fyn instance
  const createMockFyn = (options = {}) => ({
    fynDir: "/tmp/test-fyn",
    _options: {
      registry: "https://registry.npmjs.org",
      ...options
    }
  });

  // Mock DepData
  const createMockDepData = (pkgs = {}) => ({
    pkgs
  });

  describe("buildBulkPayload()", () => {
    it("should build payload from resolved packages", () => {
      const depData = createMockDepData({
        lodash: {
          "4.17.21": { name: "lodash", version: "4.17.21", src: "dep" },
          "4.17.15": { name: "lodash", version: "4.17.15", src: "dep" }
        },
        express: {
          "4.18.0": { name: "express", version: "4.18.0", src: "dep" }
        }
      });

      const report = new AuditReport({
        fyn: createMockFyn(),
        depData
      });

      const payload = report.buildBulkPayload();

      expect(payload).to.have.property("lodash");
      expect(payload).to.have.property("express");
      expect(payload.lodash).to.have.members(["4.17.21", "4.17.15"]);
      expect(payload.express).to.have.members(["4.18.0"]);
    });

    it("should skip local packages", () => {
      const depData = createMockDepData({
        lodash: {
          "4.17.21": { name: "lodash", version: "4.17.21", src: "dep" }
        },
        "my-local-pkg": {
          "1.0.0": { name: "my-local-pkg", version: "1.0.0", src: "dep", local: true }
        }
      });

      const report = new AuditReport({
        fyn: createMockFyn(),
        depData
      });

      const payload = report.buildBulkPayload();

      expect(payload).to.have.property("lodash");
      expect(payload).to.not.have.property("my-local-pkg");
    });

    it("should omit dev dependencies when specified", () => {
      const depData = createMockDepData({
        lodash: {
          "4.17.21": { name: "lodash", version: "4.17.21", src: "dep" }
        },
        mocha: {
          "10.0.0": { name: "mocha", version: "10.0.0", src: "dev" }
        }
      });

      const report = new AuditReport({
        fyn: createMockFyn(),
        depData,
        omit: ["dev"]
      });

      const payload = report.buildBulkPayload();

      expect(payload).to.have.property("lodash");
      expect(payload).to.not.have.property("mocha");
    });

    it("should omit optional dependencies when specified", () => {
      const depData = createMockDepData({
        lodash: {
          "4.17.21": { name: "lodash", version: "4.17.21", src: "dep" }
        },
        "optional-pkg": {
          "1.0.0": { name: "optional-pkg", version: "1.0.0", src: "opt" }
        }
      });

      const report = new AuditReport({
        fyn: createMockFyn(),
        depData,
        omit: ["optional"]
      });

      const payload = report.buildBulkPayload();

      expect(payload).to.have.property("lodash");
      expect(payload).to.not.have.property("optional-pkg");
    });

    it("should handle empty packages", () => {
      const report = new AuditReport({
        fyn: createMockFyn(),
        depData: createMockDepData({})
      });

      const payload = report.buildBulkPayload();

      expect(payload).to.deep.equal({});
    });

    it("should not include duplicate versions", () => {
      const depData = createMockDepData({
        lodash: {
          "4.17.21": { name: "lodash", version: "4.17.21", src: "dep" }
        }
      });

      const report = new AuditReport({
        fyn: createMockFyn(),
        depData
      });

      const payload = report.buildBulkPayload();

      expect(payload.lodash).to.have.lengthOf(1);
    });
  });

  describe("getAuditRegistryUrl()", () => {
    it("should return registry URL with trailing slash", () => {
      const report = new AuditReport({
        fyn: createMockFyn({ registry: "https://registry.npmjs.org" }),
        depData: createMockDepData({})
      });

      const url = report.getAuditRegistryUrl();

      expect(url).to.equal("https://registry.npmjs.org/");
    });

    it("should not double slash if already present", () => {
      const report = new AuditReport({
        fyn: createMockFyn({ registry: "https://registry.npmjs.org/" }),
        depData: createMockDepData({})
      });

      const url = report.getAuditRegistryUrl();

      expect(url).to.equal("https://registry.npmjs.org/");
    });

    it("should default to npmjs.org when no registry specified", () => {
      const report = new AuditReport({
        fyn: createMockFyn({ registry: undefined }),
        depData: createMockDepData({})
      });

      const url = report.getAuditRegistryUrl();

      expect(url).to.equal("https://registry.npmjs.org/");
    });
  });

  describe("matchVulnerabilities()", () => {
    // Note: Bulk API returns advisories grouped by package name:
    // { "package-name": [{ id, vulnerable_versions, ... }, ...] }

    it("should match advisories to installed packages", () => {
      const depData = createMockDepData({
        lodash: {
          "4.17.15": { name: "lodash", version: "4.17.15", src: "dep", requests: [] }
        }
      });

      const auditResult = {
        advisories: {
          lodash: [
            {
              id: 1234,
              severity: "high",
              vulnerable_versions: "<4.17.21",
              title: "Prototype Pollution"
            }
          ]
        }
      };

      const report = new AuditReport({
        fyn: createMockFyn(),
        depData
      });

      const vulns = report.matchVulnerabilities(auditResult);

      expect(vulns).to.have.lengthOf(1);
      expect(vulns[0].name).to.equal("lodash");
      expect(vulns[0].version).to.equal("4.17.15");
      expect(vulns[0].advisory.severity).to.equal("high");
    });

    it("should not match packages outside vulnerable range", () => {
      const depData = createMockDepData({
        lodash: {
          "4.17.21": { name: "lodash", version: "4.17.21", src: "dep", requests: [] }
        }
      });

      const auditResult = {
        advisories: {
          lodash: [
            {
              id: 1234,
              severity: "high",
              vulnerable_versions: "<4.17.21"
            }
          ]
        }
      };

      const report = new AuditReport({
        fyn: createMockFyn(),
        depData
      });

      const vulns = report.matchVulnerabilities(auditResult);

      expect(vulns).to.have.lengthOf(0);
    });

    it("should match multiple versions of same package", () => {
      const depData = createMockDepData({
        lodash: {
          "4.17.15": { name: "lodash", version: "4.17.15", src: "dep", requests: [] },
          "4.17.10": { name: "lodash", version: "4.17.10", src: "dep", requests: [] }
        }
      });

      const auditResult = {
        advisories: {
          lodash: [
            {
              id: 1234,
              severity: "high",
              vulnerable_versions: "<4.17.21"
            }
          ]
        }
      };

      const report = new AuditReport({
        fyn: createMockFyn(),
        depData
      });

      const vulns = report.matchVulnerabilities(auditResult);

      expect(vulns).to.have.lengthOf(2);
    });

    it("should handle packages not in advisory list", () => {
      const depData = createMockDepData({
        express: {
          "4.18.0": { name: "express", version: "4.18.0", src: "dep", requests: [] }
        }
      });

      const auditResult = {
        advisories: {
          lodash: [
            {
              id: 1234,
              severity: "high",
              vulnerable_versions: "<4.17.21"
            }
          ]
        }
      };

      const report = new AuditReport({
        fyn: createMockFyn(),
        depData
      });

      const vulns = report.matchVulnerabilities(auditResult);

      expect(vulns).to.have.lengthOf(0);
    });

    it("should handle multiple advisories per package", () => {
      const depData = createMockDepData({
        lodash: {
          "4.17.15": { name: "lodash", version: "4.17.15", src: "dep", requests: [] }
        }
      });

      const auditResult = {
        advisories: {
          lodash: [
            { id: 1234, severity: "high", vulnerable_versions: "<4.17.21" },
            { id: 5678, severity: "moderate", vulnerable_versions: "<4.17.20" }
          ]
        }
      };

      const report = new AuditReport({
        fyn: createMockFyn(),
        depData
      });

      const vulns = report.matchVulnerabilities(auditResult);

      // Should match both advisories for the same version
      expect(vulns).to.have.lengthOf(2);
    });

    it("should handle empty advisories", () => {
      const depData = createMockDepData({
        lodash: {
          "4.17.15": { name: "lodash", version: "4.17.15", src: "dep" }
        }
      });

      const report = new AuditReport({
        fyn: createMockFyn(),
        depData
      });

      const vulns = report.matchVulnerabilities({ advisories: {} });

      expect(vulns).to.have.lengthOf(0);
    });
  });
});
