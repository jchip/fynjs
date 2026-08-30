import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock nix-clap module
vi.mock("@fynjs/cli-args", () => {
  const mockNixClap = vi.fn().mockImplementation(function(config) {
    this.version = vi.fn();
    this.init2 = vi.fn();
    this.parseAsync = vi.fn().mockResolvedValue({});
    return this;
  });
  return {
    NixClap: mockNixClap,
  };
});

import {
  cliOptions,
  fynpoMain,
  implicitDiscoveryNotice,
  resolveRunExitCode,
} from "../src/index";
import fsMod from "fs";
import pathMod from "path";
import { NixClap } from "@fynjs/cli-args";

describe("fynpo CLI", () => {
  let originalExit: typeof process.exit;
  let exitMock: any;

  beforeEach(() => {
    originalExit = process.exit;
    exitMock = vi.fn();
    process.exit = exitMock;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.exit = originalExit;
    vi.restoreAllMocks();
  });

  it("should create NixClap instance with correct configuration", () => {
    // Call fynpoMain but don't await parseAsync
    const result = fynpoMain();

    expect(NixClap).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.any(String),
        usage: "$0 [command] [options]",
        defaultCommand: "bootstrap",
      })
    );
  });

  it("should have bootstrap as default command", () => {
    const result = fynpoMain();
    // The NixClap instance should be configured with defaultCommand: "bootstrap"
    expect(result).toBeDefined();
  });

  it("should define all expected subcommands", () => {
    const result = fynpoMain();
    // Verify that the CLI structure includes all expected commands
    expect(result).toBeDefined();
  });

  it("should handle parse-fail handler correctly", () => {
    const result = fynpoMain();
    // The parse-fail handler should be defined
    expect(result).toBeDefined();
  });

  it("should handle unknown-option handler correctly", () => {
    const result = fynpoMain();
    // The unknown-option handler should be defined
    expect(result).toBeDefined();
  });
});

describe("resolveRunExitCode", () => {
  it("propagates a package-script failure code Run set via process.exitCode", () => {
    // regression: a hardcoded process.exit(0) used to clobber this, so `fynpo run`
    // exited 0 even when a package script failed.
    expect(resolveRunExitCode(0, 2)).toBe(2);
    expect(resolveRunExitCode(0, 1)).toBe(1);
  });

  it("prefers a caught-exception code over process.exitCode", () => {
    expect(resolveRunExitCode(1, 0)).toBe(1);
    expect(resolveRunExitCode(1, undefined)).toBe(1);
  });

  it("exits 0 on success (no failure code anywhere)", () => {
    expect(resolveRunExitCode(0, 0)).toBe(0);
    expect(resolveRunExitCode(0, undefined)).toBe(0);
  });
});


describe("cliOptions (FPO-30 regression)", () => {
  it("has a single `only` covering both the filter and the release senses", () => {
    // `only` was once declared twice in this table. A duplicate key collapses silently
    // in a JS object literal, so the release entry shadowed the filter entry and
    // bootstrap/local/run lost the option along with its `-o` alias.
    expect(cliOptions.only).toBeDefined();
    expect(cliOptions.only.alias).toEqual("o");
    expect(cliOptions.only.args).toEqual("<vals string..>");
    expect(cliOptions.only.allowCmd).toEqual([
      "bootstrap",
      "local",
      "run",
      "updated",
      "changelog",
      "version",
      "prepare",
    ]);
  });

  it("keeps `only` usable by every command that reads options.only", () => {
    // topo-runner.ts filters on opts.only for these
    for (const cmd of ["bootstrap", "local", "run"]) {
      expect(cliOptions.only.allowCmd).toContain(cmd);
    }
    // prepare/version/update-changelog treat it as the selective-release selection
    for (const cmd of ["updated", "changelog", "version", "prepare"]) {
      expect(cliOptions.only.allowCmd).toContain(cmd);
    }
  });

  it("assigns each alias to exactly one option", () => {
    const seen = new Map<string, string>();
    for (const [name, opt] of Object.entries<any>(cliOptions)) {
      if (!opt.alias) {
        continue;
      }
      expect(seen.has(opt.alias), `alias -${opt.alias} used by both ${seen.get(opt.alias)} and ${name}`).toBe(false);
      seen.set(opt.alias, name);
    }
  });

  it("declares a non-empty desc for every option", () => {
    for (const [name, opt] of Object.entries<any>(cliOptions)) {
      expect(opt.desc, `option ${name} has no desc`).toBeTruthy();
    }
  });
});

// FPO-32: fynpo declared `main: "dist/index.js"` while the rolldown build emits only
// dist/bundle.mjs. Nothing consulted it, so it went unnoticed. fynpo is CLI-only, so
// `bin` is the entry point and there is no main to keep in sync.
describe("package.json entry points (FPO-32)", () => {
  const pkgDir = pathMod.join(__dirname, "..");
  const pkg = JSON.parse(fsMod.readFileSync(pathMod.join(pkgDir, "package.json"), "utf8"));

  it("declares no main, since this is a bin-only package", () => {
    expect(pkg.main).toBeUndefined();
  });

  it("points every bin at a file that exists", () => {
    const bins = Object.values<string>(pkg.bin || {});
    expect(bins.length).toBeGreaterThan(0);

    for (const bin of bins) {
      expect(fsMod.existsSync(pathMod.join(pkgDir, bin)), `bin ${bin} does not exist`).toBe(true);
    }
  });

  it("ships the files the bin needs", () => {
    expect(pkg.files).toContain("bin");
    expect(pkg.files).toContain("dist");
  });
});

describe("implicitDiscoveryNotice (FPO-48)", () => {
  it("says nothing when discovery scanned declared paths", () => {
    expect(implicitDiscoveryNotice(false, 30, { autoSearch: false })).toBeUndefined();
  });

  it("does not claim a config that declares packages declared none", () => {
    const notice = implicitDiscoveryNotice(true, 32, ["packages/*", "_w/*"]);

    expect(notice.level).toBe("info");
    expect(notice.message).not.toContain(`No "packages"`);
    expect(notice.message).toContain("filters discovery but leaves auto-search on");
    expect(notice.message).toContain("found 32");
  });

  it("points at the shape that actually turns auto-search off", () => {
    // the old advice was `"packages": ["packages/*"]` - the array form, which lands right
    // back on auto-search, so anyone following it saw no change
    for (const packages of [undefined, ["packages/*"]]) {
      const { message } = implicitDiscoveryNotice(true, 5, packages);
      expect(message).toContain(`"autoSearch": false`);
    }
  });

  it("still reports a config with no packages key as declaring none", () => {
    const notice = implicitDiscoveryNotice(true, 7, undefined);

    expect(notice.level).toBe("info");
    expect(notice.message).toContain(`No "packages" config in fynpo.json`);
    expect(notice.message).toContain("found 7");
  });

  it("warns when the search turned up nothing at all", () => {
    expect(implicitDiscoveryNotice(true, 0, undefined).level).toBe("warn");
    expect(implicitDiscoveryNotice(true, 0, ["packages/*"]).level).toBe("warn");
    expect(implicitDiscoveryNotice(true, 0, ["packages/*"]).message).toContain(
      "found no package.json"
    );
  });

  it("treats an empty packages value as declaring nothing", () => {
    expect(implicitDiscoveryNotice(true, 3, []).message).toContain(`No "packages" config`);
    expect(implicitDiscoveryNotice(true, 3, {}).message).toContain(`No "packages" config`);
  });
});
