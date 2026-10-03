import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import Fs from "fs";
import Os from "os";
import Path from "path";
import FynCentral from "../../lib/fyn-central";
import FileOps from "../../lib/util/file-ops";

// `hide` makes replicate take the JS path, as it does when reflink isn't installed.
// `fake` stands in for reflink's cloneFiles, and `fakeDir` for its cloneDir. Faking cloneFiles
// turns cloneDir off, so those tests reach cloneFiles.
type Fake = undefined | ((...a: any[]) => Promise<any>);
const reflinkMode = vi.hoisted(() => ({ hide: false, fake: undefined as Fake, fakeDir: undefined as Fake }));
vi.mock("../../lib/util/reflink", async importOriginal => {
  const mod = await importOriginal<typeof import("../../lib/util/reflink")>();
  return {
    ...mod,
    loadReflinkCloneFiles: async () => (reflinkMode.hide ? undefined : (reflinkMode.fake ?? (await mod.loadReflinkCloneFiles()))),
    loadReflinkCloneDir: async () =>
      reflinkMode.hide ? undefined : (reflinkMode.fakeDir ?? (reflinkMode.fake ? undefined : await mod.loadReflinkCloneDir()))
  };
});

//
// The central store is shared by every project on the machine.  fyn rewrites an installed
// package.json in place to stamp in _id and _from, so package.json is always copied and
// never linked: the rewrite must not land on the store copy.
//
// With @fynjs/reflink, other files are cloned where the filesystem supports reflinks, else
// hardlinked, else copied.  Without @fynjs/reflink they are hardlinked.  With hardlink off
// (--no-hardlink) they are never linked: @fynjs/reflink clones or copies, and the JS path's cloneFile
// asks for a reflink via COPYFILE_FICLONE, a real reflink on Linux btrfs/XFS and a plain copy
// otherwise.  Before any of that, reflink clones the whole package dir in one call where the
// filesystem can (APFS), so package.json there is a clone, which an in-place rewrite can't
// push into the store.
//
// In every mode, an existing destination is replaced, never written through: a package's
// install script can hardlink one installed file onto another (esbuild does), and writing
// through that link would corrupt the other package.
//
const tree = {
  "/": { "package.json": 1, "index.js": 1 },
  lib: { "/": { "util.js": 1 } }
};

/** a store holding one package, and an empty install dir */
function makeStore() {
  const root = Fs.realpathSync(Fs.mkdtempSync(Path.join(Os.tmpdir(), "fyn-central-")));
  const contentPath = Path.join(root, "store");
  const destDir = Path.join(root, "installed");

  const pkgDir = Path.join(contentPath, "package");
  Fs.mkdirSync(Path.join(pkgDir, "lib"), { recursive: true });
  Fs.mkdirSync(destDir, { recursive: true });

  const storePkgJson = Path.join(pkgDir, "package.json");
  Fs.writeFileSync(storePkgJson, `${JSON.stringify({ name: "pkg-a", version: "1.0.0" }, null, 2)}\n`);
  Fs.writeFileSync(Path.join(pkgDir, "index.js"), "module.exports = 1;\n");
  Fs.writeFileSync(Path.join(pkgDir, "lib", "util.js"), "module.exports = 2;\n");

  return { root, contentPath, destDir, storePkgJson };
}

function makeCentral(
  root: string,
  contentPath: string,
  hardlink?: boolean,
  copyFallback?: boolean,
  reflink?: boolean
) {
  const central: any = new FynCentral({
    centralDir: Path.join(root, "central"),
    hardlink,
    copyFallback,
    reflink
  });
  central.getInfo = async () => ({ contentPath, tree });
  return central;
}

// "reflink" falls back to the JS path where @fynjs/reflink isn't installed. With reflink and
// hardlink on, a file is cloned or linked depending on the filesystem, so `linked` is unknown.
const modes = [
  { name: "hardlink (default), js", hardlink: undefined, hideReflink: true, linked: true },
  { name: "hardlink off, js", hardlink: false, hideReflink: true, linked: false },
  { name: "hardlink (default), reflink", hardlink: undefined, hideReflink: false, linked: undefined },
  { name: "hardlink off, reflink", hardlink: false, hideReflink: false, linked: false }
];

describe.each(modes)("fyn-central replicate: $name", ({ hardlink, hideReflink, linked }) => {
  beforeEach(() => {
    reflinkMode.hide = hideReflink;
  });

  let root: string;
  let contentPath: string;
  let storePkgJson: string;
  let destDir: string;

  beforeEach(() => {
    ({ root, contentPath, destDir, storePkgJson } = makeStore());
  });

  afterEach(() => {
    Fs.rmSync(root, { recursive: true, force: true });
  });

  const replicate = () => makeCentral(root, contentPath, hardlink).replicate("sha512-test", destDir);

  it("replicates the package contents", async () => {
    await replicate();

    expect(Fs.readFileSync(Path.join(destDir, "index.js"), "utf8")).toBe("module.exports = 1;\n");
    expect(Fs.readFileSync(Path.join(destDir, "lib", "util.js"), "utf8")).toBe("module.exports = 2;\n");
    expect(JSON.parse(Fs.readFileSync(Path.join(destDir, "package.json"), "utf8")).name).toBe("pkg-a");
  });

  it("never links package.json into the store", async () => {
    await replicate();

    const src = Path.join(contentPath, "package", "package.json");
    expect(Fs.statSync(src).nlink).toBe(1);
    expect(Fs.statSync(Path.join(destDir, "package.json")).ino).not.toBe(Fs.statSync(src).ino);
  });

  it.runIf(linked !== undefined)(`${linked ? "links" : "does not link"} the other files to the store`, async () => {
    await replicate();

    for (const rel of ["index.js", Path.join("lib", "util.js")]) {
      const src = Path.join(contentPath, "package", rel);
      const dest = Path.join(destDir, rel);
      expect(Fs.statSync(dest).ino === Fs.statSync(src).ino, rel).toBe(linked);
    }
  });

  it("never writes through an existing destination hardlinked to another file", async () => {
    // what esbuild's postinstall leaves behind: the installed launcher is the platform binary
    const other = Path.join(root, "platform-binary");
    Fs.writeFileSync(other, "native-binary");
    Fs.linkSync(other, Path.join(destDir, "index.js"));

    await replicate();

    expect(Fs.readFileSync(other, "utf8")).toBe("native-binary");
    expect(Fs.readFileSync(Path.join(destDir, "index.js"), "utf8")).toBe("module.exports = 1;\n");
  });

  it("leaves the store manifest untouched when the installed one is rewritten in place", async () => {
    const storeBefore = Fs.readFileSync(storePkgJson, "utf8");

    await replicate();

    // what _savePkgJson does: rewrite the installed manifest in place, adding _id/_from
    const installed = Path.join(destDir, "package.json");
    const pkg = JSON.parse(Fs.readFileSync(installed, "utf8"));
    pkg._id = "pkg-a@1.0.0";
    pkg._from = "pkg-a@^1.0.0";
    const fd = Fs.openSync(installed, "r+");
    const data = Buffer.from(`${JSON.stringify(pkg, null, 2)}\n`);
    Fs.writeSync(fd, data, 0, data.length, 0);
    Fs.ftruncateSync(fd, data.length);
    Fs.closeSync(fd);

    expect(Fs.readFileSync(storePkgJson, "utf8")).toBe(storeBefore);
  });
});

describe("fyn-central replicate: reflink call", () => {
  let root: string;
  let contentPath: string;
  let destDir: string;

  beforeEach(() => {
    ({ root, contentPath, destDir } = makeStore());
    reflinkMode.hide = false;
  });

  afterEach(() => {
    reflinkMode.fake = undefined;
    Fs.rmSync(root, { recursive: true, force: true });
  });

  it.each([undefined, false])("passes hardlink (%s) to reflink, and never for package.json", async hardlink => {
    const fake = vi.fn(async () => ({}));
    reflinkMode.fake = fake;
    await makeCentral(root, contentPath, hardlink).replicate("sha512-test", destDir);

    const srcDir = Path.join(contentPath, "package");
    const others = [Path.join("lib", "util.js"), "index.js"];
    expect(fake).toHaveBeenCalledTimes(2);
    expect(fake).toHaveBeenCalledWith(srcDir, destDir, expect.arrayContaining(others), hardlink !== false, true);
    expect(fake).toHaveBeenCalledWith(srcDir, destDir, ["package.json"], false, true);
  });

  it("passes copyFallback false to reflink for every file", async () => {
    const fake = vi.fn(async () => ({}));
    reflinkMode.fake = fake;
    await makeCentral(root, contentPath, false, false).replicate("sha512-test", destDir);

    expect(fake).toHaveBeenCalledTimes(2);
    for (const call of fake.mock.calls as unknown[][]) expect(call[4]).toBe(false);
  });
});

// One cloneDir per package where the filesystem can, in place of the empty install dir. A dir
// clone needs its dest to not exist.
describe("fyn-central replicate: dir clone", () => {
  let root: string;
  let contentPath: string;
  let destDir: string;
  const fakeFiles = vi.fn(async () => ({}));
  const copyDir = vi.fn(async (src: string, dest: string) => {
    Fs.cpSync(src, dest, { recursive: true });
    return true;
  });

  beforeEach(() => {
    ({ root, contentPath, destDir } = makeStore());
    reflinkMode.hide = false;
  });

  afterEach(() => {
    reflinkMode.fake = undefined;
    reflinkMode.fakeDir = undefined;
    fakeFiles.mockClear();
    copyDir.mockClear();
    Fs.rmSync(root, { recursive: true, force: true });
  });

  it("clones the whole package dir in place of the empty install dir", async () => {
    reflinkMode.fakeDir = copyDir;
    reflinkMode.fake = fakeFiles;
    await makeCentral(root, contentPath).replicate("sha512-test", destDir);

    expect(copyDir).toHaveBeenCalledWith(Path.join(contentPath, "package"), expect.stringContaining(`${destDir}.clone-`));
    expect(fakeFiles).not.toHaveBeenCalled();
    expect(Fs.readFileSync(Path.join(destDir, "lib", "util.js"), "utf8")).toBe("module.exports = 2;\n");
    expect(Fs.readdirSync(root).filter(f => f.includes(".clone-"))).toEqual([]);
  });

  it("clones files, and stops trying dirs, when the filesystem can't clone a dir", async () => {
    const noDir = vi.fn(async () => false);
    reflinkMode.fakeDir = noDir;
    reflinkMode.fake = fakeFiles;
    const central = makeCentral(root, contentPath);

    await central.replicate("sha512-test", destDir);
    expect(Fs.statSync(destDir).isDirectory()).toBe(true);
    expect(fakeFiles).toHaveBeenCalled();

    const destDir2 = Path.join(root, "installed2");
    Fs.mkdirSync(destDir2);
    await central.replicate("sha512-test", destDir2);
    expect(noDir).toHaveBeenCalledTimes(1);
  });

  it("drops its clone for the per-file path when the install dir gets files during the clone", async () => {
    // what a second extraction of the same package can do while this one clones
    reflinkMode.fakeDir = vi.fn(async (src: string, dest: string) => {
      Fs.writeFileSync(Path.join(destDir, "index.js"), "written meanwhile");
      return copyDir(src, dest);
    });
    reflinkMode.fake = fakeFiles;
    await makeCentral(root, contentPath).replicate("sha512-test", destDir);

    expect(fakeFiles).toHaveBeenCalled();
    expect(Fs.readdirSync(root).filter(f => f.includes(".clone-"))).toEqual([]);
  });

  it("never clones the dir with reflink off", async () => {
    reflinkMode.fakeDir = copyDir;
    await makeCentral(root, contentPath, undefined, undefined, false).replicate("sha512-test", destDir);
    expect(copyDir).not.toHaveBeenCalled();
  });
});

// --no-reflink skips @fynjs/reflink, since it always tries a clone first. package.json is copied: it is
// never linked, so with reflink off a copy is its only way in.
describe("fyn-central replicate: no reflink", () => {
  let root: string;
  let contentPath: string;
  let destDir: string;
  const fake = vi.fn(async () => ({}));

  beforeEach(() => {
    ({ root, contentPath, destDir } = makeStore());
    reflinkMode.hide = false;
    reflinkMode.fake = fake;
    fake.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    reflinkMode.fake = undefined;
    Fs.rmSync(root, { recursive: true, force: true });
  });

  const sameInode = (rel: string) =>
    Fs.statSync(Path.join(destDir, rel)).ino === Fs.statSync(Path.join(contentPath, "package", rel)).ino;

  it("hardlinks every file but package.json, without calling @fynjs/reflink, even with copies off", async () => {
    await makeCentral(root, contentPath, true, false, false).replicate("sha512-test", destDir);

    expect(fake).not.toHaveBeenCalled();
    expect(sameInode("index.js")).toBe(true);
    expect(sameInode(Path.join("lib", "util.js"))).toBe(true);
    expect(sameInode("package.json")).toBe(false);
  });

  it("fails when a file can't be hardlinked and copies are off", async () => {
    vi.spyOn(FileOps, "link").mockRejectedValue(Object.assign(new Error("EXDEV"), { code: "EXDEV" }));
    await expect(
      makeCentral(root, contentPath, true, false, false).replicate("sha512-test", destDir)
    ).rejects.toThrow(/can't replicate/);
  });

  it("copies with hardlink and reflink both off", async () => {
    await makeCentral(root, contentPath, false, true, false).replicate("sha512-test", destDir);

    expect(fake).not.toHaveBeenCalled();
    expect(sameInode("index.js")).toBe(false);
    expect(Fs.readFileSync(Path.join(destDir, "lib", "util.js"), "utf8")).toBe("module.exports = 2;\n");
  });
});

// --no-copy-fallback: a file that can't be cloned or hardlinked fails the install
describe("fyn-central replicate: no copy fallback, js", () => {
  let root: string;
  let contentPath: string;
  let destDir: string;

  beforeEach(() => {
    ({ root, contentPath, destDir } = makeStore());
    reflinkMode.hide = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Fs.rmSync(root, { recursive: true, force: true });
  });

  // libuv's COPYFILE_FICLONE_FORCE fails with ENOSYS on macOS
  it.runIf(process.platform === "darwin")("fails with hardlink off, where libuv can't clone", async () => {
    await expect(makeCentral(root, contentPath, false, false).replicate("sha512-test", destDir)).rejects.toThrow(
      /can't replicate/
    );
  });

  it.runIf(process.platform === "darwin")("fails when the filesystem can't hardlink", async () => {
    vi.spyOn(FileOps, "link").mockRejectedValue(Object.assign(new Error("EXDEV"), { code: "EXDEV" }));
    await expect(makeCentral(root, contentPath, true, false).replicate("sha512-test", destDir)).rejects.toThrow(
      /can't replicate/
    );
  });
});

describe("fyn-central replicate: hardlink fallback", () => {
  let root: string;
  let contentPath: string;
  let destDir: string;

  beforeEach(() => {
    ({ root, contentPath, destDir } = makeStore());
    // these mock fs.link, which only the JS path calls
    reflinkMode.hide = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Fs.rmSync(root, { recursive: true, force: true });
  });

  const linkErr = (code: string) => Object.assign(new Error(code), { code });
  const sameInode = (rel: string) =>
    Fs.statSync(Path.join(destDir, rel)).ino === Fs.statSync(Path.join(contentPath, "package", rel)).ino;

  it("copies, and stops trying links, when the filesystem can't hardlink", async () => {
    const link = vi.spyOn(FileOps, "link").mockRejectedValue(linkErr("EXDEV"));
    const central = makeCentral(root, contentPath);

    await central.replicate("sha512-test", destDir);
    expect(sameInode("index.js")).toBe(false);
    expect(Fs.readFileSync(Path.join(destDir, "lib", "util.js"), "utf8")).toBe("module.exports = 2;\n");

    const tried = link.mock.calls.length;
    await central.replicate("sha512-test", Path.join(root, "installed2"));
    expect(link.mock.calls.length).toBe(tried);
  });

  it("copies only the file that hit the link limit", async () => {
    const realLink = FileOps.link;
    vi.spyOn(FileOps, "link").mockImplementation((src: string, dest: string) =>
      src.endsWith("index.js") ? Promise.reject(linkErr("EMLINK")) : realLink(src, dest)
    );

    await makeCentral(root, contentPath).replicate("sha512-test", destDir);
    expect(sameInode("index.js")).toBe(false);
    expect(sameInode(Path.join("lib", "util.js"))).toBe(true);
  });

  it("fails on other link errors", async () => {
    vi.spyOn(FileOps, "link").mockRejectedValue(linkErr("EACCES"));
    await expect(makeCentral(root, contentPath).replicate("sha512-test", destDir)).rejects.toThrow(
      /can't replicate/
    );
  });
});
