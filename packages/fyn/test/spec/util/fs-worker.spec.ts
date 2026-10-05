import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fs from "node:fs";
import Os from "node:os";
import Path from "node:path";
import Zlib from "node:zlib";
import ssri from "ssri";
import * as Tar from "tar";
import { verify } from "run-verify";
import { untarFileSync } from "../../../lib/util/fs-worker";

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
});
