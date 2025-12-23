/* eslint-disable no-magic-numbers, max-statements */

import Tar from "tar";
import logger from "./logger";
import PromiseQueue from "./util/promise-queue";
import logFormat from "./util/log-format";
import { LOAD_PACKAGE } from "./log-items";
import fyntil from "./util/fyntil";
import Fs from "./util/file-ops";
import _ from "lodash";
import Path from "path";
import xaa from "./util/xaa";
import type { Readable } from "stream";
import type { EventEmitter } from "events";

const { retry, missPipe } = fyntil;

/** Package info for extraction */
interface ExtractPkg {
  name: string;
  version: string;
  promoted?: boolean;
  extracted?: string;
}

/** Data passed to processItem */
interface ExtractData {
  pkg: ExtractPkg;
  result?: string | Readable;
  listener?: EventEmitter;
}

/** Fyn instance interface for dist extractor */
interface FynForExtractor {
  getInstalledPkgDir(name: string, version: string, opts?: { promoted?: boolean }): string;
  getExtraDir(name?: string): string;
  getFvDir(version: string): string;
  ensureProperPkgDir(pkg: ExtractPkg, fullOutDir: string): Promise<unknown>;
  createPkgOutDir(dir: string): Promise<void>;
  loadJsonForPkg(pkg: ExtractPkg, fullOutDir: string): Promise<unknown>;
  isNormalLayout: boolean;
  central: {
    replicate(src: string, dest: string): Promise<void>;
  };
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
      concurrency: 4, // don't want to untar too many files at the same time
      stopOnError: true,
      processItem: (x: ExtractData, id: number) => this.processItem(x, id)
    });
    this._fyn = options.fyn;
    this._promiseQ.on("done", (x: QueueDoneData) => this.done(x));
    this._promiseQ.on("failItem", (x: { error: Error }) =>
      logger.error("dist extractor failed item", x.error)
    );
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
        return json;
      }

      await this._fyn.createPkgOutDir(fullOutDir);

      const result = data.result;
      let act: string;
      let retrieve: () => Promise<void>;

      if (typeof result === "string") {
        act = "hardlink";
        retrieve = () => {
          return this._fyn.central.replicate(result, fullOutDir);
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