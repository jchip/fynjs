import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fs from "node:fs";
import Os from "node:os";
import Path from "node:path";
import Zlib from "node:zlib";
import ssri from "ssri";
import * as Tar from "tar";
import { verify } from "run-verify";
import { fastUntar } from "../../../lib/util/fast-untar";
import { untarFileSync } from "../../../lib/util/fs-worker";
import { treeCollector } from "../../../lib/util/untar-tree";

const TGZ_DIR = Path.join(__dirname, "../../fixtures/mock-npm/.tgz");

/** Recursive listing: relative path, type, mode, mtime seconds, size, content */
const listing = (root: string, rel = ""): any[] => {
  const out: any[] = [];
  for (const name of Fs.readdirSync(Path.join(root, rel)).sort()) {
    const p = Path.join(rel, name);
    const st = Fs.lstatSync(Path.join(root, p));
    const isDir = st.isDirectory();
    out.push({
      p,
      type: isDir ? "dir" : "file",
      mode: st.mode & 0o7777,
      mtime: Math.floor(st.mtimeMs / 1000),
      size: isDir ? 0 : st.size,
      content: isDir ? "" : Fs.readFileSync(Path.join(root, p)).toString("base64")
    });
    if (isDir) out.push(...listing(root, p));
  }
  return out;
};

describe("fast-untar", () => {
  let tmp: string;
  let dirA: string;
  let dirB: string;

  beforeEach(() => {
    tmp = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fast-untar-"));
    dirA = Path.join(tmp, "a");
    dirB = Path.join(tmp, "b");
    Fs.mkdirSync(dirA);
    Fs.mkdirSync(dirB);
  });

  afterEach(() => {
    Fs.rmSync(tmp, { recursive: true, force: true });
  });

  const nodeTarExtract = (tgz: string, dir: string) => {
    const c = treeCollector(1);
    return new Promise<typeof c.result>((resolve, reject) => {
      Fs.createReadStream(tgz)
        .pipe(Tar.x({ strip: 1, strict: true, C: dir, onentry: c.onentry } as any))
        .on("finish", () => resolve(c.result))
        .on("error", reject);
    });
  };

  const expectSame = (tgz: string) => {
    let a: any;
    return verify()
      .step(() => nodeTarExtract(tgz, dirA))
      .step(r => (a = r))
      .step(() => {
        const c = treeCollector(1);
        fastUntar(Fs.readFileSync(tgz), dirB, 1, c.onentry);
        expect(JSON.stringify(c.result)).toBe(JSON.stringify(a));
        expect(listing(dirB)).toEqual(listing(dirA));
      });
  };

  /** Make a gzipped tarball of `package` under a src dir, and return its path */
  const makeTgz = (setup: (pkg: string) => void): string => {
    const src = Path.join(tmp, "src");
    const pkg = Path.join(src, "package");
    Fs.mkdirSync(pkg, { recursive: true });
    setup(pkg);
    const file = Path.join(tmp, "out.tgz");
    Tar.c({ gzip: true, cwd: src, portable: true, sync: true, file }, ["package"]);
    return file;
  };

  const crafted = (): Buffer => {
    const header = new Tar.Header({
      path: "package/../evil.txt",
      type: "File",
      size: 4,
      mode: 0o644,
      mtime: new Date(0)
    });
    header.encode();
    const body = Buffer.alloc(512);
    body.write("evil");
    return Zlib.gzipSync(Buffer.concat([header.block!, body, Buffer.alloc(1024)]));
  };

  it("matches node-tar for every mock-npm fixture tarball", () => {
    const files = Fs.readdirSync(TGZ_DIR).filter(f => f.endsWith(".tgz"));
    expect(files.length).toBeGreaterThan(0);
    let chain: any = verify();
    for (const f of files) {
      chain = chain
        .step(() => {
          for (const d of [dirA, dirB]) {
            Fs.rmSync(d, { recursive: true, force: true });
            Fs.mkdirSync(d);
          }
        })
        .step(() => expectSame(Path.join(TGZ_DIR, f)));
    }
    return chain;
  });

  it("matches node-tar for a generated tarball with long paths and an executable", () => {
    const long100 = Path.join("d".repeat(40), "e".repeat(40), "f".repeat(30), "long.txt");
    const long260 = Path.join(...["g".repeat(60), "h".repeat(60), "i".repeat(60), "j".repeat(60), "k".repeat(60), "long260.txt"]);
    expect(long100.length).toBeGreaterThan(100);
    expect(long260.length).toBeGreaterThan(260);
    const tgz = makeTgz(pkg => {
      Fs.writeFileSync(Path.join(pkg, "normal.txt"), "hello");
      Fs.writeFileSync(Path.join(pkg, "empty.txt"), "");
      Fs.writeFileSync(Path.join(pkg, "run.sh"), "#!/bin/sh\n");
      Fs.chmodSync(Path.join(pkg, "run.sh"), 0o755);
      Fs.mkdirSync(Path.join(pkg, "nested"));
      Fs.writeFileSync(Path.join(pkg, "nested", "n.txt"), "nested");
      for (const p of [long100, long260]) {
        Fs.mkdirSync(Path.join(pkg, Path.dirname(p)), { recursive: true });
        Fs.writeFileSync(Path.join(pkg, p), "long " + p.length);
      }
    });
    return verify()
      .step(() => expectSame(tgz))
      .step(() => {
        expect(Fs.statSync(Path.join(dirB, "run.sh")).mode & 0o7777).toBe(0o755);
        expect(Fs.readFileSync(Path.join(dirB, long260), "utf8")).toBe("long " + long260.length);
      });
  });

  it("throws for a symlink, and untarFileSync falls back to node-tar", () => {
    const tgz = makeTgz(pkg => {
      Fs.writeFileSync(Path.join(pkg, "real.txt"), "real");
      Fs.symlinkSync("real.txt", Path.join(pkg, "link.txt"));
    });
    const buf = Fs.readFileSync(tgz);
    expect(() => fastUntar(buf, dirA, 1, treeCollector(1).onentry)).toThrow();
    const integrity = ssri.fromData(buf, { algorithms: ["sha512"] }).toString();
    const targetDir = Path.join(tmp, "target");
    const tree = untarFileSync({ file: tgz, integrity, targetDir, strip: 1 });
    expect(Fs.lstatSync(Path.join(targetDir, "link.txt")).isSymbolicLink()).toBe(true);
    expect(Fs.readFileSync(Path.join(targetDir, "real.txt"), "utf8")).toBe("real");
    expect(tree.fromHeaders).toBe(false);
  });

  it("untarFileSync rejects a wrong integrity and writes nothing", () => {
    const tgz = makeTgz(pkg => Fs.writeFileSync(Path.join(pkg, "a.txt"), "a"));
    const integrity = ssri.fromData(Buffer.from("other"), { algorithms: ["sha512"] }).toString();
    const targetDir = Path.join(tmp, "target");
    Fs.mkdirSync(targetDir);
    let err: any;
    try {
      untarFileSync({ file: tgz, integrity, targetDir, strip: 1 });
    } catch (e) {
      err = e;
    }
    expect(err?.code).toBe("EINTEGRITY");
    expect(Fs.readdirSync(targetDir)).toEqual([]);
  });

  it("refuses a '..' path and never writes outside the target", () => {
    const buf = crafted();
    const targetDir = Path.join(tmp, "target");
    Fs.mkdirSync(targetDir);
    expect(() => fastUntar(buf, targetDir, 1, treeCollector(1).onentry)).toThrow();
    expect(Fs.existsSync(Path.join(tmp, "evil.txt"))).toBe(false);
    expect(Fs.existsSync(Path.join(tmp, "package", "evil.txt"))).toBe(false);

    const file = Path.join(tmp, "evil.tgz");
    Fs.writeFileSync(file, buf);
    const integrity = ssri.fromData(buf, { algorithms: ["sha512"] }).toString();
    // node-tar strict rejects '..' too
    expect(() => untarFileSync({ file, integrity, targetDir, strip: 1 })).toThrow();
    expect(Fs.existsSync(Path.join(tmp, "evil.txt"))).toBe(false);
  });
});
