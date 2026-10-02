import { describe, it, beforeEach, afterEach, afterAll, expect, vi } from "vitest";
import Fs from "fs";
import Path from "path";
import Fyn from "../../lib/fyn";
import FynCentral from "../../lib/fyn-central";
import FsOps from "../../lib/util/file-ops";

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
    const init = async (hardlink?: boolean) => {
      const fyn: any = new Fyn({ opts: { cwd: tmpRoot, targetDir: "node_modules", hardlink } });
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
});
