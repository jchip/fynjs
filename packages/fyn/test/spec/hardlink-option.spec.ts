import { describe, it, beforeEach, afterEach, afterAll, expect } from "vitest";
import Fs from "fs";
import Path from "path";
import Fyn from "../../lib/fyn";

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
});
