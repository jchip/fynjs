import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as Fs from "fs";
import * as Os from "os";
import * as Path from "path";
import { verify } from "run-verify";
import { prePack } from "../src/prepack.js";
import { postPack } from "../src/postpack.js";
import { metaFileOf, loadInfo } from "../src/utils.js";

//
// prepack prunes the manifest in place and postpack puts the original back.  They used to
// resolve the target independently, so a disagreement restored the backup over the wrong
// file and left the real one pruned.  prepack now records the path it modified (FPM-75).
//
describe("prepack/postpack round trip", () => {
  let root: string;
  let dir: string;
  let saveCwd: string;
  let saveFile: string;
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

  beforeEach(async () => {
    saveCwd = process.cwd();
    root = Fs.realpathSync(Fs.mkdtempSync(Path.join(Os.tmpdir(), "publish-util-rt-")));
    dir = Path.join(root, "pkg");
    writePkg(dir, manifest());
    ({ saveFile } = await loadInfo(Path.join(dir, "package.json")));
    for (const k of ["INIT_CWD", "npm_package_json", "npm_package_name", "npm_package_version", "PUBLISH_UTIL_PKG_DIR"]) {
      delete process.env[k];
    }
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(saveCwd);
    process.env = { ...saveEnv };
    try {
      Fs.rmSync(saveFile, { force: true });
      Fs.rmSync(metaFileOf(saveFile), { force: true });
    } finally {
      Fs.rmSync(root, { recursive: true, force: true });
    }
  });

  const createPackRun = () => {
    let needsPostPack = false;
    const prune = async () => {
      needsPostPack = true;
      await prePack();
    };
    const restore = async () => {
      await postPack();
      needsPostPack = false;
    };

    return {
      verify: verify({
        timeout: 2000,
        cleanup: async () => {
          if (!needsPostPack) return;
          process.chdir(dir);
          await restore();
        }
      }),
      prune,
      restore
    };
  };

  it("prunes on prepack and restores byte-identically on postpack", () => {
    const pkgFile = Path.join(dir, "package.json");
    const original = Fs.readFileSync(pkgFile, "utf8");
    const pack = createPackRun();

    return pack.verify
      .step(pack.prune)
      .step(() => {
        const pruned = JSON.parse(Fs.readFileSync(pkgFile, "utf8"));
        expect(pruned.myInternalField).toBeUndefined();
        expect(pruned.name).toBe("roundtrip-pkg");
      })
      .step(pack.restore)
      .step(() => expect(Fs.readFileSync(pkgFile, "utf8")).toBe(original));
  });

  it("records the manifest it modified, and cleans the sidecar up", () => {
    const pack = createPackRun();

    return pack.verify
      .step(pack.prune)
      .step(() => {
        const meta = JSON.parse(Fs.readFileSync(metaFileOf(saveFile), "utf8"));
        expect(meta.pkgFile).toBe(Path.join(dir, "package.json"));
        expect(meta.name).toBe("roundtrip-pkg");
      })
      .step(pack.restore)
      .step(() => {
        expect(Fs.existsSync(metaFileOf(saveFile))).toBe(false);
        expect(Fs.existsSync(saveFile)).toBe(false);
      });
  });

  it("restores the file prepack modified even when postpack resolves a different copy", () => {
    const packed = Path.join(dir, "package.json");
    const originalPacked = Fs.readFileSync(packed, "utf8");
    const pack = createPackRun();

    return pack.verify
      .step(pack.prune)
      .step(() => {
        // a second checkout of the same package - same name, so the same save file name
        const twin = Path.join(root, "twin");
        const twinFile = writePkg(twin, manifest({ version: "9.9.9" }));
        const originalTwin = Fs.readFileSync(twinFile, "utf8");
        process.chdir(twin);
        return { twinFile, originalTwin };
      })
      .keep.step(pack.restore)
      .step(({ twinFile, originalTwin }) => {
        expect(Fs.readFileSync(packed, "utf8")).toBe(originalPacked);
        expect(Fs.readFileSync(twinFile, "utf8")).toBe(originalTwin);
      });
  });

  it("falls back to the resolved path for a save file with no sidecar", () => {
    const pkgFile = Path.join(dir, "package.json");
    const original = Fs.readFileSync(pkgFile, "utf8");
    const pack = createPackRun();

    return pack.verify
      .step(pack.prune)
      .step(() => {
        // an older publish-util's prepack left no meta
        Fs.rmSync(metaFileOf(saveFile));
      })
      .step(pack.restore)
      .step(() => expect(Fs.readFileSync(pkgFile, "utf8")).toBe(original));
  });
});
