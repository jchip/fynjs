import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fs from "fs";
import Path from "path";
import Fyn from "../../lib/fyn";
import ci from "ci-info";
import { link } from "../../lib/util/hard-link-dir";

describe("local package refresh", () => {
  let root: string;
  let src: string;
  let dest: string;
  let installedAt: number;
  const wasCI = ci.isCI;

  beforeEach(async () => {
    ci.isCI = false;
    const temp = Path.resolve(".temp");
    Fs.mkdirSync(temp, { recursive: true });
    root = Fs.mkdtempSync(Path.join(temp, "local-refresh-"));
    src = Path.join(root, "producer");
    dest = Path.join(root, "consumer/node_modules/local-pkg");
    Fs.mkdirSync(Path.join(src, "dist"), { recursive: true });
    Fs.writeFileSync(Path.join(src, "package.json"), JSON.stringify({
      name: "local-pkg", version: "1.0.0", files: ["dist"],
      scripts: { build: "build-placeholder" }
    }));
    Fs.writeFileSync(Path.join(src, ".gitignore"), "dist/\nscratch/\n");
    Fs.writeFileSync(Path.join(src, "dist/index.js"), "module.exports = 'old';\n");
    await link(src, dest, { sourceMaps: false });
    // Installed manifests are detached so fyn can stamp installation metadata.
    Fs.unlinkSync(Path.join(dest, "package.json"));
    Fs.writeFileSync(Path.join(dest, "package.json"), JSON.stringify({
      name: "local-pkg", version: "1.0.0", _id: "local-pkg@1.0.0-fynlocal_h"
    }));
    installedAt = Date.now() + 1000;
  });

  afterEach(() => {
    ci.isCI = wasCI;
    vi.unstubAllEnvs();
    Fs.rmSync(root, { recursive: true, force: true });
  });

  const makeFyn = () => {
    const fyn = Object.create(Fyn.prototype) as Fyn;
    fyn._cwd = Path.join(root, "consumer");
    fyn._installConfig = {
      time: installedAt,
      localPkgLinks: { "node_modules/local-pkg": { srcDir: "../producer" } }
    };
    return fyn;
  };

  it("refreshes replaced dist files even after an earlier no-change check advanced the timestamp", async () => {
    expect(await makeFyn().checkLocalPkgFromInstallConfigNeedInstall()).toBe(false);
    const file = Path.join(src, "dist/index.js");
    Fs.unlinkSync(file);
    Fs.writeFileSync(file, "module.exports = 'new';\n");
    expect(Fs.readFileSync(Path.join(dest, "dist/index.js"), "utf8")).toContain("'old'");

    const fyn = makeFyn();
    expect((await fyn.getLocalPkgInstall(src)).changed).toBe(false);
    expect(await fyn.checkLocalPkgFromInstallConfigNeedInstall()).toBe(true);

    await link(src, dest, { sourceMaps: false });
    expect(Fs.readFileSync(Path.join(dest, "dist/index.js"), "utf8")).toContain("'new'");
    expect(await makeFyn().checkLocalPkgFromInstallConfigNeedInstall()).toBe(false);
  });

  it("refreshes added packaged files without scheduling a source build", async () => {
    Fs.writeFileSync(Path.join(src, "dist/added.js"), "module.exports = 2;\n");
    const fyn = makeFyn();
    expect((await fyn.getLocalPkgInstall(src)).localBuild).toBe(false);
    expect(await fyn.checkLocalPkgFromInstallConfigNeedInstall()).toBe(true);
  });

  it("refreshes a missing installed output", async () => {
    Fs.unlinkSync(Path.join(dest, "dist/index.js"));
    expect(await makeFyn().checkLocalPkgFromInstallConfigNeedInstall()).toBe(true);
  });

  it("compares packaged symlink targets without following them", async () => {
    vi.stubEnv("FYN_LOCAL_PACK_SYMLINKS", "true");
    const alias = Path.join(src, "dist/alias.js");
    Fs.symlinkSync("index.js", alias);
    await link(src, dest, { sourceMaps: false });
    expect(await makeFyn().checkLocalPkgFromInstallConfigNeedInstall()).toBe(false);

    Fs.unlinkSync(alias);
    Fs.symlinkSync("./index.js", alias);
    expect(await makeFyn().checkLocalPkgFromInstallConfigNeedInstall()).toBe(true);
  });

  it("ignores generated files outside the package contents", async () => {
    Fs.mkdirSync(Path.join(src, "scratch"));
    const file = Path.join(src, "scratch/output.js");
    Fs.writeFileSync(file, "generated\n");
    const newer = new Date(installedAt + 1000);
    Fs.utimesSync(file, newer, newer);
    expect(await makeFyn().checkLocalPkgFromInstallConfigNeedInstall()).toBe(false);
  });

  it("does not reinstall for rewritten or omitted JavaScript source maps", async () => {
    Fs.writeFileSync(Path.join(src, "dist/index.js"), "module.exports = 1;\n//# sourceMappingURL=index.js.map\n");
    Fs.writeFileSync(Path.join(src, "dist/index.js.map"), JSON.stringify({
      version: 3, sources: ["../src/index.ts"], mappings: ""
    }));
    Fs.writeFileSync(Path.join(src, "dist/unused.js.map"), "{}");
    await link(src, dest, { sourceMaps: false });
    expect(Fs.statSync(Path.join(src, "dist/index.js.map")).ino)
      .not.toBe(Fs.statSync(Path.join(dest, "dist/index.js.map")).ino);
    expect(Fs.existsSync(Path.join(dest, "dist/unused.js.map"))).toBe(false);
    expect(await makeFyn().checkLocalPkgFromInstallConfigNeedInstall()).toBe(false);
  });

  it("does not reinstall copied files with generated source-map annotations", async () => {
    vi.stubEnv("FYN_LOCAL_COPY_MODE", "true");
    await link(src, dest, { sourceMaps: true });
    expect(Fs.readFileSync(Path.join(dest, "dist/index.js"), "utf8")).toContain("sourceMappingURL");
    expect(Fs.readFileSync(Path.join(src, "dist/index.js"), "utf8")).not.toContain("sourceMappingURL");
    expect(await makeFyn().checkLocalPkgFromInstallConfigNeedInstall()).toBe(false);

    const file = Path.join(src, "dist/index.js");
    Fs.writeFileSync(file, "module.exports = 'new';\n");
    const newer = new Date(installedAt + 1000);
    Fs.utimesSync(file, newer, newer);
    expect(await makeFyn().checkLocalPkgFromInstallConfigNeedInstall()).toBe(true);
  });
});
