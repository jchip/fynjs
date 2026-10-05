/*
 * A trimmed copy of each registry packument, kept as a plain JSON file beside fyn's cacache.
 *
 * A full packument carries every version's whole package.json, readme and registry extras. fyn
 * reads only a few fields from it, so reloading full packuments on every install without a
 * lockfile mostly parses data nobody uses. The trimmed copy keeps just those fields.
 *
 * fyn fetches packuments itself, without make-fetch-happen's cache, so the trimmed file is the
 * only copy kept. It holds the response's etag and last-modified for revalidation. Its mtime is
 * the packument's refresh time. Full copies older fyn versions left in cacache are still read.
 */

import Fs from "fs";
import Path from "path";
import crypto from "crypto";
import Zlib from "zlib";

/** Bump when the kept fields change, so files from older versions are rebuilt. */
export const TRIMMED_FORMAT = 2;

/**
 * The version fields fyn reads from a registry packument. Code that starts reading another
 * field from `meta.versions[v]` must add it here and bump TRIMMED_FORMAT.
 * `os` and `cpu` are kept whenever present, even empty: the platform check tests for the key.
 */
const KEEP_VERSION_FIELDS = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "peerDependenciesMeta",
  "bundleDependencies",
  "bundledDependencies",
  "os",
  "cpu",
  "deprecated",
  "_hasShrinkwrap",
  "_shrinkwrap",
  "fyn"
];

/** Only the install hooks are read from `scripts`. */
const KEEP_SCRIPTS = ["preinstall", "preInstall", "install", "postinstall", "postInstall"];

type Obj = Record<string, any>;

/** What the registry returned to revalidate a packument with */
export interface PackumentValidators {
  etag?: string;
  lastModified?: string;
  /**
   * from npm's abbreviated install metadata, which has no `time` and only flags install scripts.
   * A revalidation must ask for the same form the validators came from.
   */
  corgi?: boolean;
}

export function trimPackument(packument: Obj): Obj {
  const versions: Obj = {};
  for (const [version, meta] of Object.entries<Obj>(packument.versions || {})) {
    const trimmed: Obj = {};
    for (const field of KEEP_VERSION_FIELDS) {
      if (meta[field] !== undefined) trimmed[field] = meta[field];
    }
    if (meta.scripts) {
      const scripts: Obj = {};
      for (const name of KEEP_SCRIPTS) {
        if (meta.scripts[name] !== undefined) scripts[name] = meta.scripts[name];
      }
      if (Object.keys(scripts).length > 0) trimmed.scripts = scripts;
    }
    if (meta.dist) {
      const { integrity, shasum, tarball } = meta.dist;
      trimmed.dist = { integrity, shasum, tarball };
    }
    versions[version] = trimmed;
  }

  return {
    $format: TRIMMED_FORMAT,
    name: packument.name,
    "dist-tags": packument["dist-tags"],
    time: packument.time,
    versions
  };
}

/** The file for a packument URL. Hashed, since names plus registry URLs can exceed a file name. */
export function trimmedPackumentFile(dir: string, packumentUrl: string): string {
  const hash = crypto.createHash("sha256").update(packumentUrl).digest("hex");
  return Path.join(dir, `${hash}.json`);
}

/**
 * Read a trimmed packument, its refresh time, and its validators. Resolves undefined when the
 * file is missing, unreadable, or from another format, so the caller falls back to the full copy.
 */
export async function readTrimmedPackument(
  file: string
): Promise<({ packument: Obj; refreshTime: number } & PackumentValidators) | undefined> {
  try {
    const [data, stat] = await Promise.all([Fs.promises.readFile(file), Fs.promises.stat(file)]);
    const parsed = parseTrimmed(data.toString());
    return parsed && { ...parsed, refreshTime: stat.mtimeMs };
  } catch {
    return undefined;
  }
}

/** Parse a trimmed copy's JSON into the packument and its validators. Undefined for another format. */
export function parseTrimmed(json: string): ({ packument: Obj } & PackumentValidators) | undefined {
  const packument = JSON.parse(json);
  if (packument.$format !== TRIMMED_FORMAT) return undefined;
  const { $etag: etag, $lastModified: lastModified, $corgi: corgi } = packument;
  delete packument.$format;
  delete packument.$etag;
  delete packument.$lastModified;
  delete packument.$corgi;
  return { packument, etag, lastModified, corgi };
}

/** Mark a trimmed packument as refreshed now, after the registry said it hasn't changed */
export async function touchTrimmedPackument(file: string): Promise<void> {
  const now = new Date();
  await Fs.promises.utimes(file, now, now).catch(() => undefined);
}

/**
 * Write a trimmed copy of a packument. The write goes to a temp file renamed over the target,
 * so concurrent installs never read half a file. `refreshTime` sets the mtime when the copy is
 * made from an existing cache entry rather than a fresh fetch. Failures are ignored: the next
 * install fetches the packument again.
 */
export async function writeTrimmedPackument(
  file: string,
  packument: Obj,
  refreshTime?: number,
  validators?: PackumentValidators
): Promise<void> {
  let json: string;
  try {
    json = trimmedJson(trimPackument(packument), validators);
  } catch {
    return;
  }
  await writeTrimmed(file, json, refreshTime);
}

function trimmedJson(trimmed: Obj, validators?: PackumentValidators): string {
  return JSON.stringify({
    ...trimmed,
    $etag: validators?.etag,
    $lastModified: validators?.lastModified,
    $corgi: validators?.corgi || undefined
  });
}

async function writeTrimmed(file: string, data: string, refreshTime?: number): Promise<void> {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  try {
    try {
      await Fs.promises.writeFile(tmp, data);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      await Fs.promises.mkdir(Path.dirname(file), { recursive: true });
      await Fs.promises.writeFile(tmp, data);
    }
    if (refreshTime) {
      const time = new Date(refreshTime);
      await Fs.promises.utimes(tmp, time, time);
    }
    await Fs.promises.rename(tmp, file);
  } catch {
    await Fs.promises.rm(tmp, { force: true }).catch(() => undefined);
  }
}

/** Parse a registry response body, as sent with `encoding` */
export function decodePackument(data: Uint8Array, encoding?: string): Obj {
  const json = encoding === "gzip" || encoding === "x-gzip" || encoding === "deflate"
    ? Zlib.unzipSync(data)
    : encoding === "br"
      ? Zlib.brotliDecompressSync(data)
      : data;
  return JSON.parse(Buffer.from(json.buffer, json.byteOffset, json.byteLength).toString());
}

export interface SavePackumentJob extends PackumentValidators {
  /** the response body, as the registry sent it */
  data: Uint8Array;
  /** the response's content-encoding */
  encoding?: string;
  /** the trimmed copy to write */
  file: string;
}

/** the JSON written, or that an abbreviated packument isn't enough and the full one is needed */
export type SavePackumentResult = { json: string } | { needFull: true };

/**
 * Decode a packument response and write its trimmed copy. The abbreviated form only flags that
 * a version has install scripts, and fyn records which ones, so one with any isn't saved. This
 * is the CPU-heavy part of a packument fetch, so an fs worker runs it when fyn has them built.
 */
export async function savePackument(job: SavePackumentJob): Promise<SavePackumentResult> {
  const packument = decodePackument(job.data, job.encoding);
  if (job.corgi && Object.values<Obj>(packument.versions || {}).some(v => v.hasInstallScript)) {
    return { needFull: true };
  }
  return { json: await saveTrimmed(job.file, packument, job) };
}

/** Trim a packument and write it with its validators. @returns the JSON written */
export async function saveTrimmed(file: string, packument: Obj, validators: PackumentValidators): Promise<string> {
  const text = trimmedJson(trimPackument(packument), validators);
  await writeTrimmed(file, text);
  return text;
}
