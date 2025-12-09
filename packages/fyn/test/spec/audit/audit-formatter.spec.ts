/**
 * Unit tests for audit-formatter.ts
 *
 * Tests formatting of audit results for display.
 */

const { describe, it } = require("mocha");
const { expect } = require("chai");

const AuditFormatter = require("../../../lib/audit/audit-formatter");

describe("audit-formatter", () => {
  const mockAuditResult = {
    advisories: {
      "1234": {
        id: 1234,
        module_name: "lodash",
        severity: "high",
        title: "Prototype Pollution",
        vulnerable_versions: "<4.17.21",
        patched_versions: ">=4.17.21",
        url: "https://npmjs.com/advisories/1234"
      }
    },
    metadata: { totalDependencies: 50, vulnerabilities: 1 }
  };

  const mockVulnerabilities = [
    {
      name: "lodash",
      version: "4.17.15",
      advisory: {
        id: 1234,
        title: "Prototype Pollution",
        severity: "high",
        url: "https://npmjs.com/advisories/1234",
        vulnerable_versions: "<4.17.21",
        patched_versions: ">=4.17.21"
      },
      paths: []
    }
  ];

  describe("getSeverityLevel()", () => {
    it("should return correct severity levels", () => {
      const formatter = new AuditFormatter();

      expect(formatter.getSeverityLevel("critical")).to.equal(5);
      expect(formatter.getSeverityLevel("high")).to.equal(4);
      expect(formatter.getSeverityLevel("moderate")).to.equal(3);
      expect(formatter.getSeverityLevel("low")).to.equal(2);
      expect(formatter.getSeverityLevel("info")).to.equal(1);
      expect(formatter.getSeverityLevel("unknown")).to.equal(0);
    });
  });

  describe("meetsAuditLevel()", () => {
    it("should filter by audit level", () => {
      const formatter = new AuditFormatter({ auditLevel: "high" });

      expect(formatter.meetsAuditLevel("critical")).to.be.true;
      expect(formatter.meetsAuditLevel("high")).to.be.true;
      expect(formatter.meetsAuditLevel("moderate")).to.be.false;
      expect(formatter.meetsAuditLevel("low")).to.be.false;
    });

    it("should include all severities for info level", () => {
      const formatter = new AuditFormatter({ auditLevel: "info" });

      expect(formatter.meetsAuditLevel("critical")).to.be.true;
      expect(formatter.meetsAuditLevel("info")).to.be.true;
    });
  });

  describe("format() - JSON output", () => {
    it("should output valid JSON", () => {
      const formatter = new AuditFormatter({ json: true });
      const { output, exitCode } = formatter.format(mockAuditResult, mockVulnerabilities);

      expect(exitCode).to.equal(0);
      expect(() => JSON.parse(output)).to.not.throw();

      const parsed = JSON.parse(output);
      expect(parsed.vulnerabilities).to.have.lengthOf(1);
      expect(parsed.metadata).to.deep.equal(mockAuditResult.metadata);
    });

    it("should filter vulnerabilities by audit level in JSON", () => {
      const formatter = new AuditFormatter({ json: true, auditLevel: "critical" });
      const { output } = formatter.format(mockAuditResult, mockVulnerabilities);

      const parsed = JSON.parse(output);
      // High severity should be filtered out when auditLevel is critical
      expect(parsed.vulnerabilities).to.have.lengthOf(0);
    });
  });

  describe("format() - Human-readable output", () => {
    it("should include vulnerability count", () => {
      const formatter = new AuditFormatter({ colors: false });
      const { output, exitCode } = formatter.format(mockAuditResult, mockVulnerabilities);

      expect(exitCode).to.equal(0);
      expect(output).to.include("1 vulnerabilities");
      expect(output).to.include("1 high");
    });

    it("should show no vulnerabilities message when clean", () => {
      const formatter = new AuditFormatter({ colors: false });
      const cleanResult = { advisories: {}, metadata: { totalDependencies: 10 } };
      const { output } = formatter.format(cleanResult, []);

      expect(output).to.include("No vulnerabilities found");
    });

    it("should include package details", () => {
      const formatter = new AuditFormatter({ colors: false });
      const { output } = formatter.format(mockAuditResult, mockVulnerabilities);

      expect(output).to.include("lodash");
      expect(output).to.include("4.17.15");
      expect(output).to.include("Prototype Pollution");
    });

    it("should include vulnerability info URL", () => {
      const formatter = new AuditFormatter({ colors: false });
      const { output } = formatter.format(mockAuditResult, mockVulnerabilities);

      expect(output).to.include("info: https://npmjs.com/advisories/1234");
    });

    it("should always exit 0 (report-only mode)", () => {
      const formatter = new AuditFormatter();
      const { exitCode } = formatter.format(mockAuditResult, mockVulnerabilities);

      expect(exitCode).to.equal(0);
    });
  });

  describe("formatVulnerability()", () => {
    it("should format vulnerability details", () => {
      const formatter = new AuditFormatter({ colors: false });
      const output = formatter.formatVulnerability(mockVulnerabilities[0]);

      expect(output).to.include("HIGH");
      expect(output).to.include("lodash@4.17.15");
      expect(output).to.include("Vulnerable: <4.17.21");
      expect(output).to.include("info:");
    });
  });
});
