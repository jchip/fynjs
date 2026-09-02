import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as Fs from "fs";
import * as Os from "os";
import * as Path from "path";
import { prePack } from "../src/prepack.ts";
import { postPack } from "../src/postpack.ts";
import { metaFileOf, loadInfo } from "../src/utils.ts";

//
// prepack prunes the manifest in place and postpack puts the original back.  They used to
// resolve the target independently, so a disagreement restored the backup over the wrong
// file and left the real one pruned.  prepack now records the path it modified (FPM-75).
//
describe("prepack/postpack round trip", () => {
  let root: string;
  let dir: string;
  let saveCwd: string;
  const saveEnv = { ...process.env };

  const manifest = (extra = {}) => ({
    name: "roundtrip-pkg",
    version: "1.0.0",
    main: "./index.js",
    myInternalField: { do: "not publish" },
    scripts: { prepack: "publish-util-prepack", postpack: "publish-util-postpack" },
    ...extra
  });

  const writePkg = (at: string, data: object) => {
    Fs.mkdirSync(at, { recursive: true });
    const file = Path.join(at, "package.json");
    Fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
    return file;
  };

  beforeEach(() => {
    saveCwd = process.cwd();
    root = Fs.realpathSync(Fs.mkdtempSync(Path.join(Os.tmpdir(), "publish-util-rt-")));
    dir = Path.join(root, "pkg");
    writePkg(dir, manifest());
    for (const k of ["INIT_CWD", "npm_package_json", "npm_package_name", "npm_package_version", "PUBLISH_UTIL_PKG_DIR"]) {
      delete process.env[k];
    }
    process.chdir(dir);
  });

  afterEach(async () => {
    process.chdir(saveCwd);
    process.env = { ...saveEnv };
    const { saveFile } = await loadInfo(Path.join(dir, "package.json")).catch(() => ({ saveFile: "" }) as never);
    if (saveFile) {
      Fs.rmSync(saveFile, { force: true });
      Fs.rmSync(metaFileOf(saveFile), { force: true });
    }
    Fs.rmSync(root, { recursive: true, force: true });
  });

  it("prunes on prepack and restores byte-identically on postpack", async () => {
    const pkgFile = Path.join(dir, "package.json");
    const original = Fs.readFileSync(pkgFile, "utf8");

    await prePack();

    const pruned = JSON.parse(Fs.readFileSync(pkgFile, "utf8"));
    expect(pruned.myInternalField).toBeUndefined();
    expect(pruned.name).toBe("roundtrip-pkg");

    await postPack();

    expect(Fs.readFileSync(pkgFile, "utf8")).toBe(original);
  });

  it("records the manifest it modified, and cleans the sidecar up", async () => {
    const { saveFile } = await loadInfo(Path.join(dir, "package.json"));

    await prePack();

    const meta = JSON.parse(Fs.readFileSync(metaFileOf(saveFile), "utf8"));
    expect(meta.pkgFile).toBe(Path.join(dir, "package.json"));
    expect(meta.name).toBe("roundtrip-pkg");

    await postPack();

    expect(Fs.existsSync(metaFileOf(saveFile))).toBe(false);
    expect(Fs.existsSync(saveFile)).toBe(false);
  });

  it("restores the file prepack modified even when postpack resolves a different copy", async () => {
    const packed = Path.join(dir, "package.json");
    const originalPacked = Fs.readFileSync(packed, "utf8");

    await prePack();

    // a second checkout of the same package - same name, so the same save file name
    const twin = Path.join(root, "twin");
    const twinFile = writePkg(twin, manifest({ version: "9.9.9" }));
    const originalTwin = Fs.readFileSync(twinFile, "utf8");
    process.chdir(twin);

    await postPack();

    expect(Fs.readFileSync(packed, "utf8")).toBe(originalPacked);
    expect(Fs.readFileSync(twinFile, "utf8")).toBe(originalTwin);
  });

  it("falls back to the resolved path for a save file with no sidecar", async () => {
    const pkgFile = Path.join(dir, "package.json");
    const original = Fs.readFileSync(pkgFile, "utf8");
    const { saveFile } = await loadInfo(pkgFile);

    await prePack();
    // an older publish-util's prepack left no meta
    Fs.rmSync(metaFileOf(saveFile));

    await postPack();

    expect(Fs.readFileSync(pkgFile, "utf8")).toBe(original);
  });
});
