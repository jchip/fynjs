/*
 * Central store entry helpers shared by FynCentral and the fs worker. The worker runs the whole
 * store protocol with sync calls (see fs-worker.ts), so the main thread makes none of them.
 * FynCentral runs the same steps with async calls when there's no worker.
 *
 * Imports nothing from fyn, so the worker bundle stays small.
 */

import Crypto from "node:crypto";
import Fs from "node:fs";
import Path from "node:path";
import type { Stats } from "node:fs";
import { filterScanDirSync, type ExtrasData, type Options } from "filter-scan-dir";
import { hashList } from "./untar-tree";

/** an extraction marker or temp dir older than this was left by an install that died */
export const STALE_MS = 5 * 60 * 1000;

/** a name suffix no other install, or other call in this one, will pick */
export const uniqueSuffix = (): string => `${process.pid}-${Crypto.randomBytes(4).toString("hex")}`;

/**
 * filterScanDir options that hash a package dir in one stat walk, in both formats: v1 for
 * checking an old entry, v2 for everything else (see SUM_VERSION). Call `sums` with the scan's
 * result.
 */
export function shasumScan(packageDir: string): {
  options: Options<true>;
  sums: (files: string[]) => { v1: string; v2: string };
} {
  const v2: string[] = [];
  const filter = (_file: string, _path: string, extras: ExtrasData): { formatName: string } => {
    const { stat, dirFile } = extras;
    const fullStat = stat as Stats;
    if (!fullStat.isDirectory()) {
      v2.push(`${dirFile.replace(/\\/g, "/")}-${Math.floor(fullStat.mtimeMs / 1000)}-${fullStat.size}`);
    }
    return { formatName: `${dirFile}-${fullStat.mtimeMs}-${fullStat.size}` };
  };
  return {
    options: {
      cwd: packageDir,
      filter,
      filterDir: filter,
      fullStat: true, // need full stat for mtimeMs and size prop
      concurrency: 500,
      sortFiles: false, // concurrency breaks sorting, sort files all at once after
      includeDir: true
    },
    sums: files => ({ v1: hashList(files), v2: hashList(v2) })
  };
}

export function scanShasumsSync(packageDir: string): { v1: string; v2: string } | undefined {
  try {
    const { options, sums } = shasumScan(packageDir);
    return sums(filterScanDirSync(options));
  } catch (_err) {
    return undefined;
  }
}

/**
 * Claim the `.extracting` marker that tells other installs this one is writing the entry.
 * mkdir is atomic, so only one install gets it. A marker older than STALE_MS was left by an
 * install that died, so it is taken over.
 *
 * @returns true when this install owns the marker
 */
export function claimMarkerSync(marker: string, retry = true): boolean {
  try {
    Fs.mkdirSync(marker);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
  }
  let stat: Stats | undefined;
  try {
    stat = Fs.statSync(marker);
  } catch {}
  if (retry && (!stat || Date.now() - stat.mtimeMs > STALE_MS)) {
    Fs.rmSync(marker, { recursive: true, force: true });
    return claimMarkerSync(marker, false);
  }
  return false;
}

/** Remove temp and trash dirs that installs which died left next to the entry. */
export function removeStaleTempsSync(contentPath: string): void {
  const dir = Path.dirname(contentPath);
  const base = Path.basename(contentPath);
  for (const name of Fs.readdirSync(dir)) {
    if (!name.startsWith(`${base}.tmp`) && !name.startsWith(`${base}.del-`)) continue;
    let stat: Stats | undefined;
    try {
      stat = Fs.statSync(Path.join(dir, name));
    } catch {}
    if (stat && Date.now() - stat.mtimeMs > STALE_MS) {
      Fs.rmSync(Path.join(dir, name), { recursive: true, force: true });
    }
  }
}
