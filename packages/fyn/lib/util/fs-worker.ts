/*
 * Work off the main thread: untar a cached tarball into the central store, place a stored
 * package's files into node_modules, and turn a packument response into fyn's trimmed copy.
 * Each costs a few ms of CPU per package; on a slow CPU, doing them on the main thread starves
 * downloads. Built to dist/fs-worker.mjs, and run by fs-worker-pool.ts.
 */

import Fs from "node:fs";
import { parentPort } from "node:worker_threads";
import ssri from "ssri";
import * as Tar from "tar";
import { fastUntar } from "./fast-untar";
import { placeFilesSync, type PlaceJob, type PlaceResult } from "./place-files";
import { treeCollector, type UntarTree } from "./untar-tree";
import { savePackument, type SavePackumentJob, type SavePackumentResult } from "./trimmed-packument";

/** A tarball as a file, such as a cacache content file, or as the bytes a download returned */
export type TarSource = { file: string; data?: undefined } | { data: Uint8Array; file?: undefined };

export type UntarJob = TarSource & {
  /** checked against the tarball before extracting */
  integrity: string;
  targetDir: string;
  strip: number;
};

export type FsJob =
  | { op: "untar"; job: UntarJob }
  | { op: "place"; job: PlaceJob }
  | { op: "savePackument"; job: SavePackumentJob };

export interface FsJobResult {
  untar: UntarTree;
  place: PlaceResult;
  savePackument: SavePackumentResult;
}

/** Extract a tarball into targetDir, and return its tree from the tar headers */
export function untarFileSync(job: UntarJob): UntarTree {
  // bytes from another thread arrive as a plain Uint8Array
  const data = job.data ? Buffer.from(job.data.buffer, job.data.byteOffset, job.data.byteLength) : Fs.readFileSync(job.file);
  if (!ssri.checkData(data, job.integrity)) {
    throw Object.assign(new Error(`integrity check failed for ${job.file ?? job.targetDir}`), { code: "EINTEGRITY" });
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

const runJob = ({ op, job }: FsJob): unknown => {
  if (op === "untar") return untarFileSync(job);
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
