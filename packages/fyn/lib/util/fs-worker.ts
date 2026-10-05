/*
 * File work for the central store, off the main thread: untar a cached tarball into the store,
 * and place a stored package's files into node_modules. Each costs a few ms of CPU per
 * package; on a slow CPU, doing them on the main thread starves downloads. Built to
 * dist/fs-worker.mjs, and run by fs-worker-pool.ts.
 */

import Fs from "node:fs";
import { parentPort } from "node:worker_threads";
import ssri from "ssri";
import * as Tar from "tar";
import { fastUntar } from "./fast-untar";
import { placeFilesSync, type PlaceJob, type PlaceResult } from "./place-files";
import { treeCollector, type UntarTree } from "./untar-tree";

export interface UntarJob {
  /** the tarball, a cacache content file */
  file: string;
  /** checked against the file before extracting */
  integrity: string;
  targetDir: string;
  strip: number;
}

export type FsJob = { op: "untar"; job: UntarJob } | { op: "place"; job: PlaceJob };

export interface FsJobResult {
  untar: UntarTree;
  place: PlaceResult;
}

/** Extract a tarball file into targetDir, and return its tree from the tar headers */
export function untarFileSync(job: UntarJob): UntarTree {
  const data = Fs.readFileSync(job.file);
  if (!ssri.checkData(data, job.integrity)) {
    throw Object.assign(new Error(`integrity check failed for ${job.file}`), { code: "EINTEGRITY" });
  }
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

parentPort?.on("message", ({ id, op, job }: { id: number } & FsJob) => {
  try {
    const result = op === "untar" ? untarFileSync(job) : placeFilesSync(job);
    parentPort!.postMessage({ id, result });
  } catch (err) {
    const { message, code, stack } = err as NodeJS.ErrnoException;
    parentPort!.postMessage({ id, error: { message, code, stack } });
  }
});
