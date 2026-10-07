import { describe, it, beforeEach, afterEach, afterAll, expect, vi } from "vitest";
import Fs from "fs";
import Path from "path";
import Os from "os";
import { verify } from "run-verify";
import Fyn, { shortPkgDirFromEnv } from "../../lib/fyn";
import logger from "../../lib/logger";

describe("short-pkg-dir", function () {
  let saveEnv;
  beforeEach(() => {
    saveEnv = process.env.FYN_SHORT_PKG_DIR;
    delete process.env.FYN_SHORT_PKG_DIR;
  });
  afterEach(() => {
    if (saveEnv === undefined) {
      delete process.env.FYN_SHORT_PKG_DIR;
    } else {
      process.env.FYN_SHORT_PKG_DIR = saveEnv;
    }
  });

  describe("constructor flag", () => {
    it("defaults to long form when FYN_SHORT_PKG_DIR is unset", () => {
      const fyn = new Fyn({ opts: { cwd: "/tmp/x", targetDir: "node_modules" } });
      expect(fyn._shortPkgDir).toBe(false);
    });

    it("opts into short form when FYN_SHORT_PKG_DIR is set", () => {
      process.env.FYN_SHORT_PKG_DIR = "1";
      const fyn = new Fyn({ opts: { cwd: "/tmp/x", targetDir: "node_modules" } });
      expect(fyn._shortPkgDir).toBe(true);
    });
  });

  describe("env value parsing", () => {
    for (const value of ["1", "true", "TRUE", "True"]) {
      it(`treats "${value}" as on`, () => {
        return verify({ timeout: 500 })
          .step(() => (process.env.FYN_SHORT_PKG_DIR = value))
          .step(() => new Fyn({ opts: { cwd: "/tmp/x", targetDir: "node_modules" } }))
          .step(fyn => expect(fyn._shortPkgDir).toBe(true));
      });
    }

    for (const value of ["0", "false", "", "no", "yes"]) {
      it(`treats "${value}" as off`, () => {
        return verify({ timeout: 500 })
          .step(() => (process.env.FYN_SHORT_PKG_DIR = value))
          .step(() => new Fyn({ opts: { cwd: "/tmp/x", targetDir: "node_modules" } }))
          .step(fyn => expect(fyn._shortPkgDir).toBe(false));
      });
    }

    it("shortPkgDirFromEnv is off when unset", () => {
      return verify({ timeout: 500 })
        .step(() => shortPkgDirFromEnv())
        .step(on => expect(on).toBe(false));
    });
  });

  describe("warning when an existing install forces the pkg-dir form", () => {
    let cwd: string;
    let warn;
    afterEach(() => {
      vi.restoreAllMocks();
      Fs.rmSync(cwd, { recursive: true, force: true });
    });

    // an existing install of the given form, then a new Fyn that reads its .fyn.json
    const initWithInstall = (envValue: string, recordedShort: boolean) =>
      verify({ timeout: 2000 })
        .step(() => (cwd = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fyn-short-pkg-dir-"))))
        .step(() => Fs.mkdirSync(Path.join(cwd, "xout", ".f"), { recursive: true }))
        .step(() =>
          Fs.writeFileSync(
            Path.join(cwd, "xout", ".f", ".fyn.json"),
            JSON.stringify({ shortPkgDir: recordedShort })
          )
        )
        .step(() => (process.env.FYN_SHORT_PKG_DIR = envValue))
        .step(() => (warn = vi.spyOn(logger, "warn")))
        .step(
          () =>
            new Fyn({
              _fynpo: {},
              opts: {
                registry: "http://localhost/",
                pkgFile: false,
                pkgData: { name: "t", version: "1.0.0" },
                targetDir: "xout",
                cwd,
                fynDir: Path.join(cwd, ".fyn")
              }
            } as any)
        )
        .keep.step(fyn => fyn._initializePkg())
        .keep.step(fyn => expect(fyn._shortPkgDir).toBe(recordedShort));

    const pkgDirWarnings = () =>
      warn.mock.calls.filter(c => String(c[0]).includes("Forcing pkg-dir"));

    it('does not warn for "0", which means long form', () => {
      return initWithInstall("0", false).step(() => expect(pkgDirWarnings()).toHaveLength(0));
    });

    it('warns for "1" when the install is long form', () => {
      return initWithInstall("1", false).step(() => expect(pkgDirWarnings()).toHaveLength(1));
    });

    it('warns for "0" when the install is short form', () => {
      return initWithInstall("0", true).step(() => expect(pkgDirWarnings()).toHaveLength(1));
    });
  });

  describe("getInstalledPkgDir", () => {
    const opts = { cwd: "/proj", targetDir: "node_modules" };

    it("produces long-form path by default", () => {
      const fyn = new Fyn({ opts });
      const dir = fyn.getInstalledPkgDir("pkg-a", "1.2.3");
      expect(dir).toBe(
        Path.join("/proj", "node_modules", ".f", "_", "pkg-a", "1.2.3", "node_modules", "pkg-a"),
      );
    });

    it("produces short-form path when flag is set", () => {
      process.env.FYN_SHORT_PKG_DIR = "1";
      const fyn = new Fyn({ opts });
      const dir = fyn.getInstalledPkgDir("pkg-a", "1.2.3");
      expect(dir).toBe(Path.join("/proj", "node_modules", ".f", "_", "pkg-a", "1.2.3", "pkg-a"));
    });

    it("preserves scoped package name in both forms", () => {
      const long = new Fyn({ opts }).getInstalledPkgDir("@scope/pkg", "1.0.0");
      expect(long).toBe(
        Path.join(
          "/proj",
          "node_modules",
          ".f",
          "_",
          "@scope/pkg",
          "1.0.0",
          "node_modules",
          "@scope/pkg",
        ),
      );
      process.env.FYN_SHORT_PKG_DIR = "1";
      const short = new Fyn({ opts }).getInstalledPkgDir("@scope/pkg", "1.0.0");
      expect(short).toBe(
        Path.join("/proj", "node_modules", ".f", "_", "@scope/pkg", "1.0.0", "@scope/pkg"),
      );
    });

    it("falls back to top-level dir when version is omitted (unaffected by flag)", () => {
      const expected = Path.join("/proj", "node_modules", ".f", "_", "pkg-a");
      expect(new Fyn({ opts }).getInstalledPkgDir("pkg-a")).toBe(expected);
      process.env.FYN_SHORT_PKG_DIR = "1";
      expect(new Fyn({ opts }).getInstalledPkgDir("pkg-a")).toBe(expected);
    });
  });

  describe("saveInstallConfig persistence", () => {
    const tmpRoot = Path.join(__dirname, "..", "..", ".temp", "short-pkg-dir-spec");
    beforeEach(() => {
      Fs.rmSync(tmpRoot, { recursive: true, force: true });
      Fs.mkdirSync(Path.join(tmpRoot, "node_modules", ".f"), { recursive: true });
    });
    afterAll(() => {
      Fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    const makeFyn = (envValue?: string) => {
      if (envValue === undefined) {
        delete process.env.FYN_SHORT_PKG_DIR;
      } else {
        process.env.FYN_SHORT_PKG_DIR = envValue;
      }
      return new Fyn({ opts: { cwd: tmpRoot, targetDir: "node_modules" } });
    };

    const fynJsonPath = () => Path.join(tmpRoot, "node_modules", ".f", ".fyn.json");

    it("writes shortPkgDir: false to .fyn.json by default", async () => {
      const fyn = makeFyn();
      await fyn.saveInstallConfig();
      const cfg = JSON.parse(Fs.readFileSync(fynJsonPath()).toString());
      expect(cfg.shortPkgDir).toBe(false);
    });

    it("writes shortPkgDir: true to .fyn.json when env var is set", async () => {
      const fyn = makeFyn("1");
      await fyn.saveInstallConfig();
      const cfg = JSON.parse(Fs.readFileSync(fynJsonPath()).toString());
      expect(cfg.shortPkgDir).toBe(true);
    });
  });
});
