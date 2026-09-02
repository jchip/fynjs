import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as Fs from "fs";
import * as Os from "os";
import * as Path from "path";
import { writePkgFile } from "../src/utils.ts";

//
// FPM-66: publish-util rewrote a package.json with a plain writeFile, which opens the
// file with O_TRUNC and then writes.  A postinstall child killed in between left a
// zero byte manifest.  writePkgFile must update in place - writing the new bytes before
// shortening the file - and must keep the inode, because fyn hardlinks package files
// into node_modules and a new inode would strand every installed copy.
//
describe("writePkgFile", () => {
  let dir: string;
  let pkgFile: string;

  const strayFiles = () => Fs.readdirSync(dir).filter(f => f !== "package.json");

  beforeEach(() => {
    dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "publish-util-write-"));
    pkgFile = Path.join(dir, "package.json");
    Fs.writeFileSync(pkgFile, `{\n  "name": "test"\n}\n`);
  });

  afterEach(() => {
    Fs.rmSync(dir, { recursive: true, force: true });
  });

  it("should not touch the file when content is unchanged", async () => {
    const before = Fs.statSync(pkgFile);
    const content = Fs.readFileSync(pkgFile, "utf8");

    expect(await writePkgFile(pkgFile, content)).toBe(false);

    const after = Fs.statSync(pkgFile);
    expect(after.ino).toBe(before.ino);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  it("should write the file when content changed, keeping the same inode", async () => {
    const before = Fs.statSync(pkgFile);

    expect(await writePkgFile(pkgFile, `{ "name": "changed" }\n`)).toBe(true);

    expect(Fs.readFileSync(pkgFile, "utf8")).toBe(`{ "name": "changed" }\n`);
    expect(Fs.statSync(pkgFile).ino).toBe(before.ino);
    expect(strayFiles()).toEqual([]);
  });

  it("should shorten the file to the new length", async () => {
    Fs.writeFileSync(pkgFile, `{ "name": "a much much longer manifest than the next one" }\n`);

    await writePkgFile(pkgFile, `{}\n`);

    expect(Fs.readFileSync(pkgFile, "utf8")).toBe(`{}\n`);
    expect(Fs.statSync(pkgFile).size).toBe(3);
  });

  it("should accept a Buffer", async () => {
    expect(await writePkgFile(pkgFile, Buffer.from(`{ "name": "buf" }\n`))).toBe(true);
    expect(Fs.readFileSync(pkgFile, "utf8")).toBe(`{ "name": "buf" }\n`);
  });

  it("should create the file when it does not exist", async () => {
    const newFile = Path.join(dir, "new.json");
    expect(await writePkgFile(newFile, `{}\n`)).toBe(true);
    expect(Fs.readFileSync(newFile, "utf8")).toBe(`{}\n`);
  });

  it("should keep hardlinked copies in sync instead of stranding them", async () => {
    // fyn hardlinks package files into node_modules - an update must reach those copies,
    // which rules out temp-file + rename
    const linked = Path.join(dir, "linked.json");
    Fs.linkSync(pkgFile, linked);
    expect(Fs.statSync(linked).nlink).toBe(2);

    await writePkgFile(pkgFile, `{ "name": "replaced" }\n`);

    expect(Fs.readFileSync(linked, "utf8")).toBe(`{ "name": "replaced" }\n`);
    expect(Fs.statSync(linked).ino).toBe(Fs.statSync(pkgFile).ino);
    expect(Fs.statSync(pkgFile).nlink).toBe(2);
  });

  it("should preserve the file mode", async () => {
    Fs.chmodSync(pkgFile, 0o600);
    await writePkgFile(pkgFile, `{ "name": "mode" }\n`);
    expect(Fs.statSync(pkgFile).mode & 0o777).toBe(0o600);
  });

  it("should reject without touching anything when the path is unwritable", async () => {
    const original = Fs.readFileSync(pkgFile, "utf8");
    const missing = Path.join(dir, "no-such-dir", "package.json");

    await expect(writePkgFile(missing, `{}\n`)).rejects.toThrow();

    expect(Fs.readFileSync(pkgFile, "utf8")).toBe(original);
    expect(strayFiles()).toEqual([]);
  });
});
