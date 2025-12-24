/* eslint-disable no-magic-numbers */

import _ from "lodash";
import Fs from "./util/file-ops";
import logger from "./logger";
import PkgDistExtractor from "./pkg-dist-extractor";
import PromiseQueue from "./util/promise-queue";
import chalk from "chalk";
import longPending from "./long-pending";
import logFormat from "./util/log-format";
import { FETCH_PACKAGE, spinner } from "./log-items";
import * as hardLinkDir from "./util/hard-link-dir";
import DepItem from "./dep-item";
import { MARK_URL_SPEC } from "./constants";
import EventEmitter from "events";
import type { Readable } from "stream";

const WATCH_TIME = 2000;

/** Package info for fetching */
interface FetchPkg {
  name: string;
  version: string;
  local?: string;
  promoted?: boolean;
  extracted?: string;
  dsrc?: string;
  src?: string;
  requests?: string[][];
  dist?: {
    tarball?: string;
    integrity?: string;
    fullPath?: string;
  };
}

/** Package data structure */
interface PackageData {
  pkg: FetchPkg;
  listener?: EventEmitter;
  optional?: boolean;
  foundAtTop?: boolean;
}

/** Find result */
interface FindResult {
  foundAtTop: boolean;
  search: Array<{ dir: string; pkgJson?: Record<string, unknown> }>;
  existDir?: string;
  pkgJson?: Record<string, unknown> & { _invalid?: boolean; name?: string };
}

/** Fyn instance interface for dist fetcher */
interface FynForDistFetcher {
  concurrency: number;
  _options: { sourceMaps?: boolean };
  getInstalledPkgDir(name: string, version: string, opts?: { promoted?: boolean }): string;
  ensureProperPkgDir(pkg: FetchPkg): Promise<unknown>;
  loadJsonForPkg(
    pkg: FetchPkg,
    dir: string,
    validate?: boolean
  ): Promise<Record<string, unknown> & { _invalid?: boolean; name?: string }>;
  isNormalLayout: boolean;
}

/** Package source manager interface */
interface PkgSrcManager {
  fetchTarball(pkg: FetchPkg): Promise<Readable>;
  fetchUrlSemverMeta(depItem: DepItem): Promise<{
    urlVersions: Record<string, { dist: { fullPath: string } }>;
  }>;
}

/** Options for PkgDistFetcher constructor */
interface PkgDistFetcherOptions {
  fyn: FynForDistFetcher;
  pkgSrcMgr: PkgSrcManager;
}

class PkgDistFetcher {
  private _packages: Record<string, PackageData>;
  private _pkgSrcMgr: PkgSrcManager;
  private _grouping: { need: string[]; optional: string[]; byOptionalParent: string[] };
  private _startTime: number | null;
  private _fyn: FynForDistFetcher;
  private _promiseQ: PromiseQueue;
  private _distExtractor: PkgDistExtractor;

  constructor(options: PkgDistFetcherOptions) {
    this._packages = {};
    this._pkgSrcMgr = options.pkgSrcMgr;
    this._grouping = {
      need: [],
      optional: [],
      byOptionalParent: []
    };
    this._startTime = null;
    this._fyn = options.fyn;
    this._promiseQ = new PromiseQueue({
      concurrency: this._fyn.concurrency,
      stopOnError: true,
      watchTime: WATCH_TIME,
      processItem: (x: string) => this.fetchItem(x)
    });
    this._promiseQ.on("watch", items => longPending.onWatch(items));
    this._promiseQ.on("done", () => this.done());
    this._promiseQ.on("doneItem", x => this.handleItemDone(x));
    this._promiseQ.on("failItem", x => this.handleItemFail(x));
    // down stream extractor
    this._distExtractor = new PkgDistExtractor({ fyn: options.fyn as unknown as Parameters<typeof PkgDistExtractor>[0]["fyn"] });
    // immediately stop if down stream extractor failed
    this._distExtractor.once("fail", () => this._promiseQ.setItemQ([]));
  }

  async wait(): Promise<void> {
    try {
      await this._promiseQ.wait();
      await this._distExtractor.wait();

      if (this._startTime) {
        const time = logFormat.time(Date.now() - this._startTime);
        logger.info(`${chalk.green("done loading packages")} ${time}`);
      }
    } catch (err) {
      // TODO: should interrupt and stop dist exractor
      throw err;
    }
  }

  addSinglePkg(data: PackageData): void {
    this._addLogItem();
    const id = logFormat.pkgId(data.pkg);
    this._packages[id] = data;
    const stopOnError = !data.optional;
    this._promiseQ.addItem(id, undefined, stopOnError);
  }

  _addLogItem(): void {
    logger.addItem({ name: FETCH_PACKAGE, color: "green", spinner });
  }

  start(data: { getPkgsData(): Record<string, { versions: Record<string, FetchPkg> }> }): void {
    this._addLogItem();
    this._startTime = Date.now();
    _.each(data.getPkgsData(), (pkg, name) => {
      // pkg is a KnownPackage with versions property
      _.each(pkg.versions, (vpkg, version) => {
        const id = logFormat.pkgId(name, version);
        this._packages[id] = { pkg: vpkg };
        if (vpkg.dsrc && vpkg.dsrc.includes("opt")) {
          // only needed optionally
          return this._grouping.optional.push(id);
        } else if (vpkg.src && vpkg.src.includes("opt")) {
          // only needed by a parent that's needed optionally
          return this._grouping.byOptionalParent.push(id);
        } else {
          const byOptionalParent = !vpkg.requests.find(r => !_.last(r).startsWith("opt;"));
          if (byOptionalParent) {
            return this._grouping.byOptionalParent.push(id);
          }
        }
        return this._grouping.need.push(id);
      });
    });
    const itemQ = this._grouping.need // first fetch all the needed deps (dep/dev)
      .concat(this._grouping.optional) // then the optional deps
      .concat(this._grouping.byOptionalParent); // then deps pulled by an opt dep
    this._promiseQ.addItems(itemQ);
  }

  done(): void {
    logger.removeItem(FETCH_PACKAGE);
    if (this._startTime) {
      const time = logFormat.time(Date.now() - this._startTime);
      logger.info(`${chalk.green("packages fetched")} (part of loading) ${time}`);
    }
  }

  isPending(): boolean {
    return this._promiseQ.isPending || this._distExtractor.isPending();
  }

  handleItemDone(data: { res?: { result?: Readable; pkg?: FetchPkg }; item: string }): void {
    const result = _.get(data, "res.result");

    const { item } = data;
    const itemData = _.pick(this._packages[item], "listener");

    if (!result) {
      if (itemData.listener) {
        itemData.listener.emit("done");
      }
    } else {
      const pkg = _.get(data, "res.pkg");
      this._distExtractor.addPkgDist(Object.assign({ pkg, result }, itemData));
    }
  }

  handleItemFail(data: { item: string }): void {
    const { item } = data;
    const itemData = this._packages[item];

    if (itemData.listener) {
      itemData.listener.emit("fail");
    }
  }

  async _hardlinkPackage(pkg: FetchPkg, dir?: string): Promise<boolean> {
    const dist = pkg.dist || {};
    const tarball = dist.tarball || "";
    if (dist.integrity || !tarball.startsWith(MARK_URL_SPEC)) return false;

    // extract info from tarball string
    const info = JSON.parse(tarball.substr(MARK_URL_SPEC.length));
    if (!info.urlType.startsWith("git")) return false;

    let srcDir = dist.fullPath;

    if (!srcDir) {
      // no temp dir with the remote package retrieve, probably loaded from lockfile?
      // fetch manifest with spec info extracted
      const depItem = new DepItem({ name: pkg.name, semver: info.semver });
      const meta = await this._pkgSrcMgr.fetchUrlSemverMeta(depItem);
      srcDir = meta.urlVersions[info.semver].dist.fullPath;
    }

    const destDir = dir || this._fyn.getInstalledPkgDir(pkg.name, pkg.version, pkg);

    await hardLinkDir.link(srcDir, destDir, { sourceMaps: this._fyn._options.sourceMaps });
    await Fs.$.rimraf(srcDir);

    return true;
  }

  async fetchItem(item: string): Promise<{ result?: Readable; pkg?: FetchPkg } | undefined> {
    const { pkg } = this._packages[item];

    if (pkg.local) return undefined;

    const json = await this._fyn.ensureProperPkgDir(pkg);

    // valid json read from pkg dir, assume previous installed node_modules, do nothing
    if (json) return {};

    // fetch package tarball
    try {
      if (await this._hardlinkPackage(pkg)) {
        return {};
      } else {
        const result = await this._pkgSrcMgr.fetchTarball(pkg);
        return { result, pkg };
      }
    } catch (err) {
      const pkgName = logFormat.pkgId(pkg);
      logger.debug(`dist-fetcher fetch ${pkgName} tarball failed`, chalk.red(err.message));
      logger.debug("STACK", err.stack);
      throw err;
    }
  }

  /**
   * Check if pkg already has a copy extracted to node_modules
   * @param pkg - package info
   * @returns pkg in FV_DIR and its package.json
   */
  async findPkgInNodeModules(pkg: FetchPkg): Promise<FindResult> {
    const { name, version } = pkg;
    const result: FindResult = {
      foundAtTop: false,
      search: []
    };

    const find = async (promoted: boolean): Promise<boolean> => {
      const existDir = this._fyn.getInstalledPkgDir(name, version, { promoted });
      const x = { dir: existDir };
      result.search.push(x);

      try {
        const pkgJson = await this._fyn.loadJsonForPkg(pkg, existDir, true);
        x.pkgJson = pkgJson;
        if (!pkgJson._invalid) {
          result.existDir = existDir;
          result.pkgJson = pkgJson;
          return true;
        } else if (pkgJson.name && promoted && pkg.promoted) {
          // actually found a package.json file at top, so need to force
          // extracting it to __fv_, and get it to the right place later after
          // all resolve are done.
          result.foundAtTop = true;
        }
      } catch (err) {
        //
      }

      return false;
    };

    if (this._fyn.isNormalLayout) {
      // check if a copy already exist at top
      if (await find(true)) {
        return result;
      }
    }

    await find(false);

    return result;
  }

  //
  // Handles putting pkg into node_modules/${FV_DIR}/${version}/${pkgName}
  //
  async putPkgInNodeModules(
    pkg: FetchPkg,
    check?: boolean,
    optional?: boolean
  ): Promise<Record<string, unknown> | undefined> {
    const find: Partial<FindResult> = check ? await this.findPkgInNodeModules(pkg) : {};
    if (find && find.pkgJson) {
      pkg.extracted = find.existDir;
      return find.pkgJson;
    }

    // TODO: check if version is a symlink and create a symlink
    // hardlink to local package
    if (pkg.local === "hard" && (await this._hardlinkPackage(pkg, find?.existDir))) {
      return find?.pkgJson;
    }

    // finally fetch tarball and extract

    const listener = new EventEmitter();
    return await new Promise((resolve, reject) => {
      listener.once("done", resolve);
      listener.once("fail", reject);
      this.addSinglePkg({
        pkg,
        listener,
        foundAtTop: find.foundAtTop,
        optional
      });
    });
  }
}

export default PkgDistFetcher;