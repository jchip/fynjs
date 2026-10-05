/*
 * A pool of fs workers (see fs-worker.ts). The workers start on the first job, so an install
 * that writes no files never pays for them.
 */

import Fs from "node:fs";
import Os from "node:os";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import logger from "../logger";
import type { FsJob, FsJobResult } from "./fs-worker";

interface Pending {
  job: FsJob;
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
}

interface PoolWorker {
  worker: Worker;
  busy?: Pending;
}

/** One worker less than the CPUs, for the main thread, and at most 8 */
export const POOL_SIZE = Math.max(1, Math.min(8, Os.availableParallelism() - 1));

class FsWorkerPool {
  private _file: string;
  private _workers: PoolWorker[] = [];
  private _queue: Pending[] = [];
  private _nextId = 0;

  constructor(file: string) {
    this._file = file;
  }

  run<Op extends FsJob["op"]>(op: Op, job: Extract<FsJob, { op: Op }>["job"]): Promise<FsJobResult[Op]> {
    return new Promise((resolve, reject) => {
      this._queue.push({ job: { op, job } as FsJob, resolve: resolve as Pending["resolve"], reject });
      this._dispatch();
    });
  }

  private _dispatch(): void {
    while (this._queue.length > 0) {
      let pw = this._workers.find(w => !w.busy);
      if (!pw) {
        if (this._workers.length >= POOL_SIZE) return;
        pw = this._start();
      }
      const pending = this._queue.shift()!;
      pw.busy = pending;
      // a busy worker keeps the process alive, an idle one doesn't
      pw.worker.ref();
      pw.worker.postMessage({ id: this._nextId++, ...pending.job });
    }
  }

  private _start(): PoolWorker {
    const pw: PoolWorker = { worker: new Worker(this._file) };
    pw.worker.on("message", (msg: { result?: unknown; error?: { message: string; code?: string; stack?: string } }) => {
      const pending = pw.busy!;
      pw.busy = undefined;
      pw.worker.unref();
      if (msg.error) {
        pending.reject(Object.assign(new Error(msg.error.message), msg.error));
      } else {
        pending.resolve(msg.result);
      }
      this._dispatch();
    });
    pw.worker.on("error", (err: Error) => {
      // the worker is gone: fail its job, and start a new one for the rest
      this._workers = this._workers.filter(w => w !== pw);
      pw.busy?.reject(err);
      pw.busy = undefined;
      this._dispatch();
    });
    this._workers.push(pw);
    return pw;
  }
}

let pool: FsWorkerPool | false | undefined;

/**
 * The pool, or undefined when there's no built worker next to this module, which is the case
 * when running from source. Callers then do the work in-thread.
 */
export function getFsWorkerPool(): FsWorkerPool | undefined {
  if (pool === undefined) {
    const file = fileURLToPath(new URL("./fs-worker.mjs", import.meta.url));
    pool = Fs.existsSync(file) && new FsWorkerPool(file);
    logger.debug(pool ? `fs workers: up to ${POOL_SIZE} from ${file}` : "fs workers: none built, working in-thread");
  }
  return pool || undefined;
}
