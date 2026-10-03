import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cloneDir, cloneFile, cloneFileSync, cloneFiles, cloneFilesSync } from "../index.js";

let dir: string;
const p = (...a: string[]) => path.join(dir, ...a);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "reflink-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("cloneFile", () => {
  it("places the file content", async () => {
    fs.writeFileSync(p("a"), "hello");
    const r = await cloneFile(p("a"), p("b"));
    expect(typeof r).toBe("boolean");
    expect(fs.readFileSync(p("b"), "utf8")).toBe("hello");
  });

  it("sync variant places the file content", () => {
    fs.writeFileSync(p("a"), "hello");
    cloneFileSync(p("a"), p("b"));
    expect(fs.readFileSync(p("b"), "utf8")).toBe("hello");
  });

  it("replaces dest instead of writing through a hardlink", async () => {
    fs.writeFileSync(p("src"), "launcher");
    fs.writeFileSync(p("bin"), "binary");
    fs.linkSync(p("bin"), p("dest"));
    await cloneFile(p("src"), p("dest"));
    expect(fs.readFileSync(p("dest"), "utf8")).toBe("launcher");
    expect(fs.readFileSync(p("bin"), "utf8")).toBe("binary");
  });

  it("keeps file mode", async () => {
    fs.writeFileSync(p("x"), "#!/bin/sh", { mode: 0o755 });
    await cloneFile(p("x"), p("y"));
    expect(fs.statSync(p("y")).mode & 0o777).toBe(0o755);
  });

  it("rejects with paths when src is missing", async () => {
    await expect(cloneFile(p("nope"), p("b"))).rejects.toThrow(/nope/);
  });
});

describe("cloneFiles", () => {
  it("creates parents and places every file", async () => {
    fs.mkdirSync(p("s/lib/deep"), { recursive: true });
    fs.writeFileSync(p("s/index.js"), "1");
    fs.writeFileSync(p("s/lib/a.js"), "2");
    fs.writeFileSync(p("s/lib/deep/b.js"), "3");
    const files = ["index.js", "lib/a.js", "lib/deep/b.js"];
    const stats = await cloneFiles(p("s"), p("d"), files);
    expect(stats.cloned + stats.copied).toBe(3);
    expect(stats.linked).toBe(0);
    expect(fs.readFileSync(p("d/lib/deep/b.js"), "utf8")).toBe("3");
  });

  // clone where the filesystem can, hardlink where it can't, and never copy on one volume
  it("hardlinks instead of copying when hardlink is set", async () => {
    fs.mkdirSync(p("s/lib"), { recursive: true });
    const files = ["a.js", "lib/b.js"];
    for (const f of files) fs.writeFileSync(p("s", f), f);

    const stats = await cloneFiles(p("s"), p("d"), files, true);
    expect(stats.cloned + stats.linked).toBe(2);
    expect(stats.copied).toBe(0);
    const linked = files.filter(f => fs.statSync(p("d", f)).ino === fs.statSync(p("s", f)).ino);
    expect(linked.length).toBe(stats.linked);
    expect(fs.readFileSync(p("d/lib/b.js"), "utf8")).toBe("lib/b.js");
  });

  // the sealed system volume can't clone or hardlink into the tmpdir's volume (EXDEV), only
  // copy. stat reports the same dev for both, so that can't be checked here.
  const sysDir = "/System/Library/CoreServices";
  const sysFile = "SystemVersion.plist";

  it.runIf(process.platform === "darwin")("copies a file that can't be cloned by default", async () => {
    const stats = await cloneFiles(sysDir, p("d"), [sysFile], true);
    expect(stats).toEqual({ cloned: 0, linked: 0, copied: 1 });
  });

  it.runIf(process.platform === "darwin")("fails instead of copying when copyFallback is false", async () => {
    await expect(cloneFiles(sysDir, p("d"), [sysFile], true, false)).rejects.toThrow(sysFile);
    expect(() => cloneFilesSync(sysDir, p("d"), [sysFile], false, false)).toThrow(sysFile);
    expect(fs.existsSync(p("d", sysFile))).toBe(false);
  });

  it("never hardlinks without hardlink set", async () => {
    fs.mkdirSync(p("s"));
    fs.writeFileSync(p("s/a.js"), "a");
    const stats = cloneFilesSync(p("s"), p("d"), ["a.js"]);
    expect(stats.linked).toBe(0);
    expect(fs.statSync(p("d/a.js")).ino).not.toBe(fs.statSync(p("s/a.js")).ino);
  });

  it("replaces existing hardlinked dest files", () => {
    fs.mkdirSync(p("s"));
    fs.mkdirSync(p("d"));
    fs.writeFileSync(p("s/f"), "new");
    fs.writeFileSync(p("other"), "keep");
    fs.linkSync(p("other"), p("d/f"));
    cloneFilesSync(p("s"), p("d"), ["f"]);
    expect(fs.readFileSync(p("d/f"), "utf8")).toBe("new");
    expect(fs.readFileSync(p("other"), "utf8")).toBe("keep");
  });

  it("leaves libuv threads free for other fs calls", async () => {
    const files = Array.from({ length: 2000 }, (_, i) => `f${i}`);
    fs.mkdirSync(p("s"));
    for (const f of files) fs.writeFileSync(p("s", f), f);

    // more batches than libuv has threads (4); a batch that held one would delay the stat
    let pending = 8;
    const clones = Array.from({ length: pending }, (_, k) =>
      cloneFiles(p("s"), p(`d${k}`), files).finally(() => pending--)
    );
    await fs.promises.stat(p("s"));
    expect(pending).toBe(8);
    await Promise.all(clones);
  });

  it("handles an empty list", async () => {
    expect(await cloneFiles(p("s"), p("d"), [])).toEqual({ cloned: 0, linked: 0, copied: 0 });
  });

  it("names only the dir when a parent can't be created", async () => {
    fs.mkdirSync(p("s/x"), { recursive: true });
    fs.writeFileSync(p("s/x/f"), "1");
    fs.writeFileSync(p("d"), "not a dir");
    const err = await cloneFiles(p("s"), p("d"), ["x/f"]).catch(e => e);
    expect(err.message).toContain(`mkdir ${p("d", "x")}`);
    expect(err.message).not.toContain("->");
  });

  it("fails when a file is missing", async () => {
    fs.mkdirSync(p("s"));
    await expect(cloneFiles(p("s"), p("d"), ["missing"])).rejects.toThrow(/missing/);
  });
});

// only APFS clones directories, and the macOS tmpdir is on APFS
describe.runIf(process.platform === "darwin")("cloneDir", () => {
  it("clones the whole tree, and writes to the clone stay out of the source", async () => {
    fs.mkdirSync(p("s/lib"), { recursive: true });
    fs.writeFileSync(p("s/package.json"), "{}");
    fs.writeFileSync(p("s/lib/bin.js"), "#!", { mode: 0o755 });

    expect(await cloneDir(p("s"), p("d"))).toBe(true);
    expect(fs.statSync(p("d/lib/bin.js")).mode & 0o777).toBe(0o755);
    fs.writeFileSync(p("d/package.json"), '{"rewritten":1}');
    expect(fs.readFileSync(p("s/package.json"), "utf8")).toBe("{}");
  });

  it("rejects with paths when dest exists", async () => {
    fs.mkdirSync(p("s"));
    fs.mkdirSync(p("d"));
    await expect(cloneDir(p("s"), p("d"))).rejects.toThrow(p("d"));
  });
});

describe.skipIf(process.platform === "darwin")("cloneDir off macOS", () => {
  it("resolves false so the caller clones file by file", async () => {
    fs.mkdirSync(p("s"));
    expect(await cloneDir(p("s"), p("d"))).toBe(false);
  });
});
