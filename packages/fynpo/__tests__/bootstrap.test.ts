import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Bootstrap, formatCompactJson, addVersionToRange } from "../src/bootstrap";
import path from "path";
import { FynpoDepGraph } from "@fynpo/base";
import * as xaa from "xaa";
import { makeSampleFixture, removeSampleFixture } from "./helpers/sample-fixture";

describe("fynpo bootstrap", () => {
  let sampleDir: string;
  let bootstrap: Bootstrap;
  let parsed: any;

  beforeAll(async () => {
    sampleDir = makeSampleFixture("bootstrap");
    parsed = {
      name: "bootstrap",
      opts: {
        cwd: sampleDir,
        deps: 10,
        saveLog: false,
        tag: true,
        build: true,
        concurrency: 3,
      },
      args: {},
      argList: [],
    };
    const graph = new FynpoDepGraph({ cwd: sampleDir });
    await graph.resolve();
    bootstrap = new Bootstrap(graph, parsed.opts);
  });

  afterAll(() => {
    removeSampleFixture(sampleDir);
  });

  it("should initialize bootstrap class", async () => {
    await xaa.delay(500);
    expect(bootstrap._opts).toStrictEqual(parsed.opts);
    expect(bootstrap.failed).toEqual(0);
  });

  it("formatCompactJson preserves inline primitive arrays and versionLocks", () => {
    const json = {
      packages: ["packages/*", "_w/*"],
      versionLocks: [["fynpo", "fyn", "fynpo-cli"]],
      fyn: {
        options: {
          allowScripts: {
            sharp: {
              scripts: ["install"]
            }
          }
        }
      }
    };
    const formatted = formatCompactJson(json);
    expect(formatted).toContain('["packages/*", "_w/*"]');
    expect(formatted).toContain('["fynpo", "fyn", "fynpo-cli"]');
    expect(formatted).toContain('["install"]');
  });

  it("addVersionToRange extends and satisfies semver ranges", () => {
    expect(addVersionToRange("^1.0.0", "1.2.0")).toBe("^1.0.0");
    expect(addVersionToRange("^1.0.0", "2.0.0")).toBe("^1.0.0 || ^2.0.0");
    expect(addVersionToRange("^1.0.0 || ^2.0.0", "2.1.0")).toBe("^1.0.0 || ^2.0.0");
  });

  it("aggregateScriptReview aggregates blockedScripts across monorepo workspaces and filters already allowed", async () => {
    const Fs = await import("fs");
    const os = await import("os");
    const tmpDir = Fs.mkdtempSync(path.join(os.tmpdir(), "fynpo-bs-test-"));

    try {
      // Create root fynpo.json with an existing approval
      const rootFynpo = {
        packages: ["packages/*"],
        fyn: {
          options: {
            allowScripts: {
              alreadyAllowed: { semver: "^1.0.0" }
            }
          }
        }
      };
      Fs.writeFileSync(path.join(tmpDir, "fynpo.json"), JSON.stringify(rootFynpo, null, 2));

      // Create workspace pkg-a with blocked script
      const pkgADir = path.join(tmpDir, "packages", "pkg-a");
      Fs.mkdirSync(path.join(pkgADir, "node_modules", ".f"), { recursive: true });
      Fs.writeFileSync(
        path.join(pkgADir, "package.json"),
        JSON.stringify({ name: "pkg-a", version: "1.0.0" })
      );
      Fs.writeFileSync(
        path.join(pkgADir, "node_modules", ".f", "fyn-install-config.json"),
        JSON.stringify({
          blockedScripts: [
            { name: "sharp", version: "0.34.4", scripts: ["install"] },
            { name: "alreadyAllowed", version: "1.0.5", scripts: ["install"] }
          ]
        })
      );

      // Create workspace pkg-b with blocked script
      const pkgBDir = path.join(tmpDir, "packages", "pkg-b");
      Fs.mkdirSync(path.join(pkgBDir, "node_modules", ".f"), { recursive: true });
      Fs.writeFileSync(
        path.join(pkgBDir, "package.json"),
        JSON.stringify({ name: "pkg-b", version: "1.0.0" })
      );
      Fs.writeFileSync(
        path.join(pkgBDir, "node_modules", ".f", "fyn-install-config.json"),
        JSON.stringify({
          blockedScripts: [
            { name: "sharp", version: "0.34.4", scripts: ["install"] },
            { name: "canvas", version: "2.11.2", scripts: ["install"] }
          ]
        })
      );

      const graph = new FynpoDepGraph({ cwd: tmpDir, patterns: ["packages/*"] });
      await graph.resolve();
      const bs = new Bootstrap(graph, { cwd: tmpDir });

      const review = await bs.aggregateScriptReview();
      // "alreadyAllowed@1.0.5" should be filtered out
      expect(review.records.map(r => r.name).sort()).toEqual(["canvas", "sharp"]);
      expect(review.byPackage.sharp).toContain("pkg-a");
      expect(review.byPackage.sharp).toContain("pkg-b");
      expect(review.byPackage.canvas).toContain("pkg-b");
    } finally {
      Fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
