import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fs from "node:fs";
import Os from "node:os";
import Path from "node:path";
import Zlib from "node:zlib";
import ssri from "ssri";
import * as Tar from "tar";
import { verify } from "run-verify";
import { untarFileSync, storeJobSync } from "../../../lib/util/fs-worker";
import { treeShasum, SUM_VERSION } from "../../../lib/util/untar-tree";

describe("fs-worker untarFileSync with in-memory data", () => {
  let tmp: string;
  let data: Uint8Array;
  let integrity: string;

  beforeEach(async () => {
    tmp = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fyn-fs-worker-"));
    const src = Path.join(tmp, "src");
    Fs.mkdirSync(Path.join(src, "package", "lib"), { recursive: true });
    Fs.writeFileSync(Path.join(src, "package", "package.json"), '{"name":"x"}');
    Fs.writeFileSync(Path.join(src, "package", "lib", "a.js"), "module.exports = 1;\n");
    const chunks: Buffer[] = [];
    for await (const c of Tar.c({ cwd: src, portable: true }, ["package"])) chunks.push(c as Buffer);
    // a plain Uint8Array, as it arrives from another thread
    data = new Uint8Array(Zlib.gzipSync(Buffer.concat(chunks)));
    integrity = ssri.fromData(data).toString();
  });

  afterEach(() => {
    Fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("extracts files from data, stripping the leading dir", () => {
    const targetDir = Path.join(tmp, "out");
    return verify()
      .step(() => untarFileSync({ data, integrity, targetDir, strip: 1 }))
      .step(() => {
        expect(Fs.readFileSync(Path.join(targetDir, "package.json"), "utf8")).toBe('{"name":"x"}');
        expect(Fs.readFileSync(Path.join(targetDir, "lib", "a.js"), "utf8")).toBe("module.exports = 1;\n");
      });
  });

  it("throws EINTEGRITY and extracts nothing for wrong integrity", () => {
    const targetDir = Path.join(tmp, "out");
    return verify()
      .expectError.step(() =>
        untarFileSync({ data, integrity: ssri.fromData("other").toString(), targetDir, strip: 1 })
      )
      .step((err: any) => {
        expect(err.code).toBe("EINTEGRITY");
        expect(Fs.existsSync(targetDir)).toBe(false);
      });
  });

  it("stores an entry: tree.json in place, and no temp dir or marker left", () => {
    const contentPath = Path.join(tmp, "store", "entry");
    const result = storeJobSync({ data, integrity, contentPath });
    expect(result.stored).toEqual({ shaSum: treeShasum(result.tree!), sumVersion: SUM_VERSION });
    expect(Fs.readdirSync(Path.dirname(contentPath))).toEqual(["entry"]);
    const treeFile = JSON.parse(Fs.readFileSync(Path.join(contentPath, "tree.json"), "utf8"));
    expect(treeFile).toEqual({ $: result.tree, shaSum: result.stored!.shaSum, _: SUM_VERSION });
    expect(Fs.readFileSync(Path.join(contentPath, "package", "lib", "a.js"), "utf8")).toBe("module.exports = 1;\n");
  });

  it("leaves an entry that's there already, without extracting", () => {
    const contentPath = Path.join(tmp, "store", "entry");
    Fs.mkdirSync(Path.join(contentPath, "package"), { recursive: true });
    expect(storeJobSync({ data, integrity, contentPath })).toEqual({ exist: true });
    expect(Fs.readdirSync(Path.dirname(contentPath))).toEqual(["entry"]);
  });

  it("removes its temp dir and marker when the tarball fails its integrity check", () => {
    const contentPath = Path.join(tmp, "store", "entry");
    expect(() => storeJobSync({ data, integrity: ssri.fromData("other").toString(), contentPath })).toThrow(
      expect.objectContaining({ code: "EINTEGRITY" })
    );
    expect(Fs.readdirSync(Path.dirname(contentPath))).toEqual([]);
  });
});
