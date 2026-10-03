/*
 * A trimmed copy of each registry packument, kept as a plain JSON file beside fyn's cacache.
 *
 * A full packument carries every version's whole package.json, readme and registry extras. fyn
 * reads only a few fields from it, so reloading full packuments on every install without a
 * lockfile mostly parses data nobody uses. The trimmed copy keeps just those fields.
 *
 * The full response still lives in cacache, where make-fetch-happen needs it to revalidate.
 * The trimmed file's mtime is the packument's refresh time, the same role the cacache index
 * bucket's mtime plays for the full copy.
 */

import Fs from "fs";
import Path from "path";
import crypto from "crypto";

/** Bump when the kept fields change, so files from older versions are rebuilt. */
export const TRIMMED_FORMAT = 1;

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
  "fyn"
];

/** Only the install hooks are read from `scripts`. */
const KEEP_SCRIPTS = ["preinstall", "preInstall", "install", "postinstall", "postInstall"];

type Obj = Record<string, any>;

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
 * Read a trimmed packument and its refresh time. Resolves undefined when the file is missing,
 * unreadable, or from another format, so the caller falls back to the full copy.
 */
export async function readTrimmedPackument(
  file: string
): Promise<{ packument: Obj; refreshTime: number } | undefined> {
  try {
    const [data, stat] = await Promise.all([Fs.promises.readFile(file), Fs.promises.stat(file)]);
    const packument = JSON.parse(data.toString());
    if (packument.$format !== TRIMMED_FORMAT) return undefined;
    delete packument.$format;
    return { packument, refreshTime: stat.mtimeMs };
  } catch {
    return undefined;
  }
}

/**
 * Write a trimmed copy of a packument. The write goes to a temp file renamed over the target,
 * so concurrent installs never read half a file. `refreshTime` sets the mtime when the copy is
 * made from an existing cache entry rather than a fresh fetch. Failures are ignored: the full
 * copy in cacache still works, just slower.
 */
export async function writeTrimmedPackument(
  file: string,
  packument: Obj,
  refreshTime?: number
): Promise<void> {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  try {
    const data = JSON.stringify(trimPackument(packument));
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
