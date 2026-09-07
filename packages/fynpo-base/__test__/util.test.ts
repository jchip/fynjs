import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeJson, writeJsonSync, readJson, readJsonSync, readPkgJson } from "../src/util.js";
import Fs from "fs";
import Path from "path";
import Os from "os";

describe("JSON I/O utilities", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fynpo-base-util-"));
  });

  afterEach(() => {
    Fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── writeJson (async) ───────────────────────────────────────────────────────

  describe("writeJson", () => {
    it("writes pretty-printed JSON with trailing newline", async () => {
      const file = Path.join(tmpDir, "out.json");
      await writeJson(file, { name: "test", version: "1.0.0" });

      const raw = Fs.readFileSync(file, "utf-8");
      expect(raw).toBe('{\n  "name": "test",\n  "version": "1.0.0"\n}\n');
    });

    it("handles arrays", async () => {
      const file = Path.join(tmpDir, "arr.json");
      await writeJson(file, [1, 2, 3]);

      const raw = Fs.readFileSync(file, "utf-8");
      expect(raw).toBe("[\n  1,\n  2,\n  3\n]\n");
    });

    it("handles null and primitives", async () => {
      const file = Path.join(tmpDir, "null.json");
      await writeJson(file, null);
      expect(Fs.readFileSync(file, "utf-8")).toBe("null\n");
    });

    it("overwrites an existing file", async () => {
      const file = Path.join(tmpDir, "overwrite.json");
      await writeJson(file, { a: 1 });
      await writeJson(file, { b: 2 });

      expect(JSON.parse(Fs.readFileSync(file, "utf-8"))).toEqual({ b: 2 });
    });
  });

  // ── writeJsonSync ───────────────────────────────────────────────────────────

  describe("writeJsonSync", () => {
    it("writes pretty-printed JSON with trailing newline", () => {
      const file = Path.join(tmpDir, "sync.json");
      writeJsonSync(file, { hello: "world" });

      const raw = Fs.readFileSync(file, "utf-8");
      expect(raw).toBe('{\n  "hello": "world"\n}\n');
    });
  });

  // ── readJson (async) ───────────────────────────────────────────────────────

  describe("readJson", () => {
    it("reads and parses a JSON file", async () => {
      const file = Path.join(tmpDir, "read.json");
      Fs.writeFileSync(file, '{"x": 42}');

      const data = await readJson<{ x: number }>(file);
      expect(data).toEqual({ x: 42 });
    });

    it("throws on missing file", async () => {
      await expect(readJson(Path.join(tmpDir, "nope.json"))).rejects.toThrow();
    });

    it("throws on invalid JSON", async () => {
      const file = Path.join(tmpDir, "bad.json");
      Fs.writeFileSync(file, "not json");

      await expect(readJson(file)).rejects.toThrow();
    });
  });

  // ── readJsonSync ────────────────────────────────────────────────────────────

  describe("readJsonSync", () => {
    it("reads and parses a JSON file synchronously", () => {
      const file = Path.join(tmpDir, "sync-read.json");
      Fs.writeFileSync(file, '{"y": true}');

      expect(readJsonSync(file)).toEqual({ y: true });
    });

    it("throws on missing file", () => {
      expect(() => readJsonSync(Path.join(tmpDir, "nope.json"))).toThrow();
    });
  });

  // ── readPkgJson ─────────────────────────────────────────────────────────────

  describe("readPkgJson", () => {
    it("reads package.json from a directory", async () => {
      const pkgDir = Path.join(tmpDir, "my-pkg");
      Fs.mkdirSync(pkgDir);
      Fs.writeFileSync(
        Path.join(pkgDir, "package.json"),
        JSON.stringify({ name: "my-pkg", version: "2.0.0" })
      );

      const pkg = await readPkgJson(pkgDir);
      expect(pkg.name).toBe("my-pkg");
      expect(pkg.version).toBe("2.0.0");
    });

    it("throws when directory has no package.json", async () => {
      await expect(readPkgJson(tmpDir)).rejects.toThrow();
    });
  });

  // ── round-trip ──────────────────────────────────────────────────────────────

  describe("round-trip", () => {
    it("writeJson → readJson preserves data", async () => {
      const file = Path.join(tmpDir, "round.json");
      const original = { name: "pkg", deps: { a: "^1.0.0" }, list: [1, 2] };
      await writeJson(file, original);

      expect(await readJson(file)).toEqual(original);
    });

    it("writeJsonSync → readJsonSync preserves data", () => {
      const file = Path.join(tmpDir, "round-sync.json");
      const original = { nested: { deep: true } };
      writeJsonSync(file, original);

      expect(readJsonSync(file)).toEqual(original);
    });
  });
});
