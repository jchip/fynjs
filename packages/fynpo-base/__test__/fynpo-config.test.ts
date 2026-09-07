import { describe, it, expect, afterEach } from "vitest";
import os from "node:os";
import Path from "node:path";
import { promises as Fs } from "node:fs";
import { FynpoConfigManager } from "../src/fynpo-config.js";

/**
 * Each case gets its own mkdtemp directory: `import()` caches by URL, so reusing a path would
 * hand a later test the earlier test's config.
 */
describe("FynpoConfigManager", () => {
  const made: string[] = [];

  afterEach(async () => {
    for (const d of made.splice(0)) {
      await Fs.rm(d, { recursive: true, force: true });
    }
  });

  const dirWith = async (files: Record<string, string>) => {
    const dir = await Fs.mkdtemp(Path.join(os.tmpdir(), "fynpo-config-"));
    made.push(dir);
    for (const [name, content] of Object.entries(files)) {
      await Fs.writeFile(Path.join(dir, name), content);
    }
    return dir;
  };

  it("should load a CJS fynpo.config.js off its module.exports", async () => {
    const cwd = await dirWith({
      "fynpo.config.js": `module.exports = { packages: ["cjs-pkgs"] };`,
    });
    const mgr = new FynpoConfigManager({ cwd });

    expect(await mgr.load()).toEqual({ packages: ["cjs-pkgs"] });
    expect(mgr.repoType).toBe("fynpo monorepo");
    expect(mgr.topDir).toBe(cwd);
  });

  it("should load an ESM fynpo.config.js off its default export", async () => {
    const cwd = await dirWith({
      "package.json": `{ "name": "esm-cfg", "type": "module" }`,
      "fynpo.config.js": `export default { packages: ["esm-pkgs"] };`,
    });

    expect(await new FynpoConfigManager({ cwd }).load()).toEqual({ packages: ["esm-pkgs"] });
  });

  it("should load fynpo.config.json", async () => {
    const cwd = await dirWith({ "fynpo.config.json": `{ "packages": ["json-pkgs"] }` });

    expect(await new FynpoConfigManager({ cwd }).load()).toEqual({ packages: ["json-pkgs"] });
  });

  it("should prefer fynpo.config.js over fynpo.config.json", async () => {
    const cwd = await dirWith({
      "fynpo.config.js": `module.exports = { packages: ["from-js"] };`,
      "fynpo.config.json": `{ "packages": ["from-json"] }`,
    });

    expect(await new FynpoConfigManager({ cwd }).load()).toEqual({ packages: ["from-js"] });
  });

  it("should fall back to fynpo.json", async () => {
    const cwd = await dirWith({ "fynpo.json": `{ "packages": ["plain-fynpo"] }` });

    expect(await new FynpoConfigManager({ cwd }).load()).toEqual({ packages: ["plain-fynpo"] });
  });

  it("should surface a fynpo.config.js that throws rather than treating it as absent", async () => {
    const cwd = await dirWith({
      "fynpo.config.js": `throw new Error("bad config");`,
      // present so a silent fallback would be visible as this value instead of an error
      "fynpo.json": `{ "packages": ["should-not-reach"] }`,
    });

    await expect(new FynpoConfigManager({ cwd }).load()).rejects.toThrow("bad config");
  });

  it("should stop searching at a .no-fynpo marker", async () => {
    const cwd = await dirWith({
      ".no-fynpo": "",
      "fynpo.json": `{ "packages": ["ignored"] }`,
    });

    expect(await new FynpoConfigManager({ cwd }).load()).toBe(undefined);
  });

  describe("loadSync", () => {
    it("should load fynpo.json synchronously", async () => {
      const cwd = await dirWith({ "fynpo.json": `{ "packages": ["sync-pkgs"] }` });
      const mgr = new FynpoConfigManager({ cwd });

      expect(mgr.loadSync()).toEqual({ packages: ["sync-pkgs"] });
      expect(mgr.fileName).toBe("fynpo.json");
      expect(mgr.filePath).toBe(Path.join(cwd, "fynpo.json"));
      expect(mgr.topDir).toBe(cwd);
      expect(mgr.repoType).toBe("fynpo monorepo");
    });

    it("should load CJS fynpo.config.js synchronously", async () => {
      const cwd = await dirWith({
        "fynpo.config.js": `module.exports = { packages: ["cjs-sync"] };`,
      });
      const mgr = new FynpoConfigManager({ cwd });

      expect(mgr.loadSync()).toEqual({ packages: ["cjs-sync"] });
      expect(mgr.fileName).toBe("fynpo.config.js");
      expect(mgr.topDir).toBe(cwd);
    });

    it("should load lerna.json with allowLernaWithoutFynpo", async () => {
      const cwd = await dirWith({ "lerna.json": `{ "version": "1.0.0" }` });
      const mgr = new FynpoConfigManager({ cwd, allowLernaWithoutFynpo: true });

      expect(mgr.loadSync()).toEqual({ version: "1.0.0" });
      expect(mgr.fileName).toBe("lerna.json");
      expect(mgr.repoType).toBe("lerna monorepo");
    });

    it("should load explicit configPath synchronously", async () => {
      const cwd = await dirWith({ "custom-config.json": `{ "packages": ["custom"] }` });
      const mgr = new FynpoConfigManager({ cwd, configPath: "custom-config.json" });

      expect(mgr.loadSync()).toEqual({ packages: ["custom"] });
      expect(mgr.fileName).toBe("custom-config.json");
    });
  });
});
