import { describe, it } from "vitest";
import { expect } from "chai";
import Path from "path";
import fs from "fs";
import os from "os";
import ci from "ci-info";
import * as hardLinkDir from "../../../lib/util/hard-link-dir";
import Fs from "../../../lib/util/file-ops";

describe("hard-link-dir", function() {
  it("should hard link a package directory", () => {
    const destPath = Path.join(__dirname, "hard_link_mog_g");
    return Fs.mkdir(destPath)
      .catch(() => {})
      .then(() => {
        return hardLinkDir.link(Path.join(__dirname, "../../fixtures/mod-g"), destPath);
      })
      .finally(() => Fs.$.rimraf(destPath));
  });

  it("links non-JS source maps (.d.ts.map/.css.map) in non-CI mode", async () => {
    // the skip only applies in non-CI mode; force it so the test is deterministic
    const origIsCI = ci.isCI;
    (ci as any).isCI = false;

    const tmp = fs.mkdtempSync(Path.join(os.tmpdir(), "fyn-hld-"));
    const src = Path.join(tmp, "pkg");
    const dest = Path.join(tmp, "dest");
    const dist = Path.join(src, "dist");
    fs.mkdirSync(dist, { recursive: true });
    fs.writeFileSync(
      Path.join(src, "package.json"),
      JSON.stringify({ name: "hld-fixture", version: "1.0.0", files: ["dist"] })
    );
    fs.writeFileSync(
      Path.join(dist, "index.js"),
      "module.exports = 1;\n//# sourceMappingURL=index.js.map\n"
    );
    fs.writeFileSync(
      Path.join(dist, "index.js.map"),
      JSON.stringify({ version: 3, file: "index.js", sources: ["../src/index.ts"], mappings: "" })
    );
    fs.writeFileSync(Path.join(dist, "types.d.ts"), "export declare const x: number;\n");
    fs.writeFileSync(
      Path.join(dist, "types.d.ts.map"),
      JSON.stringify({ version: 3, file: "types.d.ts", sources: ["../src/index.ts"], mappings: "" })
    );
    fs.writeFileSync(
      Path.join(dist, "styles.css.map"),
      JSON.stringify({ version: 3, file: "styles.css", sources: ["../src/styles.css"], mappings: "" })
    );

    try {
      await hardLinkDir.link(src, dest);
      // non-JS maps must be present in the linked copy (previously dropped)
      expect(fs.existsSync(Path.join(dest, "dist/types.d.ts.map"))).to.equal(true);
      expect(fs.existsSync(Path.join(dest, "dist/styles.css.map"))).to.equal(true);
      // the .d.ts itself is linked too
      expect(fs.existsSync(Path.join(dest, "dist/types.d.ts"))).to.equal(true);
    } finally {
      (ci as any).isCI = origIsCI;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

//
// FPM-52. esbuild's postinstall deliberately hardlinks the platform binary onto the launcher
// path (install.js: linkSync(binPath, tempPath); renameSync(tempPath, toPath)). Harmless under
// npm. But copyFile and clonefile OPEN AND TRUNCATE an existing destination instead of
// replacing it, so once those two paths share an inode, the next replicate of the `esbuild`
// package writes its own ~1KB JS launcher straight through the link and onto
// @esbuild/<platform>/bin/esbuild. That launcher then resolves the platform binary path, finds
// itself, and spawns itself - the observed fork bomb.
//
describe("hard-link-dir - never writes through an existing hardlink (FPM-52)", function() {
  const withFixture = async (fn) => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "fpm52-"));
    try {
      const src = Path.join(dir, "store-content");
      const target = Path.join(dir, "esbuild-bin");
      const other = Path.join(dir, "platform-bin");

      fs.writeFileSync(src, "js-launcher-from-tarball");
      fs.writeFileSync(target, "native-binary");
      // the postinstall's hardlink
      fs.linkSync(target, other);

      expect(fs.statSync(target).ino).to.equal(fs.statSync(other).ino);

      await fn({ src, target, other });

      return {
        other: fs.readFileSync(other, "utf8"),
        target: fs.readFileSync(target, "utf8"),
        stillLinked: fs.statSync(target).ino === fs.statSync(other).ino
      };
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  it("cloneFile must not corrupt the linked sibling", async () => {
    const r = await withFixture(({ src, target }) => hardLinkDir.cloneFile(src, target));

    expect(r.target).to.equal("js-launcher-from-tarball");
    // the whole point: the other package's file is untouched
    expect(r.other).to.equal("native-binary");
    expect(r.stillLinked).to.equal(false);
  });

  it("copyFile must not corrupt the linked sibling", async () => {
    const r = await withFixture(({ src, target }) => hardLinkDir.copyFile(src, target));

    expect(r.target).to.equal("js-launcher-from-tarball");
    expect(r.other).to.equal("native-binary");
    expect(r.stillLinked).to.equal(false);
  });

  it("still writes correctly when the destination does not exist", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "fpm52-new-"));
    try {
      const src = Path.join(dir, "src");
      const dest = Path.join(dir, "sub-dest");
      fs.writeFileSync(src, "content");

      await hardLinkDir.cloneFile(src, dest);
      expect(fs.readFileSync(dest, "utf8")).to.equal("content");

      await hardLinkDir.copyFile(src, Path.join(dir, "dest2"));
      expect(fs.readFileSync(Path.join(dir, "dest2"), "utf8")).to.equal("content");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("overwrites an unlinked existing destination as before", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "fpm52-over-"));
    try {
      const src = Path.join(dir, "src");
      const dest = Path.join(dir, "dest");
      fs.writeFileSync(src, "new");
      fs.writeFileSync(dest, "old");

      await hardLinkDir.cloneFile(src, dest);
      expect(fs.readFileSync(dest, "utf8")).to.equal("new");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
