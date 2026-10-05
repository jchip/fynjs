/*
 * Untar a gzipped npm tarball into a new, empty dir, with a fraction of node-tar's CPU.
 *
 * node-tar handles any tarball into any dir: it stats each path before writing, reserves paths
 * across concurrent writes, and streams. Unpacking a package into a fresh dir needs none of
 * that, so this gunzips the whole tarball and writes each file with four sync calls. It's about
 * 2.5x less CPU than node-tar's sync unpack, with the same files, modes and mtimes.
 *
 * It parses headers the way node-tar 7 does, and calls `onentry` with the same path, type, size,
 * mtime and checksum, so the central store's tree matches. Anything outside the plain case
 * throws, and the caller untars that package with node-tar: links, global pax headers, large
 * numbers, bad checksums, paths with `..`, Windows, and running as root (node-tar then chowns).
 */

import Fs from "node:fs";
import Path from "node:path";
import Zlib from "node:zlib";
import type { TreeEntry } from "./untar-tree";

class Unsupported extends Error {}

const decString = (buf: Buffer, off: number, size: number): string =>
  buf.toString("utf8", off, off + size).replace(/\0.*/s, "");

const decNumber = (buf: Buffer, off: number, size: number): number | undefined => {
  if (buf[off] & 0x80) throw new Unsupported("large number");
  const n = parseInt(buf.toString("utf8", off, off + size).replace(/\0.*$/s, "").trim(), 8);
  return isNaN(n) ? undefined : n;
};

/** The extended header fields node-tar keeps, as Pax.parse reads them */
interface Extended {
  path?: string;
  size?: number;
  mtime?: Date;
  mode?: number;
}

const parsePax = (str: string, ex: Extended | undefined): Extended => {
  const set: Extended = {};
  for (let line of str.replace(/\n$/, "").split("\n")) {
    const n = parseInt(line, 10);
    if (n !== Buffer.byteLength(line) + 1) continue;
    line = line.slice(`${n} `.length);
    const eq = line.indexOf("=");
    const k = eq < 0 ? line : line.slice(0, eq);
    const v = eq < 0 ? "" : line.slice(eq + 1).replace(/\0.*/s, "");
    if (k === "path") set.path = v;
    else if (k === "size") {
      if (+v >= 0) set.size = +v;
    } else if (k === "mtime") set.mtime = new Date(Number(v) * 1000);
    else if (k === "mode") set.mode = +v;
    else if (k === "type" || k === "linkpath") throw new Unsupported(`pax ${k}`);
  }
  return Object.assign({}, ex, set);
};

const TYPES: Record<string, string> = { "0": "File", "5": "Directory", "7": "ContiguousFile" };

/** node-tar's limit on the body of a pax or long-name header */
const MAX_META = 1024 * 1024;

/**
 * Untar a gzipped tarball into `cwd`, an empty dir, stripping `strip` leading path parts.
 * Throws for a tarball this can't do exactly as node-tar would; the caller then clears `cwd`
 * and uses node-tar.
 */
export function fastUntar(data: Buffer, cwd: string, strip: number, onentry: (entry: TreeEntry) => void): void {
  if (process.platform === "win32" || process.getuid?.() === 0) {
    throw new Unsupported(process.platform);
  }
  const buf = Zlib.gunzipSync(data);
  const made = new Set<string>([cwd]);
  const mkdirp = (dir: string, mode?: number): void => {
    if (made.has(dir)) return;
    mkdirp(Path.dirname(dir));
    try {
      Fs.mkdirSync(dir, mode === undefined ? undefined : { mode });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
    made.add(dir);
  };

  let ex: Extended | undefined;
  let off = 0;
  while (off + 512 <= buf.length) {
    if (buf[off] === 0) {
      // a null block ends the archive
      break;
    }
    const t = decString(buf, off + 156, 1);
    const normalFs = TYPES[t || "0"] !== undefined;
    const exf = normalFs ? ex : undefined;

    let sum = 8 * 0x20;
    for (let i = off; i < off + 148; i++) sum += buf[i];
    for (let i = off + 156; i < off + 512; i++) sum += buf[i];
    const cksum = decNumber(buf, off + 148, 12);
    if (sum !== cksum) throw new Unsupported("checksum");

    let size = exf?.size ?? decNumber(buf, off + 124, 12) ?? 0;
    const body = off + 512;

    if (!normalFs) {
      if (t !== "x" && t !== "L") throw new Unsupported(`type ${t}`);
      if (size > MAX_META || body + size > buf.length) throw new Unsupported("meta");
      const meta = buf.toString("utf8", body, body + size);
      if (t === "x") {
        ex = parsePax(meta, ex);
      } else {
        ex = Object.assign({}, ex, { path: meta.replace(/\0.*/s, "") });
      }
      off = body + Math.ceil(size / 512) * 512;
      continue;
    }

    let path = exf?.path ?? decString(buf, off, 100);
    if (buf.toString("latin1", off + 257, off + 265) === "ustar\u000000") {
      const prefix = decString(buf, off + 345, buf[off + 475] !== 0 ? 155 : 130);
      if (prefix) path = `${prefix}/${path}`;
    }
    // node-tar's ReadEntry applies the extended path over the prefixed one
    if (exf?.path !== undefined) path = exf.path;
    ex = undefined;

    let type = t || "0";
    if (type === "0" && path.endsWith("/")) type = "5";
    if (type === "5") size = 0;
    const secs = decNumber(buf, off + 136, 12);
    const mtime = exf?.mtime ?? (secs === undefined ? undefined : new Date(secs * 1000));
    const mode = exf?.mode ?? decNumber(buf, off + 100, 8);

    if (body + size > buf.length) throw new Unsupported("truncated");
    off = body + Math.ceil(size / 512) * 512;

    onentry({ path, type: TYPES[type], size, mtime, header: { cksumValid: true, cksum } });

    if (path.startsWith("/")) throw new Unsupported("absolute path");
    const parts = path.split("/").filter(Boolean);
    if (parts.some(p => p === ".." || p === ".")) throw new Unsupported("path");
    if (parts.length > 1024) throw new Unsupported("depth");
    if (parts.length <= strip) continue;
    const dest = Path.join(cwd, ...parts.slice(strip));

    if (type === "5") {
      mkdirp(dest, mode === undefined ? undefined : mode & 0o7777);
      continue;
    }

    mkdirp(Path.dirname(dest));
    const fd = Fs.openSync(dest, "w", mode === undefined ? 0o666 : mode & 0o7777);
    try {
      for (let done = 0; done < size; ) {
        done += Fs.writeSync(fd, buf, body + done, size - done);
      }
      if (mtime) Fs.futimesSync(fd, mtime, mtime);
    } finally {
      Fs.closeSync(fd);
    }
  }
}
