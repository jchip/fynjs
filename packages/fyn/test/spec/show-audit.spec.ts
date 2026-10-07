import { afterEach, describe, it, expect, vi } from "vitest";
import { verify } from "run-verify";
import showAudit from "../../cli/show-audit";
import AuditReport from "../../lib/audit/audit-report";
import logger from "../../lib/logger";

const highVuln = {
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
};

const auditResult = { advisories: {}, metadata: { totalDependencies: 1 } };

// a resolved fyn so showAudit skips resolving and goes straight to advisories
const makeFyn = () => ({
  fynDir: "/tmp/fyn-show-audit",
  _options: { colors: false },
  _data: { pkgs: { lodash: {} } } as any,
  resolveDependencies: vi.fn()
});

const stubReport = (vulns: object[]) => {
  vi.spyOn(AuditReport.prototype, "fetchAdvisories").mockResolvedValue(auditResult as any);
  vi.spyOn(AuditReport.prototype, "matchVulnerabilities").mockReturnValue(vulns as any);
};

describe("showAudit exit code", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 1 when a vulnerability meets the audit level", () => {
    return verify({ timeout: 2000 })
      .step(() => vi.spyOn(console, "log").mockImplementation(() => {}))
      .step(() => stubReport([highVuln]))
      .step(() => showAudit(makeFyn(), { json: true, auditLevel: "high" }))
      .step(code => expect(code).toBe(1));
  });

  it("returns 0 when vulnerabilities are below the audit level", () => {
    return verify({ timeout: 2000 })
      .step(() => vi.spyOn(console, "log").mockImplementation(() => {}))
      .step(() => stubReport([highVuln]))
      .step(() => showAudit(makeFyn(), { json: true, auditLevel: "critical" }))
      .step(code => expect(code).toBe(0));
  });

  it("returns 0 when there are no vulnerabilities", () => {
    return verify({ timeout: 2000 })
      .step(() => vi.spyOn(console, "log").mockImplementation(() => {}))
      .step(() => stubReport([]))
      .step(() => showAudit(makeFyn(), { json: true }))
      .step(code => expect(code).toBe(0));
  });

  it("returns 1 and logs when the audit fails", () => {
    return verify({ timeout: 2000 })
      .step(() => vi.spyOn(logger, "error").mockImplementation(() => {}))
      .step(() =>
        vi.spyOn(AuditReport.prototype, "fetchAdvisories").mockRejectedValue(new Error("no registry"))
      )
      .step(() => showAudit(makeFyn(), { json: true }))
      .step(code => expect(code).toBe(1));
  });
});
