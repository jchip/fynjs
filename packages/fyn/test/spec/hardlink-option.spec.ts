import { describe, it, beforeEach, afterEach, afterAll, expect, vi } from "vitest";
import Fs from "fs";
import Path from "path";
import Fyn from "../../lib/fyn";
import FynCentral from "../../lib/fyn-central";
import FsOps from "../../lib/util/file-ops";

// each test picks whether @fynjs/reflink is loaded; it's absent unless a test sets it
const reflink = vi.hoisted(() => ({ cloneFiles: undefined as unknown, cloneDir: undefined as unknown }));
vi.mock("../../lib/util/reflink", () => ({
  loadReflinkCloneFiles: async () => reflink.cloneFiles,
  loadReflinkCloneDir: async () => reflink.cloneDir
}));

//
// The central store hardlinks by default. --no-hardlink or FYN_HARDLINK=false turns it off,
// and .fyn.json remembers that for later installs. Precedence: CLI or rc, then env, then
// .fyn.json, then on.
//
describe("hardlink option", function () {
  let saveEnv: string | undefined;
  beforeEach(() => {
    saveEnv = process.env.FYN_HARDLINK;
    delete process.env.FYN_HARDLINK;
  });
  afterEach(() => {
    if (saveEnv === undefined) {
      delete process.env.FYN_HARDLINK;
    } else {
      process.env.FYN_HARDLINK = saveEnv;
    }
  });

  const opts = { cwd: "/tmp/x", targetDir: "node_modules" };
  // `hardlink` is set only by --hardlink, --no-hardlink or rc; the CLI gives it no default
  const makeFyn = ({ hardlink, saved }: { hardlink?: boolean; saved?: boolean } = {}) => {
    const fyn: any = new Fyn({ opts: hardlink === undefined ? opts : { ...opts, hardlink } });
    if (saved !== undefined) {
      fyn._installConfig.hardlink = saved;
    }
    return fyn;
  };

  it("is on by default", () => {
    expect(makeFyn().hardlink).toBe(true);
  });

  it("FYN_HARDLINK=false turns it off", () => {
    process.env.FYN_HARDLINK = "false";
    expect(makeFyn().hardlink).toBe(false);
  });

  it("keeps the choice saved in .fyn.json when nothing else says otherwise", () => {
    expect(makeFyn({ saved: false }).hardlink).toBe(false);
  });

  it("lets the env override the saved choice", () => {
    process.env.FYN_HARDLINK = "true";
    expect(makeFyn({ saved: false }).hardlink).toBe(true);
  });

  it("lets the CLI override the env and the saved choice", () => {
    process.env.FYN_HARDLINK = "false";
    expect(makeFyn({ hardlink: true, saved: false }).hardlink).toBe(true);
    process.env.FYN_HARDLINK = "true";
    expect(makeFyn({ hardlink: false }).hardlink).toBe(false);
  });

  describe("saveInstallConfig persistence", () => {
    const tmpRoot = Path.join(__dirname, "..", "..", ".temp", "hardlink-option-spec");
    const fynJsonPath = () => Path.join(tmpRoot, "node_modules", ".f", ".fyn.json");

    beforeEach(() => {
      Fs.rmSync(tmpRoot, { recursive: true, force: true });
      Fs.mkdirSync(Path.join(tmpRoot, "node_modules", ".f"), { recursive: true });
    });
    afterAll(() => {
      Fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    const save = async (hardlink?: boolean) => {
      const fyn = new Fyn({ opts: { cwd: tmpRoot, targetDir: "node_modules", hardlink } });
      await fyn.saveInstallConfig();
      return JSON.parse(Fs.readFileSync(fynJsonPath(), "utf8")).hardlink;
    };

    it("writes hardlink: true by default", async () => {
      expect(await save()).toBe(true);
    });

    it("writes hardlink: false after --no-hardlink", async () => {
      expect(await save(false)).toBe(false);
    });

    it("keeps the saved centralDir when the store was never set up", async () => {
      const fyn: any = new Fyn({ opts: { cwd: tmpRoot, targetDir: "node_modules" } });
      fyn._installConfig.centralDir = "/saved/store";
      await fyn.saveInstallConfig();
      expect(JSON.parse(Fs.readFileSync(fynJsonPath(), "utf8")).centralDir).toBe("/saved/store");
    });
  });

  //
  // Copying out of the central store writes every file twice, so fyn skips the store when it
  // knows linking can't happen. .fyn.json still keeps the store dir.
  //
  describe("skipping a copy-only central store", () => {
    const tmpRoot = Path.join(__dirname, "..", "..", ".temp", "central-skip-spec");
    const centralDir = Path.join(tmpRoot, "store");
    let saveCentralEnv: string | undefined;
    let savePlatform: PropertyDescriptor;

    beforeEach(() => {
      Fs.rmSync(tmpRoot, { recursive: true, force: true });
      Fs.mkdirSync(Path.join(tmpRoot, "node_modules", ".f"), { recursive: true });
      saveCentralEnv = process.env.FYN_CENTRAL_DIR;
      process.env.FYN_CENTRAL_DIR = centralDir;
      savePlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
    });
    afterEach(() => {
      vi.restoreAllMocks();
      reflink.cloneFiles = undefined;
      Object.defineProperty(process, "platform", savePlatform);
      if (saveCentralEnv === undefined) {
        delete process.env.FYN_CENTRAL_DIR;
      } else {
        process.env.FYN_CENTRAL_DIR = saveCentralEnv;
      }
    });
    afterAll(() => {
      Fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    const setPlatform = (platform: string) =>
      Object.defineProperty(process, "platform", { ...savePlatform, value: platform });
    const init = async (hardlink?: boolean, more: Record<string, unknown> = {}) => {
      const fyn: any = new Fyn({ opts: { cwd: tmpRoot, targetDir: "node_modules", hardlink, ...more } });
      const central = await fyn._initCentralStore();
      await fyn.saveInstallConfig();
      const saved = JSON.parse(
        Fs.readFileSync(Path.join(tmpRoot, "node_modules", ".f", ".fyn.json"), "utf8")
      );
      return { central, savedDir: saved.centralDir };
    };

    it.each(["darwin", "win32"])("skips it on %s when hardlink is off", async platform => {
      setPlatform(platform);
      const { central, savedDir } = await init(false);
      expect(central).toBe(false);
      expect(savedDir).toBe(centralDir);
    });

    it.each(["darwin", "win32"])("keeps it on %s when hardlink is off and reflink clones", async platform => {
      setPlatform(platform);
      reflink.cloneFiles = async () => undefined;
      const { central } = await init(false);
      expect(central).toBeInstanceOf(FynCentral);
    });

    it("keeps it with --no-copy-fallback, so a file that can't clone fails the install", async () => {
      setPlatform("darwin");
      const { central } = await init(false, { copyFallback: false });
      expect(central).toBeInstanceOf(FynCentral);
    });

    it("skips it on any platform when hardlink and reflink are both off", async () => {
      setPlatform("linux");
      reflink.cloneFiles = async () => undefined;
      const { central, savedDir } = await init(false, { reflink: false });
      expect(central).toBe(false);
      expect(savedDir).toBe(centralDir);
    });

    it("keeps it on linux when hardlink is off, where copies may clone", async () => {
      setPlatform("linux");
      const { central } = await init(false);
      expect(central).toBeInstanceOf(FynCentral);
    });

    it("keeps it when hardlink is on and the store is on the project's volume", async () => {
      const { central, savedDir } = await init();
      expect(central).toBeInstanceOf(FynCentral);
      expect(savedDir).toBe(centralDir);
    });

    it("skips it when the store is on a different volume", async () => {
      const realStat = FsOps.stat;
      vi.spyOn(FsOps, "stat").mockImplementation(async (p: string) => {
        const st = await realStat(p);
        return p.startsWith(centralDir) ? { ...st, dev: st.dev + 1 } : st;
      });
      Fs.mkdirSync(centralDir, { recursive: true });
      const { central, savedDir } = await init();
      expect(central).toBe(false);
      expect(savedDir).toBe(centralDir);
    });
  });

  //
  // A new install uses the central store on macOS when @fynjs/reflink can clone dirs, and on
  // Linux when it can hardlink or clone.
  //
  describe("central store by default", () => {
    const tmpRoot = Path.join(__dirname, "..", "..", ".temp", "central-default-spec");
    const fynDir = Path.join(tmpRoot, ".fyn");
    const defaultDir = Path.join(fynDir, "_central-storage");
    let saveCentralEnv: string | undefined;
    let savePlatform: PropertyDescriptor;

    beforeEach(() => {
      Fs.rmSync(tmpRoot, { recursive: true, force: true });
      Fs.mkdirSync(Path.join(tmpRoot, "node_modules", ".f"), { recursive: true });
      saveCentralEnv = process.env.FYN_CENTRAL_DIR;
      delete process.env.FYN_CENTRAL_DIR;
      savePlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
      Object.defineProperty(process, "platform", { ...savePlatform, value: "darwin" });
      reflink.cloneDir = async () => true;
    });
    afterEach(() => {
      reflink.cloneDir = undefined;
      Object.defineProperty(process, "platform", savePlatform);
      if (saveCentralEnv === undefined) {
        delete process.env.FYN_CENTRAL_DIR;
      } else {
        process.env.FYN_CENTRAL_DIR = saveCentralEnv;
      }
    });
    afterAll(() => {
      Fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    const init = async (more: Record<string, unknown> = {}, savedDir?: string | false) => {
      const fyn: any = new Fyn({ opts: { cwd: tmpRoot, targetDir: "node_modules", fynDir, ...more } });
      if (savedDir !== undefined) {
        fyn._installConfig.centralDir = savedDir;
      }
      const central = await fyn._initCentralStore();
      await fyn.saveInstallConfig();
      const saved = JSON.parse(
        Fs.readFileSync(Path.join(tmpRoot, "node_modules", ".f", ".fyn.json"), "utf8")
      );
      return { central, savedDir: saved.centralDir };
    };

    it("uses the store for a new install", async () => {
      const { central, savedDir } = await init();
      expect(central).toBeInstanceOf(FynCentral);
      expect(savedDir).toBe(defaultDir);
    });

    it("keeps copying when .fyn.json saved centralDir false", async () => {
      const { central, savedDir } = await init({}, false);
      expect(central).toBe(false);
      expect(savedDir).toBe(false);
    });

    it("is off with --no-central-store", async () => {
      expect((await init({ centralStore: false })).central).toBe(false);
    });

    it("is off with --no-reflink", async () => {
      expect((await init({ reflink: false })).central).toBe(false);
    });

    it("is off when @fynjs/reflink can't load", async () => {
      reflink.cloneDir = undefined;
      expect((await init()).central).toBe(false);
    });

    describe("on linux", () => {
      beforeEach(() => {
        Object.defineProperty(process, "platform", { ...savePlatform, value: "linux" });
        reflink.cloneDir = undefined;
      });
      afterEach(() => {
        reflink.cloneFiles = undefined;
      });

      it("uses the store to hardlink without @fynjs/reflink", async () => {
        const { central, savedDir } = await init();
        expect(central).toBeInstanceOf(FynCentral);
        expect(savedDir).toBe(defaultDir);
      });

      it("keeps copying when .fyn.json saved centralDir false", async () => {
        expect((await init({}, false)).central).toBe(false);
      });

      it("is off with --no-hardlink and no @fynjs/reflink", async () => {
        expect((await init({ hardlink: false })).central).toBe(false);
      });

      it("clones with --no-hardlink when @fynjs/reflink loads", async () => {
        reflink.cloneFiles = async () => undefined;
        expect((await init({ hardlink: false })).central).toBeInstanceOf(FynCentral);
      });
    });

    it("is off on win32", async () => {
      Object.defineProperty(process, "platform", { ...savePlatform, value: "win32" });
      expect((await init()).central).toBe(false);
    });
  });
});
