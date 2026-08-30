import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock logger before importing utils
vi.mock("../src/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import Fs from "fs";
import Os from "os";
import Path from "path";

import { makePublishFilter } from "../src/utils";

/** minimal shape PackageRef matches against */
const pkg = (name: string, path: string, version = "1.0.0") =>
  ({ name, path, version, id: `${name}@${version}` } as any);

const rc = (packages: any) => ({ packages });

// a dir with no gitignore rules, so the publish veto is a no-op in these cases
const NO_GIT = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fynpo-pubfilter-"));

const kernel = pkg("@fynmesh/kernel", "core/kernel");
const createFynapp = pkg("create-fynapp", "dev-tools/create-fynapp");
const wrapPlugin = pkg("rollup-wrap-plugin", "dev-tools/rollup-wrap-plugin");
const demoApp = pkg("fynapp-1", "demo/fynapp-1");
const esmReact = pkg("esm-react", "misc/esm-react-19", "19.2.8");
const sample = pkg("share-a", "rollup-federation/share-a-1.0");

describe("makePublishFilter", () => {
  it("allows everything when no config is set", () => {
    const filter = makePublishFilter({}, NO_GIT);
    expect(filter(kernel)).toBe(true);
    expect(filter(demoApp)).toBe(true);
  });

  it("allows everything when both lists are empty", () => {
    const filter = makePublishFilter(rc({ publishInclude: [], publishExclude: [] }), NO_GIT);
    expect(filter(demoApp)).toBe(true);
  });

  it("include list restricts to matching packages, by path glob", () => {
    const filter = makePublishFilter(
      rc({ publishInclude: ["path:core/*", "path:dev-tools/*"] })
    );
    expect(filter(kernel)).toBe(true);
    expect(filter(createFynapp)).toBe(true);
    expect(filter(wrapPlugin)).toBe(true);
    expect(filter(demoApp)).toBe(false);
    expect(filter(esmReact)).toBe(false);
  });

  it("fails closed - a package under an unlisted path is not publishable", () => {
    const filter = makePublishFilter(rc({ publishInclude: ["path:core/*"] }), NO_GIT);
    expect(filter(pkg("fynapp-9", "demo/fynapp-9"))).toBe(false);
    expect(filter(pkg("brand-new", "brand-new-dir/thing"))).toBe(false);
  });

  it("exclude list removes packages", () => {
    const filter = makePublishFilter(rc({ publishExclude: ["path:demo/**"] }), NO_GIT);
    expect(filter(kernel)).toBe(true);
    expect(filter(demoApp)).toBe(false);
  });

  it("exclude wins over include for the same package", () => {
    const filter = makePublishFilter(
      rc({
        publishInclude: ["path:rollup-federation/*"],
        publishExclude: ["path:rollup-federation/share-*"],
      })
    );
    expect(filter(pkg("federation-js", "rollup-federation/federation-js"))).toBe(true);
    expect(filter(sample)).toBe(false);
  });

  it("matches by bare name and by explicit name: ref", () => {
    const filter = makePublishFilter(
      rc({ publishInclude: ["@fynmesh/kernel", "name:create-fynapp"] })
    );
    expect(filter(kernel)).toBe(true);
    expect(filter(createFynapp)).toBe(true);
    expect(filter(demoApp)).toBe(false);
  });

  it("matches by id: ref", () => {
    const filter = makePublishFilter(rc({ publishInclude: ["id:esm-react@19.2.8"] }), NO_GIT);
    expect(filter(esmReact)).toBe(true);
    expect(filter(kernel)).toBe(false);
  });

  it("supports regex refs on path", () => {
    const filter = makePublishFilter(rc({ publishExclude: ["path:/^demo\\//"] }), NO_GIT);
    expect(filter(demoApp)).toBe(false);
    expect(filter(kernel)).toBe(true);
  });

  it("tolerates a single string instead of an array", () => {
    const filter = makePublishFilter(rc({ publishInclude: "path:core/*" }), NO_GIT);
    expect(filter(kernel)).toBe(true);
    expect(filter(demoApp)).toBe(false);
  });

  it("ignores empty and non-string entries", () => {
    const filter = makePublishFilter(
      rc({ publishInclude: ["path:core/*", "", "   ", null, undefined] as any })
    );
    expect(filter(kernel)).toBe(true);
    expect(filter(demoApp)).toBe(false);
  });

  it("returns false for a missing package", () => {
    const filter = makePublishFilter(rc({ publishInclude: ["path:core/*"] }), NO_GIT);
    expect(filter(undefined as any)).toBe(false);
  });

  it("the fynmesh config publishes exactly its five packages", () => {
    const filter = makePublishFilter(
      rc({
        publishInclude: [
          "path:core/*",
          "path:dev-tools/*",
          "path:rollup-federation/federation-js",
          "path:rollup-federation/rollup-plugin-federation",
        ],
      })
    );
    const publishable = [
      kernel,
      createFynapp,
      wrapPlugin,
      pkg("federation-js", "rollup-federation/federation-js"),
      pkg("rollup-plugin-federation", "rollup-federation/rollup-plugin-federation"),
    ];
    const excluded = [
      demoApp,
      esmReact,
      sample,
      pkg("bundle-esm-share", "demo-rollup-externals/bundle-esm-share"),
      pkg("react-federation", "rollup-federation/sample-react-federation"),
    ];
    expect(publishable.filter(filter)).toHaveLength(5);
    expect(excluded.filter(filter)).toHaveLength(0);
  });
});

describe("makePublishFilter - packages as an array (FPO-17)", () => {
  it("treats the historical array shape as publishInclude", () => {
    const filter = makePublishFilter({ packages: ["path:core/*"] }, NO_GIT);

    expect(filter(kernel)).toBe(true);
    expect(filter(demoApp)).toBe(false);
  });

  it("allows everything for an empty array", () => {
    const filter = makePublishFilter({ packages: [] }, NO_GIT);

    expect(filter(kernel)).toBe(true);
    expect(filter(demoApp)).toBe(true);
  });
});

describe("makePublishFilter - gitignore veto (FPO-17)", () => {
  let dir: string;

  beforeEach(() => {
    dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fynpo-gitveto-"));
    // _w holds nested clones that exist only for local linking
    Fs.writeFileSync(Path.join(dir, ".gitignore"), "_w\ndist-*\n");
  });

  afterEach(() => {
    Fs.rmSync(dir, { recursive: true, force: true });
  });

  it("vetoes a gitignored package even with no publish config at all", () => {
    const filter = makePublishFilter({}, dir);

    expect(filter(pkg("xsh", "_w/xsh"))).toBe(false);
    expect(filter(pkg("fyn", "packages/fyn"))).toBe(true);
  });

  it("veto outranks an explicit publishInclude naming it", () => {
    const filter = makePublishFilter({ packages: { publishInclude: ["path:_w/*"] } }, dir);

    expect(filter(pkg("xsh", "_w/xsh"))).toBe(false);
  });

  it("veto outranks the historical array shape naming it", () => {
    // this repo's own config: packages: ["packages/*", "_w/*"]
    const filter = makePublishFilter({ packages: ["path:packages/*", "path:_w/*"] }, dir);

    expect(filter(pkg("fyn", "packages/fyn"))).toBe(true);
    expect(filter(pkg("xsh", "_w/xsh"))).toBe(false);
    expect(filter(pkg("ignore-walk", "_w/ignore-walk"))).toBe(false);
  });

  it("is independent of respectGitignore, which only governs discovery", () => {
    const filter = makePublishFilter(
      { packages: { autoSearch: { respectGitignore: false }, publishInclude: ["path:_w/*"] } },
      dir
    );

    expect(filter(pkg("xsh", "_w/xsh"))).toBe(false);
  });

  it("matches glob rules, not just literal names", () => {
    const filter = makePublishFilter({}, dir);

    expect(filter(pkg("built", "dist-esm"))).toBe(false);
    expect(filter(pkg("kept", "distinct"))).toBe(true);
  });

  it("is a no-op where there are no gitignore rules", () => {
    const filter = makePublishFilter({}, NO_GIT);

    expect(filter(pkg("xsh", "_w/xsh"))).toBe(true);
  });
});

describe("makePublishFilter - legacy array entries match by path (FPO-17)", () => {
  it("matches bare globs against the package path, not its name", () => {
    const filter = makePublishFilter({ packages: ["core/*", "dev-tools/*"] }, NO_GIT);

    expect(filter(kernel)).toBe(true);
    expect(filter(createFynapp)).toBe(true);
    expect(filter(demoApp)).toBe(false);
  });

  it("would fail closed if entries were read as name refs", () => {
    // guards the coercion: without it every ref matches nothing and, because a non-empty
    // allow list fails closed, nothing in the repo is publishable
    const filter = makePublishFilter({ packages: ["packages/*"] }, NO_GIT);

    expect(filter(pkg("fyn", "packages/fyn"))).toBe(true);
  });
});
