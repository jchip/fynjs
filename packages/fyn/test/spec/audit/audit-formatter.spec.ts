/**
 * Unit tests for audit-formatter.ts
 *
 * Tests formatting of audit results for display.
 */

import { describe, it, expect } from "vitest";
import { verify } from "run-verify";

import AuditFormatter from "../../../lib/audit/audit-formatter";

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

      expect(formatter.getSeverityLevel("critical")).toBe(5);
      expect(formatter.getSeverityLevel("high")).toBe(4);
      expect(formatter.getSeverityLevel("moderate")).toBe(3);
      expect(formatter.getSeverityLevel("low")).toBe(2);
      expect(formatter.getSeverityLevel("info")).toBe(1);
      expect(formatter.getSeverityLevel("unknown")).toBe(0);
    });
  });

  describe("meetsAuditLevel()", () => {
    it("should filter by audit level", () => {
      const formatter = new AuditFormatter({ auditLevel: "high" });

      expect(formatter.meetsAuditLevel("critical")).toBe(true);
      expect(formatter.meetsAuditLevel("high")).toBe(true);
      expect(formatter.meetsAuditLevel("moderate")).toBe(false);
      expect(formatter.meetsAuditLevel("low")).toBe(false);
    });

    it("should include all severities for info level", () => {
      const formatter = new AuditFormatter({ auditLevel: "info" });

      expect(formatter.meetsAuditLevel("critical")).toBe(true);
      expect(formatter.meetsAuditLevel("info")).toBe(true);
    });
  });

  describe("format() - JSON output", () => {
    it("should output valid JSON", () => {
      const formatter = new AuditFormatter({ json: true });
      const { output, exitCode } = formatter.format(mockAuditResult, mockVulnerabilities);

      expect(exitCode).toBe(1);
      expect(() => JSON.parse(output)).not.toThrow();

      const parsed = JSON.parse(output);
      expect(parsed.vulnerabilities).toHaveLength(1);
      expect(parsed.metadata).toStrictEqual(mockAuditResult.metadata);
    });

    it("should filter vulnerabilities by audit level in JSON", () => {
      const formatter = new AuditFormatter({ json: true, auditLevel: "critical" });
      const { output } = formatter.format(mockAuditResult, mockVulnerabilities);

      const parsed = JSON.parse(output);
      // High severity should be filtered out when auditLevel is critical
      expect(parsed.vulnerabilities).toHaveLength(0);
    });
  });

  describe("format() - Human-readable output", () => {
    it("should include vulnerability count", () => {
      const formatter = new AuditFormatter({ colors: false });
      const { output, exitCode } = formatter.format(mockAuditResult, mockVulnerabilities);

      expect(exitCode).toBe(1);
      expect(output).toContain("1 vulnerabilities");
      expect(output).toContain("1 high");
    });

    it("should show no vulnerabilities message when clean", () => {
      const formatter = new AuditFormatter({ colors: false });
      const cleanResult = { advisories: {}, metadata: { totalDependencies: 10 } };
      const { output } = formatter.format(cleanResult, []);

      expect(output).toContain("No vulnerabilities found");
    });

    it("should include package details", () => {
      const formatter = new AuditFormatter({ colors: false });
      const { output } = formatter.format(mockAuditResult, mockVulnerabilities);

      expect(output).toContain("lodash");
      expect(output).toContain("4.17.15");
      expect(output).toContain("Prototype Pollution");
    });

    it("should include vulnerability info URL", () => {
      const formatter = new AuditFormatter({ colors: false });
      const { output } = formatter.format(mockAuditResult, mockVulnerabilities);

      expect(output).toContain("info: https://npmjs.com/advisories/1234");
    });
  });

  describe("format() - exit code", () => {
    const cleanResult = { advisories: {}, metadata: { totalDependencies: 10 } };
    const exitCodeOf = (opts: object, vulns: object[], result: object = mockAuditResult) =>
      new AuditFormatter({ colors: false, ...opts }).format(result as any, vulns as any).exitCode;

    for (const [mode, opts] of [
      ["human", {}],
      ["json", { json: true }],
      ["summary", { summary: true }]
    ] as const) {
      it(`${mode}: exits 1 when a vulnerability meets the audit level`, () => {
        return verify({ timeout: 500 })
          .step(() => exitCodeOf({ ...opts, auditLevel: "high" }, mockVulnerabilities))
          .step(code => expect(code).toBe(1));
      });

      it(`${mode}: exits 0 when vulnerabilities are below the audit level`, () => {
        return verify({ timeout: 500 })
          .step(() => exitCodeOf({ ...opts, auditLevel: "critical" }, mockVulnerabilities))
          .step(code => expect(code).toBe(0));
      });

      it(`${mode}: exits 0 when there are no vulnerabilities`, () => {
        return verify({ timeout: 500 })
          .step(() => exitCodeOf(opts, [], cleanResult))
          .step(code => expect(code).toBe(0));
      });
    }
  });

  describe("formatVulnerability()", () => {
    it("should format vulnerability details", () => {
      const formatter = new AuditFormatter({ colors: false });
      const output = formatter.formatVulnerability(mockVulnerabilities[0]);

      expect(output).toContain("HIGH");
      expect(output).toContain("lodash@4.17.15");
      expect(output).toContain("Vulnerable: <4.17.21");
      expect(output).toContain("info:");
    });
  });
});
