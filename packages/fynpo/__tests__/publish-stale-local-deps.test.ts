import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";

vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const printError = vi.fn();
const printWarning = vi.fn();
vi.mock("../src/release-output", () => ({
  printHeader: vi.fn(),
  printSection: vi.fn(),
  printList: vi.fn(),
  printSuccess: vi.fn(),
  printWarning: (...args: any[]) => printWarning(...args),
  printError: (...args: any[]) => printError(...args),
  printNextSteps: vi.fn(),
  printCommand: (x: string) => x,
}));

vi.mock("fyn/bin/index.mjs", () => ({ default: { run: vi.fn() } }));
vi.mock("shelljs", () => ({ default: { pushd: vi.fn(), popd: vi.fn(), rm: vi.fn() } }));
vi.mock("xsh", () => ({ default: { exec: () => ({ promise: Promise.resolve({ stdout: "" }) }) } }));

import Fs from "fs";
import Os from "os";
import Path from "path";
import Publish from "../src/publish";

//
// FPO-59. fynpo@3.0.3 was bundled from a copy of @fynpo/base that was one build behind the
// workspace source. Every step reported success; the published bundle simply did not contain
// the fix that shipped in @fynpo/base@2.0.2 minutes earlier. A release is the one moment where
// this has to be a hard stop rather than the warning `fynpo run` prints.
//
describe("publish stale local dep preflight", () => {
  let cwd: string;

  const writePkg = (relPath: string, files: Record<string, string>) => {
    for (const [rel, content] of Object.entries(files)) {
      const file = Path.join(cwd, relPath, rel);
      Fs.mkdirSync(Path.dirname(file), { recursive: true });
      Fs.writeFileSync(file, content);
    }
  };

  const manifest = (name: string) =>
    JSON.stringify({ name, version: "1.0.0", main: "./dist/index.js" });

  const installedManifest = (name: string, srcRelPath: string) =>
    JSON.stringify({
      name,
      version: "1.0.0",
      main: "./dist/index.js",
      dist: { fullPath: Path.join(cwd, srcRelPath) },
      _id: `${name}@1.0.0-fynlocal_h`,
    });

  beforeAll(() => {
    cwd = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fynpo-publish-stale-"));

    // the workspace package was rebuilt after it was installed into the consumer
    writePkg("packages/base", {
      "package.json": manifest("base"),
      "dist/index.js": "export const fixed = true;",
    });
    writePkg("packages/bundler/node_modules/base", {
      "package.json": installedManifest("base", "packages/base"),
      "dist/index.js": "export const fixed = false;",
    });

    // a copy whose manifest drifted but whose files are current - a warning, not a blocker
    writePkg("packages/manifest-drift", {
      "package.json": manifest("manifest-drift"),
      "dist/index.js": "export const same = true;",
    });
    writePkg("packages/manifest-consumer/node_modules/manifest-drift", {
      "package.json": JSON.stringify({
        name: "manifest-drift",
        version: "0.9.0",
        main: "./dist/index.js",
        dist: { fullPath: Path.join(cwd, "packages/manifest-drift") },
        _id: "manifest-drift@0.9.0-fynlocal_h",
      }),
      "dist/index.js": "export const same = true;",
    });

    // and one whose copy is current
    writePkg("packages/fresh", {
      "package.json": manifest("fresh"),
      "dist/index.js": "export const same = true;",
    });
    writePkg("packages/consumer/node_modules/fresh", {
      "package.json": installedManifest("fresh", "packages/fresh"),
      "dist/index.js": "export const same = true;",
    });

    stampMtimes(cwd, new Date(1700000000000));
  });

  /** a fresh install shares its source's mtime (it is the same file) - fixtures must too */
  const stampMtimes = (dir: string, when: Date) => {
    for (const entry of Fs.readdirSync(dir, { withFileTypes: true })) {
      const full = Path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stampMtimes(full, when);
      } else if (entry.isFile()) {
        Fs.utimesSync(full, when, when);
      }
    }
  };

  afterAll(() => {
    Fs.rmSync(cwd, { recursive: true, force: true });
  });

  let exit: any;

  beforeEach(() => {
    printError.mockClear();
    printWarning.mockClear();
    delete process.env.FYNPO_ALLOW_STALE_LOCAL_DEPS;
    exit = vi.spyOn(process, "exit").mockImplementation(((code: number) => {
      throw new Error(`process.exit(${code})`);
    }) as any);
  });

  afterEach(() => {
    exit.mockRestore();
    delete process.env.FYNPO_ALLOW_STALE_LOCAL_DEPS;
  });

  const makePublish = (consumerPath: string, depName: string, depPath: string) => {
    const depData = {
      pkgInfo: { name: Path.basename(consumerPath), path: consumerPath },
      localDepsByPath: {
        [depPath]: { name: depName, path: depPath, version: "1.0.0", depSection: "dep" },
      },
      dependentsByPath: {},
    };
    const graph: any = {
      getTopoSortPackages: () => ({ sorted: [depData], noCircSorted: [depData], circulars: [] }),
      packages: { byId: {}, byPath: {}, byName: {} },
    };
    const publish = new Publish({ cwd }, graph);
    publish._packagesToPublish = [depData.pkgInfo] as any;
    return publish;
  };

  it("stops the release when a package to publish holds a stale copy", () => {
    const publish = makePublish("packages/bundler", "base", "packages/base");

    expect(() => publish.checkStaleLocalDeps()).toThrow("process.exit(1)");

    const msg = printError.mock.calls[0][0];
    expect(msg).toContain("base");
    expect(msg).toContain("dist/index.js");
    expect(msg).toContain("fynpo bootstrap");
  });

  it("says nothing when every copy is current", () => {
    const publish = makePublish("packages/consumer", "fresh", "packages/fresh");

    expect(() => publish.checkStaleLocalDeps()).not.toThrow();
    expect(printError).not.toHaveBeenCalled();
  });

  it("can be overridden with FYNPO_ALLOW_STALE_LOCAL_DEPS", () => {
    process.env.FYNPO_ALLOW_STALE_LOCAL_DEPS = "1";
    const publish = makePublish("packages/bundler", "base", "packages/base");

    expect(() => publish.checkStaleLocalDeps()).not.toThrow();
    expect(printError).not.toHaveBeenCalled();
  });

  //
  // A manifest difference is not reliably staleness - fyn writes a reduced manifest for an
  // installed copy - so it must not be what stops a release.
  //
  it("warns but does not stop for a manifest-only difference", () => {
    const publish = makePublish(
      "packages/manifest-consumer",
      "manifest-drift",
      "packages/manifest-drift"
    );

    expect(() => publish.checkStaleLocalDeps()).not.toThrow();
    expect(printError).not.toHaveBeenCalled();
    expect(printWarning).toHaveBeenCalled();
    expect(printWarning.mock.calls.flat().join(" ")).toContain("manifest-drift");
  });

  it("only checks the packages being published", () => {
    const publish = makePublish("packages/bundler", "base", "packages/base");
    // the stale consumer is in the graph but not in this release
    publish._packagesToPublish = [{ name: "other", path: "packages/other" }] as any;

    expect(() => publish.checkStaleLocalDeps()).not.toThrow();
    expect(printError).not.toHaveBeenCalled();
  });
});
