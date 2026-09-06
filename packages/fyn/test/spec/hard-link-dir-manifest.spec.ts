import { describe, it, beforeEach, afterEach, expect } from "vitest";
import Fs from "fs";
import Path from "path";
import Os from "os";

import { generatePackTree, link, cleanExtraDest } from "../../lib/util/hard-link-dir";

//
// FPM-124: an installed copy of a local package lost its package.json and fyn still exited 0.
// The mechanism, reproduced in "silently drops package.json" below: when a package's manifest
// cannot be read at that instant, npm-packlist does NOT throw - it returns a different list
// that omits package.json (and ignores `files`). linkPackTree then treats every destination
// entry not on that list as extra and deletes it, manifest included. Node's ESM resolver
// cannot classify the resulting directory at all: it falls back to legacyMainResolve, looks
// for index.js, and every import fails with ERR_MODULE_NOT_FOUND.
//
describe("hard-link-dir manifest protection", () => {
  let tmp: string;

  const writePkg = (dir: string) => {
    Fs.mkdirSync(Path.join(dir, "dist"), { recursive: true });
    Fs.writeFileSync(Path.join(dir, "dist", "index.js"), "export default 1;\n");
    Fs.writeFileSync(Path.join(dir, "README.md"), "readme\n");
    Fs.writeFileSync(
      Path.join(dir, "package.json"),
      JSON.stringify({ name: "probe-pkg", version: "1.0.0", main: "./dist/index.js", files: ["dist"] })
    );
  };

  beforeEach(() => {
    tmp = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fyn-hld-"));
  });

  afterEach(() => {
    Fs.rmSync(tmp, { recursive: true, force: true });
  });

  describe("generatePackTree", () => {
    it("should reject a pack list that has no package.json", async () => {
      const src = Path.join(tmp, "src");
      writePkg(src);
      Fs.unlinkSync(Path.join(src, "package.json"));

      await expect(generatePackTree(src)).rejects.toThrow(/has no package\.json/);
    });

    it("should accept a normal package, so the guard does not fire on valid input", async () => {
      const src = Path.join(tmp, "src");
      writePkg(src);

      const tree = await generatePackTree(src);
      expect(tree).toBeDefined();
    });

    it("silently drops package.json from the pack list when the manifest is unreadable", async () => {
      // pins the upstream behavior the guard exists for - if npm-packlist ever starts throwing
      // here instead, the guard is redundant and this test says so
      const src = Path.join(tmp, "src");
      writePkg(src);
      Fs.unlinkSync(Path.join(src, "package.json"));

      const npmPacklist = (await import("npm-packlist")).default;
      const Arborist = (await import("@npmcli/arborist")).default;
      const files = await npmPacklist(await new Arborist({ path: src }).loadActual(), {});

      expect(files).not.toContain("package.json");
    });
  });

  describe("link", () => {
    it("should leave an existing dest package.json in place when the source manifest is gone", async () => {
      const src = Path.join(tmp, "src");
      const dest = Path.join(tmp, "dest");
      writePkg(src);

      await link(src, dest);
      expect(Fs.existsSync(Path.join(dest, "package.json"))).toBe(true);

      // the FPM-124 window: manifest unreadable while a re-link runs
      Fs.unlinkSync(Path.join(src, "package.json"));

      const outcome = await link(src, dest).then(
        () => "resolved",
        (err: Error) => err
      );

      // assert the property that actually matters FIRST, so it is checked even if the throw
      // is the part that regresses - the manifest surviving is the point, not the error
      expect(Fs.existsSync(Path.join(dest, "package.json"))).toBe(true);
      expect(outcome).toBeInstanceOf(Error);
      expect((outcome as Error).message).toMatch(/has no package\.json/);
    });
  });

  describe("cleanExtraDest", () => {
    it("should refuse to remove package.json at the package root", async () => {
      const dest = Path.join(tmp, "dest");
      Fs.mkdirSync(dest, { recursive: true });
      Fs.writeFileSync(Path.join(dest, "package.json"), "{}");
      Fs.writeFileSync(Path.join(dest, "stale.js"), "1");

      await cleanExtraDest(dest, { "package.json": false, "stale.js": false }, true);

      expect(Fs.existsSync(Path.join(dest, "package.json"))).toBe(true);
      expect(Fs.existsSync(Path.join(dest, "stale.js"))).toBe(false);
    });

    it("should still remove a package.json below the root, which is ordinary content", async () => {
      // scoped deliberately: a nested manifest (a `{"type":"commonjs"}` shield, say) is part of
      // the package's own file list, so a stale one left behind would change module resolution
      const dest = Path.join(tmp, "sub");
      Fs.mkdirSync(dest, { recursive: true });
      Fs.writeFileSync(Path.join(dest, "package.json"), "{}");

      await cleanExtraDest(dest, { "package.json": false }, false);

      expect(Fs.existsSync(Path.join(dest, "package.json"))).toBe(false);
    });
  });
});
