import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as Fs from "fs";
import * as Os from "os";
import * as Path from "path";
import { getPackInfo, metaFileOf } from "../src/utils.ts";

//
// FPM-75: prepack/postpack used getInfo(), whose default cwd is INIT_CWD - the directory
// the user invoked the command from, not the package being packed.  In a monorepo pack of
// nine packages, all nine ran against the same unrelated manifest.
//
describe("getPackInfo", () => {
  let dir: string;
  let other: string;
  const saveEnv = { ...process.env };

  const writePkg = (at: string, name: string, version = "1.0.0") => {
    Fs.mkdirSync(at, { recursive: true });
    Fs.writeFileSync(Path.join(at, "package.json"), JSON.stringify({ name, version }, null, 2));
    return Path.join(at, "package.json");
  };

  beforeEach(() => {
    const root = Fs.realpathSync(Fs.mkdtempSync(Path.join(Os.tmpdir(), "publish-util-pack-")));
    dir = Path.join(root, "the-package");
    other = Path.join(root, "another-package");
    writePkg(dir, "the-package");
    writePkg(other, "another-package");
    for (const k of ["INIT_CWD", "npm_package_json", "npm_package_name", "npm_package_version", "PUBLISH_UTIL_PKG_DIR"]) {
      delete process.env[k];
    }
  });

  afterEach(() => {
    process.env = { ...saveEnv };
    Fs.rmSync(Path.dirname(dir), { recursive: true, force: true });
  });

  it("resolves from cwd when the runner sets no npm_ env", async () => {
    const info = await getPackInfo(dir);
    expect(info.pkgFile).toBe(Path.join(dir, "package.json"));
    expect(info.pkg.name).toBe("the-package");
  });

  it("ignores INIT_CWD, which points at the invocation dir and not the package", async () => {
    process.env.INIT_CWD = other;

    const info = await getPackInfo(dir);

    expect(info.pkgFile).toBe(Path.join(dir, "package.json"));
  });

  it("prefers npm_package_json when the runner provides it", async () => {
    process.env.npm_package_json = Path.join(other, "package.json");
    process.env.npm_package_name = "another-package";

    const info = await getPackInfo(dir);

    expect(info.pkgFile).toBe(Path.join(other, "package.json"));
  });

  it("refuses when npm_package_json disagrees with npm_package_name", async () => {
    // a stale inherited npm_package_json - the failure mode INIT_CWD had
    process.env.npm_package_json = Path.join(other, "package.json");
    process.env.npm_package_name = "the-package";

    await expect(getPackInfo(dir)).rejects.toThrow(/refusing to touch/);
  });

  it("refuses when the package found at cwd is not the one being packed", async () => {
    process.env.npm_package_name = "some-other-name";

    await expect(getPackInfo(dir)).rejects.toThrow(/refusing to touch/);
  });

  it("honors PUBLISH_UTIL_PKG_DIR over everything else", async () => {
    process.env.npm_package_json = Path.join(dir, "package.json");
    process.env.PUBLISH_UTIL_PKG_DIR = other;

    const info = await getPackInfo(dir);

    expect(info.pkgFile).toBe(Path.join(other, "package.json"));
  });

  it("does not second guess an explicit override with the runner's env", async () => {
    // the override exists for when detection is wrong, so the name check must not undo it
    process.env.npm_package_name = "the-package";
    process.env.PUBLISH_UTIL_PKG_DIR = other;

    const info = await getPackInfo(dir);

    expect(info.pkgFile).toBe(Path.join(other, "package.json"));
    expect(info.pkg.name).toBe("another-package");
  });

  it("names where it looked when nothing is found", async () => {
    const empty = Path.join(Path.dirname(dir), "empty");
    Fs.mkdirSync(empty, { recursive: true });
    process.env.PUBLISH_UTIL_PKG_DIR = empty;

    await expect(getPackInfo(dir)).rejects.toThrow(new RegExp(`looked in ${empty}`));
  });

  it("falls back to searching up when cwd has no package.json", async () => {
    const deep = Path.join(dir, "src", "nested");
    Fs.mkdirSync(deep, { recursive: true });

    const info = await getPackInfo(deep);

    expect(info.pkgFile).toBe(Path.join(dir, "package.json"));
  });

  it("names the meta sidecar next to the save file", () => {
    expect(metaFileOf("/tmp/package-util-x_pkg.json")).toBe("/tmp/package-util-x_pkg.json.meta.json");
  });
});
