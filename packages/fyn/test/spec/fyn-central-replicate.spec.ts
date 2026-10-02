import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import Fs from "fs";
import Os from "os";
import Path from "path";
import FynCentral from "../../lib/fyn-central";
import FileOps from "../../lib/util/file-ops";

//
// The central store is shared by every project on the machine.  fyn rewrites an installed
// package.json in place to stamp in _id and _from, so package.json is always copied and
// never linked: the rewrite must not land on the store copy.
//
// Other files are hardlinked by default.  With hardlink off (--no-hardlink), cloneFile asks
// for a reflink via COPYFILE_FICLONE: a real reflink on Linux btrfs/XFS, a plain copy
// otherwise.  Either way the result is independent of the store.
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

function makeCentral(root: string, contentPath: string, hardlink?: boolean) {
  const central: any = new FynCentral({ centralDir: Path.join(root, "central"), hardlink });
  central.getInfo = async () => ({ contentPath, tree });
  return central;
}

const modes = [
  { name: "hardlink (default)", hardlink: undefined, linked: true },
  { name: "hardlink off", hardlink: false, linked: false }
];

describe.each(modes)("fyn-central replicate: $name", ({ hardlink, linked }) => {
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

  it(`${linked ? "links" : "does not link"} the other files to the store`, async () => {
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

describe("fyn-central replicate: hardlink fallback", () => {
  let root: string;
  let contentPath: string;
  let destDir: string;

  beforeEach(() => {
    ({ root, contentPath, destDir } = makeStore());
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
