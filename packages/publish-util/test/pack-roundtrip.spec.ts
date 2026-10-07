import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as Fs from "fs";
import * as Os from "os";
import * as Path from "path";
import { verify } from "run-verify";
import { spawnSync } from "child_process";
import { prePack, prePackObj } from "../src/prepack.js";
import { postPack } from "../src/postpack.js";
import { metaFileOf, loadInfo, packOwner } from "../src/utils.js";

// lets a test keep its backup, meta and lock files out of the real temp dir
const tmp = vi.hoisted(() => ({ dir: undefined as string | undefined }));
vi.mock("os", async importOriginal => {
  const actual = await importOriginal<typeof import("os")>();
  return { ...actual, tmpdir: () => tmp.dir ?? actual.tmpdir() };
});

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

  it("preserves the original across overlapping pack lifecycles", async () => {
    const pkgFile = Path.join(dir, "package.json");
    const original = Fs.readFileSync(pkgFile, "utf8");
    vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });

    await prePack();
    await prePack();
    await postPack();
    expect(Fs.readFileSync(pkgFile, "utf8")).not.toBe(original);
    await postPack();

    expect(Fs.readFileSync(pkgFile, "utf8")).toBe(original);
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

//
// A killed pack leaves the backup and a meta file counting an active pack that will never
// run postpack. A prepack killed while it holds the pack lock also leaves the lock.
//
describe("recovery from an interrupted pack", () => {
  let root: string;
  let saveCwd: string;
  const saveEnv = { ...process.env };

  const manifest = (version = "1.0.0") => ({
    name: "recover-pkg",
    version,
    main: "./index.js",
    myInternalField: { do: "not publish" },
    scripts: { prepack: "publish-util-prepack", postpack: "publish-util-postpack" }
  });

  const writePkg = (at: string, data: object) => {
    Fs.mkdirSync(at, { recursive: true });
    const file = Path.join(at, "package.json");
    Fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
    return file;
  };

  const deadPid = () => spawnSync(process.execPath, ["-e", ""]).pid as number;

  // what a dead prepack leaves behind for pkgFile: backup, meta, lock and a pruned manifest.
  // With owners given, it is a pack killed after its prepack released the lock.
  const leaveInterruptedPrepack = async (pkgFile: string, activePacks = 1, owners?: number[]) => {
    const original = Fs.readFileSync(pkgFile, "utf8");
    const pkg = JSON.parse(original);
    const { saveFile } = await loadInfo(pkgFile);
    const pid = deadPid();
    Fs.writeFileSync(saveFile, original);
    Fs.writeFileSync(
      metaFileOf(saveFile),
      JSON.stringify({ pkgFile, name: pkg.name, version: pkg.version, pid, ts: "", activePacks, owners })
    );
    if (!owners) Fs.writeFileSync(`${saveFile}.lock`, `${pid}\n`);
    prePackObj(pkg, { silent: true });
    Fs.writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
    return { original, saveFile };
  };

  beforeEach(() => {
    saveCwd = process.cwd();
    root = Fs.realpathSync(Fs.mkdtempSync(Path.join(Os.tmpdir(), "publish-util-recover-")));
    for (const k of ["INIT_CWD", "npm_package_json", "npm_package_name", "npm_package_version", "PUBLISH_UTIL_PKG_DIR"]) {
      delete process.env[k];
    }
    tmp.dir = Path.join(root, "tmp");
    Fs.mkdirSync(tmp.dir);
    vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    tmp.dir = undefined;
    process.chdir(saveCwd);
    process.env = { ...saveEnv };
    Fs.rmSync(root, { recursive: true, force: true });
  });

  it("restores the manifest on the first postpack", () => {
    const pkgFile = writePkg(Path.join(root, "pkg"), manifest());
    process.chdir(Path.dirname(pkgFile));

    return verify({ timeout: 2000 })
      .step(() => leaveInterruptedPrepack(pkgFile))
      .keep.step(prePack)
      .keep.step(() => expect(JSON.parse(Fs.readFileSync(pkgFile, "utf8")).myInternalField).toBeUndefined())
      .keep.step(postPack)
      .keep.step(({ original }) => expect(Fs.readFileSync(pkgFile, "utf8")).toBe(original))
      .keep.step(({ saveFile }) => expect(Fs.existsSync(saveFile)).toBe(false))
      .keep.step(({ saveFile }) => expect(Fs.existsSync(metaFileOf(saveFile))).toBe(false))
      .step(({ saveFile }) => expect(Fs.existsSync(`${saveFile}.lock`)).toBe(false));
  });

  it("restores another checkout the dead prepack left pruned", () => {
    const twinFile = writePkg(Path.join(root, "twin"), manifest("9.9.9"));
    const pkgFile = writePkg(Path.join(root, "pkg"), manifest());
    const original = Fs.readFileSync(pkgFile, "utf8");
    process.chdir(Path.dirname(pkgFile));

    return verify({ timeout: 2000 })
      .step(() => leaveInterruptedPrepack(twinFile))
      .keep.step(prePack)
      .keep.step(twin => expect(Fs.readFileSync(twinFile, "utf8")).toBe(twin.original))
      .keep.step(() => expect(JSON.parse(Fs.readFileSync(pkgFile, "utf8")).myInternalField).toBeUndefined())
      .keep.step(postPack)
      .keep.step(() => expect(Fs.readFileSync(pkgFile, "utf8")).toBe(original))
      .step(twin => expect(Fs.readFileSync(twinFile, "utf8")).toBe(twin.original));
  });

  it("still joins when other packs had joined before the lock owner died", () => {
    const pkgFile = writePkg(Path.join(root, "pkg"), manifest());
    process.chdir(Path.dirname(pkgFile));

    return verify({ timeout: 2000 })
      .step(() => leaveInterruptedPrepack(pkgFile, 2))
      .keep.step(prePack)
      .step(({ saveFile }) => JSON.parse(Fs.readFileSync(metaFileOf(saveFile), "utf8")))
      .step(meta => expect(meta.activePacks).toBe(3));
  });

  const readMeta = (saveFile: string) => JSON.parse(Fs.readFileSync(metaFileOf(saveFile), "utf8"));

  it("records each active pack's owner", () => {
    const pkgFile = writePkg(Path.join(root, "pkg"), manifest());
    process.chdir(Path.dirname(pkgFile));

    return verify({ timeout: 2000 })
      .step(() => loadInfo(pkgFile))
      .keep.step(prePack)
      .keep.step(prePack)
      .keep.step(({ saveFile }) => expect(readMeta(saveFile).owners).toEqual([packOwner(), packOwner()]))
      .keep.step(postPack)
      .keep.step(({ saveFile }) => expect(readMeta(saveFile).owners).toEqual([packOwner()]))
      .step(postPack);
  });

  it("restores after a pack killed once its prepack released the lock", () => {
    const pkgFile = writePkg(Path.join(root, "pkg"), manifest());
    process.chdir(Path.dirname(pkgFile));

    return verify({ timeout: 2000 })
      .step(() => leaveInterruptedPrepack(pkgFile, 1, [deadPid()]))
      .keep.step(prePack)
      .keep.step(({ saveFile }) => expect(readMeta(saveFile).activePacks).toBe(1))
      .keep.step(postPack)
      .step(({ original }) => expect(Fs.readFileSync(pkgFile, "utf8")).toBe(original));
  });

  it("restores on postpack when the other pack that joined was killed", () => {
    const pkgFile = writePkg(Path.join(root, "pkg"), manifest());
    const original = Fs.readFileSync(pkgFile, "utf8");
    process.chdir(Path.dirname(pkgFile));

    return verify({ timeout: 2000 })
      .step(() => loadInfo(pkgFile))
      .keep.step(prePack)
      .keep.step(({ saveFile }) => {
        const meta = readMeta(saveFile);
        const joined = { ...meta, activePacks: 2, owners: [...meta.owners, deadPid()] };
        Fs.writeFileSync(metaFileOf(saveFile), JSON.stringify(joined));
      })
      .keep.step(postPack)
      .keep.step(() => expect(Fs.readFileSync(pkgFile, "utf8")).toBe(original))
      .step(({ saveFile }) => expect(Fs.existsSync(metaFileOf(saveFile))).toBe(false));
  });

  it("waits for an overlapping pack whose owner is alive", () => {
    const pkgFile = writePkg(Path.join(root, "pkg"), manifest());
    process.chdir(Path.dirname(pkgFile));

    // this test process stands in for another live packer
    return verify({ timeout: 2000 })
      .step(() => leaveInterruptedPrepack(pkgFile, 1, [process.pid]))
      .keep.step(prePack)
      .keep.step(({ saveFile }) => expect(readMeta(saveFile).owners).toEqual([process.pid, packOwner()]))
      .keep.step(postPack)
      .keep.step(({ saveFile }) => expect(readMeta(saveFile).owners).toEqual([process.pid]))
      .step(() => expect(JSON.parse(Fs.readFileSync(pkgFile, "utf8")).myInternalField).toBeUndefined());
  });
});
