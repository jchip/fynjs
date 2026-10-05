
import * as Tar from "tar";
import logger from "./logger";
import PromiseQueue from "./util/promise-queue";
import logFormat from "./util/log-format";
import { LOAD_PACKAGE } from "./log-items";
import fyntil from "./util/fyntil";
import Fs from "./util/file-ops";
import * as _ from "lodash-es";
import Path from "path";
import xaa from "./util/xaa";
import type { Readable } from "stream";
import type { EventEmitter } from "events";
import type { PkgVersionInfo, InstalledPkgJson } from "./types";
import { POOL_SIZE } from "./util/fs-worker-pool";

const { retry, missPipe } = fyntil;

/** The slice of a `PkgVersionInfo` that extraction reads and writes */
type ExtractPkg = Pick<PkgVersionInfo, "name" | "version" | "promoted" | "extracted">;

/**
 * A package not in the central store yet. The extractor stores it and then replicates it, so
 * the extraction runs here and doesn't hold a download slot.
 */
export interface CentralStoreJob {
  integrity: string;
  /** resolves false when deferred, because another install is storing it right now */
  store(deferIfBusy: boolean): Promise<boolean>;
}

/** Data passed to processItem */
interface ExtractData {
  pkg: ExtractPkg;
  /** a tarball stream, a central store integrity, or a package to store first */
  result?: string | Readable | CentralStoreJob;
  listener?: EventEmitter;
  /** already moved to the end of the queue once, because another install was storing it */
  deferred?: boolean;
}

const isStoreJob = (result: ExtractData["result"]): result is CentralStoreJob =>
  typeof (result as CentralStoreJob | undefined)?.store === "function";

/** Fyn instance interface for dist extractor */
export interface FynForExtractor {
  getInstalledPkgDir(name: string, version: string, opts?: { promoted?: boolean }): string;
  getExtraDir(name?: string): string;
  getFvDir(version: string): string;
  ensureProperPkgDir(pkg: ExtractPkg, fullOutDir?: string): Promise<InstalledPkgJson | null>;
  createPkgOutDir(dir: string): Promise<void>;
  loadJsonForPkg(pkg: ExtractPkg, fullOutDir: string): Promise<InstalledPkgJson>;
  isNormalLayout: boolean;
  extractConcurrency?: number;
  /** `false` when the central store is off - every read of this guards on it first */
  central:
    | {
        replicate(src: string, dest: string): Promise<void>;
      }
    | false;
}

/** Options for PkgDistExtractor constructor */
interface PkgDistExtractorOptions {
  fyn: FynForExtractor;
}

/** Queue done event data */
interface QueueDoneData {
  totalTime: number;
}

class PkgDistExtractor {
  private _promiseQ: PromiseQueue;
  private _fyn: FynForExtractor;

  constructor(options: PkgDistExtractorOptions) {
    this._promiseQ = new PromiseQueue({
      // one job per fs worker, plus one so a worker isn't idle while the main thread finishes a
      // job. Past 4 it got slower even with 13 workers, as the jobs contend for the disk.
      concurrency: options.fyn.extractConcurrency || Math.min(4, POOL_SIZE + 1),
      stopOnError: true,
      processItem: (x: ExtractData, id: number) => this.processItem(x, id)
    });
    this._fyn = options.fyn;
    this._promiseQ.on("done", (x: QueueDoneData) => this.done(x));
    this._promiseQ.on("failItem", (x: { error: Error; item?: ExtractData }) => {
      logger.error("dist extractor failed item", x.error);
      // reject the per-item listener (from PkgDistFetcher.putPkgInNodeModules);
      // otherwise a failed extraction (e.g. corrupted tarball, central-store
      // replicate error) leaves that promise unsettled and install hangs.
      const listener = x.item?.listener;
      if (listener) {
        setTimeout(() => listener.emit("fail", x.error), 0);
      }
    });
  }

  addPkgDist(data: ExtractData): void {
    this._promiseQ.addItem(data);
  }

  once(evt: string, cb: (...args: unknown[]) => void): void {
    this._promiseQ.once(evt, cb);
  }

  wait(): Promise<void> {
    return this._promiseQ.wait();
  }

  done(data: QueueDoneData): void {
    logger.debug("done dist extracting", data.totalTime / 1000);
  }

  isPending(): boolean {
    return this._promiseQ.isPending;
  }

  /**
   * Process normal layout for node_modules.
   *
   * Move promoted packages to top output dir
   *
   * @param pkg - package to move
   * @param fullOutDir - top output dir
   */
  async movePromotedPkgFromFV(pkg: ExtractPkg, fullOutDir: string): Promise<void> {
    logger.debug(
      "moving promoted extracted package",
      pkg.name,
      pkg.version,
      "to top level",
      fullOutDir
    );

    //
    // first make sure top dir is clear of any other files
    // then rename node_modules/${FV_DIR}/<version>/<pkg-name>/ to node_modules/<pkg-name>
    //

    if (await xaa.try(() => Fs.lstat(fullOutDir))) {
      await Fs.$.mkdirp(this._fyn.getExtraDir());
      await Fs.rename(fullOutDir, this._fyn.getExtraDir(`${pkg.name}-${pkg.version}`));
    }

    const hostingDir = Path.dirname(fullOutDir);
    if (!(await xaa.try(() => Fs.stat(hostingDir)))) {
      await Fs.$.mkdirp(hostingDir);
    }

    await Fs.rename(pkg.extracted, fullOutDir);
    // clean empty node_modules/${FV_DIR}/<version> directory
    await xaa.try(() => Fs.rmdir(this._fyn.getFvDir(pkg.version)));
  }

  async processItem(
    data: ExtractData,
    _id: number,
    promoted?: boolean
  ): Promise<unknown> {
    const { pkg } = data;

    const promotedOpt = _.defaults({ promoted }, _.pick(pkg, "promoted")) as { promoted?: boolean };
    const fullOutDir = this._fyn.getInstalledPkgDir(pkg.name, pkg.version, promotedOpt);

    // do we have a copy of it in FV_DIR already?
    if (pkg.extracted && pkg.extracted === fullOutDir) {
      logger.debug(
        `package ${pkg.name} ${pkg.version} has already been extracted to ${pkg.extracted}`
      );

      // if in normal layout and it's extracted to FV_DIR, but promoted, then move it to top dir
      if (this._fyn.isNormalLayout && pkg.promoted && !promotedOpt.promoted) {
        await this.movePromotedPkgFromFV(pkg, fullOutDir);
      }
    } else {
      const json = await this._fyn.ensureProperPkgDir(pkg, fullOutDir);

      if (json) {
        // already extracted to fullOutDir; still notify the listener so the
        // awaiting putPkgInNodeModules promise settles instead of hanging.
        if (data.listener) {
          const listener = data.listener;
          setTimeout(() => listener.emit("done", json), 0);
        }
        return json;
      }

      const job = data.result;
      // A package something is waiting on is never deferred, nor one deferred once already.
      if (isStoreJob(job) && !(await job.store(!data.listener && !data.deferred))) {
        // another install is storing it in the central store; do the rest of the queue first
        data.deferred = true;
        this._promiseQ.addItem(data);
        return undefined;
      }
      const result = isStoreJob(job) ? job.integrity : job;

      await this._fyn.createPkgOutDir(fullOutDir);

      let act: string;
      let retrieve: () => Promise<void>;

      if (typeof result === "string") {
        act = "hardlink";
        retrieve = () => {
          // a string result is a central store path, so the store is enabled here
          const central = this._fyn.central as {
            replicate(src: string, dest: string): Promise<void>;
          };
          return central.replicate(result, fullOutDir);
        };
      } else {
        act = "extract";
        retrieve = () => {
          const untarStream = Tar.x({
            strip: 1,
            strict: true,
            C: fullOutDir
          });
          return missPipe(result, untarStream);
        };
      }

      logger.debug(`${act}ing ${pkg.name} ${pkg.version}`, "to", fullOutDir);

      await retrieve();

      pkg.extracted = fullOutDir;

      const msg = logFormat.pkgPath(pkg.name, fullOutDir);
      logger.updateItem(LOAD_PACKAGE, `${act}ed ${msg}`);
    }

    // when there're numerous fyn with central store enabled install happening,
    // somehow read pkg json of the newly linked package fails, but then the
    // file is there when inspect after. Basically wtf!  anyways, throw in some
    // retry, and it does occur and then succeeds.  Tested on Macbook pro High Sierra.
    let retries = 0;
    return retry(
      () => this._fyn.loadJsonForPkg(pkg, fullOutDir),
      () => {
        retries++;
        logger.warn(`retrying ${retries} reading package.json`, fullOutDir);
        return true;
      },
      5,
      10
    ).tap(pkgJson => {
      if (data.listener) {
        const listener = data.listener;
        setTimeout(() => listener.emit("done", pkgJson), 0);
      }
    });
  }
}

export default PkgDistExtractor;
