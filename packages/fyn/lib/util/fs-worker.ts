/*
 * Work off the main thread: store a tarball in the central store, hash a stored package to
 * validate it, place a stored
 * package's files into node_modules, and turn a packument response into fyn's trimmed copy.
 * Each costs a few ms of CPU per package; on a slow CPU, doing them on the main thread starves
 * downloads. Built to dist/fs-worker.mjs, and run by fs-worker-pool.ts.
 */

import Fs from "node:fs";
import Path from "node:path";
import { parentPort } from "node:worker_threads";
import ssri from "ssri";
import * as Tar from "tar";
import { fastUntar } from "./fast-untar";
import { placeFilesSync, type PlaceJob, type PlaceResult } from "./place-files";
import { treeCollector, treeShasum, treeFileJson, SUM_VERSION, type UntarTree } from "./untar-tree";
import { claimMarkerSync, removeStaleTempsSync, scanShasumsSync, uniqueSuffix } from "./store-entry";
import { savePackument, type SavePackumentJob, type SavePackumentResult } from "./trimmed-packument";

/** A tarball as a file, such as a cacache content file, or as the bytes a download returned */
export type TarSource = { file: string; data?: undefined } | { data: Uint8Array; file?: undefined };

export type UntarJob = TarSource & {
  /** checked against the tarball before extracting */
  integrity: string;
  targetDir: string;
  strip: number;
};

/** Store a tarball as the central store entry at `contentPath` */
export type StoreJob = TarSource & {
  /** checked against the tarball before extracting */
  integrity: string;
  contentPath: string;
  /** return `busy` when another live install holds the entry's marker */
  deferIfBusy?: boolean;
};

/**
 * One of: `stored` with the tree, `exist` when the entry was there already, `raced` when
 * another install renamed its copy in first, or `busy` when deferred.
 */
export interface StoreResult {
  tree?: UntarTree["tree"];
  stored?: { shaSum: string | undefined; sumVersion: number };
  exist?: boolean;
  raced?: boolean;
  busy?: boolean;
}

/** Hash a stored package dir, as FynCentral._scanShasums does */
export type ScanJob = { dir: string };

export type FsJob =
  | { op: "store"; job: StoreJob }
  | { op: "scan"; job: ScanJob }
  | { op: "place"; job: PlaceJob }
  | { op: "savePackument"; job: SavePackumentJob };

export interface FsJobResult {
  store: StoreResult;
  scan: { v1: string; v2: string } | undefined;
  place: PlaceResult;
  savePackument: SavePackumentResult;
}

/**
 * FynCentral.storeTarStream's steps with sync calls. While extracting, it holds the entry's
 * `.extracting` marker. It extracts into a temp dir only this call uses, and renames that into
 * place, so other installs see the entry complete or not at all.
 */
export function storeJobSync(job: StoreJob): StoreResult {
  const { contentPath } = job;
  if (Fs.existsSync(contentPath)) return { exist: true };
  Fs.mkdirSync(Path.dirname(contentPath), { recursive: true });
  const marker = `${contentPath}.extracting`;
  const claimed = claimMarkerSync(marker);
  try {
    if (claimed) {
      // another install may have finished the entry just before releasing its marker
      if (Fs.existsSync(contentPath)) return { exist: true };
      removeStaleTempsSync(contentPath);
    } else if (job.deferIfBusy) {
      return { busy: true };
    }
    return storeEntrySync(job);
  } finally {
    if (claimed) {
      try {
        Fs.rmdirSync(marker);
      } catch {}
    }
  }
}

function storeEntrySync(job: StoreJob): StoreResult {
  const { contentPath } = job;
  const tmp = `${contentPath}.tmp-${uniqueSuffix()}`;
  try {
    const targetDir = Path.join(tmp, "package");
    const { tree, fromHeaders } = untarFileSync({ ...job, targetDir, strip: 1 } as UntarJob);
    const shaSum = fromHeaders ? treeShasum(tree) : scanShasumsSync(targetDir)?.v2;
    Fs.writeFileSync(Path.join(tmp, "tree.json"), treeFileJson({ tree, shaSum, sumVersion: SUM_VERSION }));
    try {
      Fs.renameSync(tmp, contentPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code!;
      if (!["ENOTEMPTY", "EEXIST", "EPERM"].includes(code) || !Fs.existsSync(contentPath)) throw err;
      Fs.rmSync(tmp, { recursive: true, force: true });
      return { raced: true };
    }
    return { tree, stored: { shaSum, sumVersion: SUM_VERSION } };
  } catch (err) {
    Fs.rmSync(tmp, { recursive: true, force: true });
    throw err;
  }
}

/** Extract a tarball into targetDir, and return its tree from the tar headers */
export function untarFileSync(job: UntarJob): UntarTree {
  // bytes from another thread arrive as a plain Uint8Array
  const data = job.data ? Buffer.from(job.data.buffer, job.data.byteOffset, job.data.byteLength) : Fs.readFileSync(job.file);
  if (!ssri.checkData(data, job.integrity)) {
    throw Object.assign(new Error(`integrity check failed for ${job.file ?? job.targetDir}`), { code: "EINTEGRITY" });
  }
  Fs.mkdirSync(job.targetDir, { recursive: true });
  try {
    const { onentry, result } = treeCollector(job.strip);
    fastUntar(data, job.targetDir, job.strip, onentry);
    return result;
  } catch {
    // not a tarball fastUntar can do exactly as node-tar would, so start over with node-tar
    Fs.rmSync(job.targetDir, { recursive: true, force: true });
    Fs.mkdirSync(job.targetDir, { recursive: true });
  }
  const { onentry, result } = treeCollector(job.strip);
  new Tar.UnpackSync({ cwd: job.targetDir, strip: job.strip, strict: true, onReadEntry: onentry }).end(data);
  return result;
}

const runJob = ({ op, job }: FsJob): unknown => {
  if (op === "store") return storeJobSync(job);
  if (op === "scan") return scanShasumsSync(job.dir);
  if (op === "place") return placeFilesSync(job);
  return savePackument(job);
};

parentPort?.on("message", async ({ id, ...fsJob }: { id: number } & FsJob) => {
  try {
    const result = await runJob(fsJob as FsJob);
    parentPort!.postMessage({ id, result });
  } catch (err) {
    const { message, code, stack } = err as NodeJS.ErrnoException;
    parentPort!.postMessage({ id, error: { message, code, stack } });
  }
});
