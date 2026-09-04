/**
 * Unit tests for AuditReport.fetchAdvisories() network behavior.
 *
 * npm's bulk advisories endpoint intermittently accepts the connection and never answers.
 * Left on npm-registry-fetch's defaults that stalls install for ~15 minutes, so these tests
 * pin the bounded fetch options and the degrade-to-cache path around them. FPM-90.
 */

import Fs from "fs";
import Os from "os";
import Path from "path";
import { describe, it, beforeEach, afterEach, vi } from "vitest";
import { expect } from "chai";

const { npmFetchMock } = vi.hoisted(() => ({ npmFetchMock: vi.fn() }));

vi.mock("npm-registry-fetch", () => ({ default: npmFetchMock }));

import AuditReport from "../../../lib/audit/audit-report";
import { generateCacheKey, cacheAuditResult } from "../../../lib/audit/audit-cache";

describe("audit-report fetchAdvisories()", () => {
  let fynDir: string;

  const depData = {
    pkgs: {
      lodash: { versions: { "4.17.15": { name: "lodash", version: "4.17.15", src: "dep" } } }
    }
  };

  const makeReport = (noCache = false) =>
    new AuditReport({
      fyn: { fynDir, _options: { registry: "https://registry.npmjs.org" } },
      depData: depData as never,
      noCache
    });

  beforeEach(() => {
    npmFetchMock.mockReset();
    fynDir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fyn-audit-test-"));
  });

  afterEach(() => {
    Fs.rmSync(fynDir, { recursive: true, force: true });
  });

  it("should bound the POST with a 10s timeout and no retries", async () => {
    npmFetchMock.mockResolvedValue({ json: async () => ({}) });

    await makeReport(true).fetchAdvisories();

    expect(npmFetchMock.mock.calls).to.have.lengthOf(1);
    const [url, opts] = npmFetchMock.mock.calls[0];
    expect(url).to.equal("https://registry.npmjs.org/-/npm/v1/security/advisories/bulk");
    expect(opts.method).to.equal("POST");
    expect(opts.timeout).to.equal(10000);
    expect(opts.retry).to.deep.equal({ retries: 0 });
  });

  it("should surface a stalled endpoint as an error rather than hanging", async () => {
    const timeoutErr = Object.assign(new Error("network timeout at: https://registry.npmjs.org/"), {
      code: "FETCH_ERROR"
    });
    npmFetchMock.mockRejectedValue(timeoutErr);

    let caught: Error;
    try {
      await makeReport(true).fetchAdvisories();
    } catch (err) {
      caught = err as Error;
    }

    expect(caught).to.exist;
    expect(caught.message).to.contain("network timeout");
    // one attempt only - the retrying is npm-registry-fetch's job and we turned it off
    expect(npmFetchMock.mock.calls).to.have.lengthOf(1);
  });

  it("should fall back to cached advisories when the endpoint stalls", async () => {
    const report = makeReport();
    const key = generateCacheKey(report.buildBulkPayload());
    const cached = { advisories: { lodash: [] }, metadata: { totalDependencies: 1 } };

    //
    // The cache has to miss on the pre-fetch read and hit on the post-failure one, otherwise
    // the pre-fetch hit short circuits and the fallback path never runs. Seeding it from inside
    // the fetch puts the entry there exactly between the two reads.
    //
    npmFetchMock.mockImplementation(async () => {
      await cacheAuditResult(fynDir, key, cached);
      throw new Error("network timeout at: https://registry.npmjs.org/");
    });

    const result = await report.fetchAdvisories();

    expect(npmFetchMock.mock.calls).to.have.lengthOf(1);
    expect(result).to.deep.equal(cached);
  });
});
