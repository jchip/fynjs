import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fs from "node:fs";
import Os from "node:os";
import Path from "node:path";
import { placeFilesSync } from "../../../lib/util/place-files";

describe("place-files", () => {
  let tmp: string;
  let src: string;
  let dest: string;
  const files = ["a.js", "package.json", "sub/b.js"];
  const job = (over: object = {}) => ({
    srcDir: src,
    destDir: dest,
    dirs: ["sub"],
    files,
    hardlink: true,
    reflink: false,
    copyFallback: true,
    ...over
  });
  const ino = (d: string, f: string) => Fs.statSync(Path.join(d, f)).ino;
  const read = (d: string, f: string) => Fs.readFileSync(Path.join(d, f), "utf8");

  beforeEach(() => {
    tmp = Fs.mkdtempSync(Path.join(Os.tmpdir(), "place-files-"));
    src = Path.join(tmp, "src");
    dest = Path.join(tmp, "dest");
    Fs.mkdirSync(Path.join(src, "sub"), { recursive: true });
    Fs.mkdirSync(dest);
    Fs.writeFileSync(Path.join(src, "a.js"), "aaa");
    Fs.writeFileSync(Path.join(src, "package.json"), "{}");
    Fs.writeFileSync(Path.join(src, "sub/b.js"), "bbb");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("hardlinks files and copies package.json", () => {
    const res = placeFilesSync(job());
    expect(ino(dest, "a.js")).toBe(ino(src, "a.js"));
    expect(ino(dest, "sub/b.js")).toBe(ino(src, "sub/b.js"));
    expect(ino(dest, "package.json")).not.toBe(ino(src, "package.json"));
    for (const f of files) expect(read(dest, f)).toBe(read(src, f));
    expect(res.noLink).toBe(undefined);
  });

  it("replaces an existing hardlinked dest without writing through", () => {
    const x = Path.join(tmp, "X");
    Fs.writeFileSync(x, "unrelated");
    Fs.linkSync(x, Path.join(dest, "a.js"));
    placeFilesSync(job());
    expect(ino(dest, "a.js")).toBe(ino(src, "a.js"));
    expect(Fs.readFileSync(x, "utf8")).toBe("unrelated");
  });

  it("copies every file when hardlink is off", () => {
    placeFilesSync(job({ hardlink: false }));
    for (const f of files) {
      expect(ino(dest, f)).not.toBe(ino(src, f));
      expect(read(dest, f)).toBe(read(src, f));
    }
  });

  it("throws when hardlink, reflink and copyFallback are all off", () => {
    expect(() => placeFilesSync(job({ hardlink: false, copyFallback: false }))).toThrow();
  });

  it("stops hardlinking after the first EXDEV and copies", () => {
    const spy = vi.spyOn(Fs, "linkSync").mockImplementation(() => {
      throw Object.assign(new Error("cross-device"), { code: "EXDEV" });
    });
    const res = placeFilesSync(job());
    expect(res.noLink).toBe("EXDEV");
    for (const f of files) {
      expect(ino(dest, f)).not.toBe(ino(src, f));
      expect(read(dest, f)).toBe(read(src, f));
    }
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
