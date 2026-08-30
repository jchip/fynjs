import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../src/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import Fs from "fs";
import Path from "path";
import { FynpoDepGraph } from "@fynpo/base";

import { Bootstrap } from "../src/bootstrap";
import { logger } from "../src/logger";
import { makeSampleFixture, removeSampleFixture } from "./helpers/sample-fixture";

/** chalk may or may not emit colors depending on the environment */
const strip = (s: string) => String(s).replace(/\[[0-9;]*m/g, "");

/** everything the logger was told, at any level, as one plain string */
const logged = () =>
  strip(
    [logger.info, logger.warn, logger.error]
      .flatMap((fn: any) => fn.mock.calls.map((c: any[]) => c.join(" ")))
      .join("\n")
  );

const vuln = (severity: string) => ({ advisory: { severity } });

describe("Bootstrap.aggregateAuditResults (FPO-1)", () => {
  let dir: string;

  const writePkg = (name: string) => {
    const pkgDir = Path.join(dir, "packages", name);
    Fs.mkdirSync(pkgDir, { recursive: true });
    Fs.writeFileSync(
      Path.join(pkgDir, "package.json"),
      JSON.stringify({ name, version: "1.0.0", private: true }) + "\n"
    );
  };

  const writeAudit = (name: string, report: unknown) => {
    Fs.writeFileSync(
      Path.join(dir, "packages", name, ".fyn-audit.json"),
      typeof report === "string" ? report : JSON.stringify(report)
    );
  };

  const makeBootstrap = async () => {
    const graph = new FynpoDepGraph({ cwd: dir });
    await graph.resolve();
    return new Bootstrap(graph, { cwd: dir });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dir = makeSampleFixture("audit");
    writePkg("pkg1");
    writePkg("pkg2");
  });

  afterEach(() => {
    removeSampleFixture(dir);
  });

  it("says so when no package produced a report", async () => {
    const bootstrap = await makeBootstrap();

    await bootstrap.aggregateAuditResults();

    expect(logged()).toContain("No audit reports found from bootstrap");
  });

  it("skips a missing report without warning - ENOENT is the normal case", async () => {
    writeAudit("pkg1", { vulnerabilities: [], metadata: { totalDependencies: 5 } });

    const bootstrap = await makeBootstrap();
    await bootstrap.aggregateAuditResults();

    // pkg2 has no .fyn-audit.json, and that must be silent
    expect(logged()).not.toContain("Failed to read audit report");
    expect(logged()).toContain("across 1 workspaces");
  });

  it("aggregates dependency counts and workspace count across packages", async () => {
    writeAudit("pkg1", { vulnerabilities: [], metadata: { totalDependencies: 5 } });
    writeAudit("pkg2", { vulnerabilities: [], metadata: { totalDependencies: 7 } });

    const bootstrap = await makeBootstrap();
    await bootstrap.aggregateAuditResults();

    expect(logged()).toContain("audited 12 packages across 2 workspaces");
    expect(logged()).toContain("No vulnerabilities found");
  });

  it("totals vulnerabilities by severity", async () => {
    writeAudit("pkg1", {
      vulnerabilities: [vuln("critical"), vuln("high"), vuln("low")],
      metadata: { totalDependencies: 3 },
    });
    writeAudit("pkg2", {
      vulnerabilities: [vuln("high"), vuln("moderate")],
      metadata: { totalDependencies: 2 },
    });

    const bootstrap = await makeBootstrap();
    await bootstrap.aggregateAuditResults();

    const out = logged();
    expect(out).toContain("5 vulnerabilities");
    expect(out).toContain("1 critical");
    expect(out).toContain("2 high");
    expect(out).toContain("1 moderate");
    expect(out).toContain("1 low");
  });

  it("breaks the count down per package", async () => {
    writeAudit("pkg1", { vulnerabilities: [vuln("high")], metadata: { totalDependencies: 1 } });
    writeAudit("pkg2", { vulnerabilities: [], metadata: { totalDependencies: 1 } });

    const bootstrap = await makeBootstrap();
    await bootstrap.aggregateAuditResults();

    const out = logged();
    expect(out).toContain("Vulnerabilities by package:");
    expect(out).toContain("pkg1");
    expect(out).toContain("1 total (1 high)");
    // pkg2 is clean, so it must not appear in the breakdown
    expect(out).not.toMatch(/pkg2 .* total/);
    expect(out).toContain("Run `fyn audit` in a package for full details.");
  });

  it("ignores an unrecognized severity rather than miscounting it", async () => {
    writeAudit("pkg1", {
      vulnerabilities: [vuln("high"), vuln("bogus")],
      metadata: { totalDependencies: 1 },
    });

    const bootstrap = await makeBootstrap();
    await bootstrap.aggregateAuditResults();

    expect(logged()).toContain("1 vulnerabilities");
    expect(logged()).toContain("1 high");
  });

  it("warns but does not throw on a malformed report", async () => {
    writeAudit("pkg1", "{ this is not json");
    writeAudit("pkg2", { vulnerabilities: [], metadata: { totalDependencies: 4 } });

    const bootstrap = await makeBootstrap();
    await expect(bootstrap.aggregateAuditResults()).resolves.toBeUndefined();

    const out = logged();
    // the bad one is reported...
    expect(out).toContain("Failed to read audit report");
    // ...and the good one still counted
    expect(out).toContain("audited 4 packages across 1 workspaces");
  });

  it("tolerates a report with no metadata or vulnerabilities fields", async () => {
    writeAudit("pkg1", {});

    const bootstrap = await makeBootstrap();
    await bootstrap.aggregateAuditResults();

    expect(logged()).toContain("audited 0 packages across 1 workspaces");
    expect(logged()).toContain("No vulnerabilities found");
  });
});
