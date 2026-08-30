import { describe, it, expect } from "vitest";
import PkgPreper from "../src/index.ts";
import type { PkgPreperOptions } from "../src/index.ts";
import * as Path from "node:path";
import * as Fs from "node:fs";
import * as Os from "node:os";
import * as tar from "tar";

describe("PkgPreper", () => {
  it("should create an instance", () => {
    const options: PkgPreperOptions = {
      tmpDir: "/tmp",
      installDependencies: async (dir: string, message: string) => {
        return Promise.resolve();
      },
    };
    const preper = new PkgPreper(options);
    expect(preper).toBeInstanceOf(PkgPreper);
  });

  it("should have packDirectory method", () => {
    const options: PkgPreperOptions = {
      tmpDir: "/tmp",
      installDependencies: async (dir: string, message: string) => {
        return Promise.resolve();
      },
    };
    const preper = new PkgPreper(options);
    expect(typeof preper.packDirectory).toBe("function");
  });

  it("should have depDirPacker method", () => {
    const options: PkgPreperOptions = {
      tmpDir: "/tmp",
      installDependencies: async (dir: string, message: string) => {
        return Promise.resolve();
      },
    };
    const preper = new PkgPreper(options);
    expect(typeof preper.depDirPacker).toBe("function");
  });

  it("should have getDirPackerCb method", () => {
    const options: PkgPreperOptions = {
      tmpDir: "/tmp",
      installDependencies: async (dir: string, message: string) => {
        return Promise.resolve();
      },
    };
    const preper = new PkgPreper(options);
    expect(typeof preper.getDirPackerCb).toBe("function");
  });

  it("getDirPackerCb should return a function", () => {
    const options: PkgPreperOptions = {
      tmpDir: "/tmp",
      installDependencies: async (dir: string, message: string) => {
        return Promise.resolve();
      },
    };
    const preper = new PkgPreper(options);
    const cb = preper.getDirPackerCb();
    expect(typeof cb).toBe("function");
  });
});

describe("PkgPreper integration", () => {
  const makeTmpDir = () => Fs.mkdtempSync(Path.join(Os.tmpdir(), "pkg-preper-test-"));

  const makeFixturePkg = (base: string) => {
    const dir = Path.join(base, "fixture-pkg");
    Fs.mkdirSync(dir, { recursive: true });
    Fs.writeFileSync(
      Path.join(dir, "package.json"),
      JSON.stringify({ name: "fixture-pkg", version: "1.0.0" }),
    );
    Fs.writeFileSync(Path.join(dir, "index.js"), "module.exports = 42;\n");
    Fs.writeFileSync(Path.join(dir, "ignore-me.log"), "should be excluded by npm-debug rules\n");
    return dir;
  };

  it("packDirectory should create a tgz with packlist files", async () => {
    const base = makeTmpDir();
    try {
      const dir = makeFixturePkg(base);
      const preper = new PkgPreper({
        tmpDir: Path.join(base, "tmp"),
        installDependencies: async () => undefined,
      });
      const target = Path.join(base, "out.tgz");
      await preper.packDirectory({}, dir, target);
      expect(Fs.existsSync(target)).toBe(true);

      const entries: string[] = [];
      await tar.list({
        file: target,
        onReadEntry: (entry) => {
          entries.push(entry.path);
        },
      });
      expect(entries).toContain("package/package.json");
      expect(entries).toContain("package/index.js");
    } finally {
      Fs.rmSync(base, { recursive: true, force: true });
    }
  });

  it("depDirPacker should stream the packed tarball", async () => {
    const base = makeTmpDir();
    try {
      const dir = makeFixturePkg(base);
      const preper = new PkgPreper({
        tmpDir: Path.join(base, "tmp"),
        installDependencies: async () => undefined,
      });
      const stream = preper.depDirPacker({ _resolved: "test" }, dir);
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        stream.on("data", (c: Buffer) => chunks.push(c));
        stream.on("end", resolve);
        stream.on("error", reject);
      });
      const data = Buffer.concat(chunks);
      expect(data.length).toBeGreaterThan(0);
      // gzip magic bytes
      expect(data[0]).toBe(0x1f);
      expect(data[1]).toBe(0x8b);
    } finally {
      Fs.rmSync(base, { recursive: true, force: true });
    }
  });

  it("depDirPacker should run installDependencies when prepare script exists", async () => {
    const base = makeTmpDir();
    try {
      const dir = makeFixturePkg(base);
      Fs.writeFileSync(
        Path.join(dir, "package.json"),
        JSON.stringify({
          name: "fixture-pkg",
          version: "1.0.0",
          scripts: { prepare: "echo prepared" },
        }),
      );
      const calls: string[] = [];
      const preper = new PkgPreper({
        tmpDir: Path.join(base, "tmp"),
        installDependencies: async (d: string, msg: string) => {
          calls.push(msg);
        },
      });
      const stream = preper.depDirPacker({ _resolved: "git://test" }, dir);
      await new Promise<void>((resolve, reject) => {
        stream.on("end", resolve);
        stream.on("error", reject);
        stream.resume();
      });
      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain("fixture-pkg");
      expect(calls[0]).toContain("git://test");
    } finally {
      Fs.rmSync(base, { recursive: true, force: true });
    }
  });
});
