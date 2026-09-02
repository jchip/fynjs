import { describe, it, beforeEach, afterEach, expect } from "vitest";
import Fs from "fs";
import Os from "os";
import Path from "path";
import FynCentral from "../../lib/fyn-central";

//
// The central store is shared by every project on the machine, so a replicated file must
// never be a hardlink back into it: fyn rewrites an installed package.json in place to
// stamp in _id and _from, and a package's own install scripts can rewrite anything else.
// Either would land on the store copy and corrupt it for unrelated projects (the FPM-52
// shape).  replicate() copies or CoW-clones, both of which are independent files.
//
// Note the invariant is "never link", not "copy rather than clone" - cloneFile is
// copy-on-write, so it is equally safe.  A test asserting copy-vs-clone passes even when
// the distinction is removed; this one fails when replicate is changed to hardlink, which
// is the plausible regression (someone saving disk space).  See FPM-80.
//
describe("fyn-central replicate", () => {
  let root: string;
  let contentPath: string;
  let storePkgJson: string;
  let destDir: string;

  const tree = {
    "/": { "package.json": 1, "index.js": 1 },
    lib: { "/": { "util.js": 1 } }
  };

  beforeEach(() => {
    root = Fs.realpathSync(Fs.mkdtempSync(Path.join(Os.tmpdir(), "fyn-central-")));
    contentPath = Path.join(root, "store");
    destDir = Path.join(root, "installed");

    const pkgDir = Path.join(contentPath, "package");
    Fs.mkdirSync(Path.join(pkgDir, "lib"), { recursive: true });
    Fs.mkdirSync(destDir, { recursive: true });

    storePkgJson = Path.join(pkgDir, "package.json");
    Fs.writeFileSync(storePkgJson, `${JSON.stringify({ name: "pkg-a", version: "1.0.0" }, null, 2)}\n`);
    Fs.writeFileSync(Path.join(pkgDir, "index.js"), "module.exports = 1;\n");
    Fs.writeFileSync(Path.join(pkgDir, "lib", "util.js"), "module.exports = 2;\n");
  });

  afterEach(() => {
    Fs.rmSync(root, { recursive: true, force: true });
  });

  const replicate = async () => {
    const central: any = new FynCentral({ centralDir: Path.join(root, "central") });
    central.getInfo = async () => ({ contentPath, tree });
    await central.replicate("sha512-test", destDir);
  };

  it("replicates the package contents", async () => {
    await replicate();

    expect(Fs.readFileSync(Path.join(destDir, "index.js"), "utf8")).toBe("module.exports = 1;\n");
    expect(Fs.readFileSync(Path.join(destDir, "lib", "util.js"), "utf8")).toBe("module.exports = 2;\n");
    expect(JSON.parse(Fs.readFileSync(Path.join(destDir, "package.json"), "utf8")).name).toBe("pkg-a");
  });

  it("gives every replicated file its own inode, never a link into the store", async () => {
    await replicate();

    for (const rel of ["package.json", "index.js", Path.join("lib", "util.js")]) {
      const src = Path.join(contentPath, "package", rel);
      const dest = Path.join(destDir, rel);
      expect(Fs.statSync(src).nlink, `store copy of ${rel} is shared`).toBe(1);
      expect(Fs.statSync(dest).ino, `${rel} is linked to the store`).not.toBe(Fs.statSync(src).ino);
    }
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
