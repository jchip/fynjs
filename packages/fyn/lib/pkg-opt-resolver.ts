/* eslint-disable max-nested-callbacks, no-param-reassign */

import assert from "assert";
import xsh from "xsh";
import _ from "lodash";
import Promise from "./util/aveazul";
import PromiseQueue from "./util/promise-queue";
import logger from "./logger";
import Inflight from "./util/inflight";
import LifecycleScripts from "./lifecycle-scripts";
import chalk from "chalk";
import * as hardLinkDir from "./util/hard-link-dir";
import longPending from "./long-pending";
import logFormat from "./util/log-format";
import PkgDepLinker, { type FynForDepLinker } from "./pkg-dep-linker";
import * as semverUtil from "./util/semver";
import fyntil from "./util/fyntil";
import { OPTIONAL_RESOLVER } from "./log-items";

const { readPkgJson } = fyntil;
xsh.Promise = Promise;

/** Optional dependency item */
interface OptDepItem {
  name: string;
  resolved: string;
  optChecked?: boolean;
  optFailed?: number;
  runningScript?: boolean;
}

/** Optional dependency data */
interface OptDepData {
  item: OptDepItem;
  meta: {
    local?: string;
    versions: Record<
      string,
      {
        local?: string;
        optFailed?: number;
        hasPI?: number;
        fromLocked?: boolean;
        scripts?: { preinstall?: string };
        dist?: { fullPath?: string };
        [key: string]: unknown;
      }
    >;
  };
  err?: Error;
}

/** Check result */
interface CheckResult {
  passed: boolean;
  err?: Error;
}

/** Fyn instance interface for opt resolver - extends dep linker interface */
interface FynForOptResolver extends FynForDepLinker {
  _options: { sourceMaps?: boolean };
  refreshOptionals?: boolean;
  lockOnly?: boolean;
  _distFetcher: {
    findPkgInNodeModules(pkg: { name: string; version: string }): Promise<{
      pkgJson?: Record<string, unknown>;
      existDir?: string;
    }>;
    putPkgInNodeModules(
      pkg: Record<string, unknown>,
      check: boolean,
      optional: boolean
    ): Promise<unknown>;
  };
}

/** Dep resolver interface */
interface DepResolver {
  addPackageResolution(item: OptDepItem, meta: OptDepData["meta"], version: string): Promise<void>;
  start(): void;
}

//
// resolve optional dependencies
//
// If a package is in optional dep, then it should be:
//
// - the package itself resolved to a version with its meta.
// - queue up for deferred processing until regular dep are all resolved
// - optional packages are fetched and extracted to FV_DIR
// - execute its preinstall script
// - package that failed is ignore
// - package that passed is added back to the regular resolving pipeline
// - all results saved for logging at the end
// - expect final clean-up to remove any ignored packages
//

class PkgOptResolver {
  private _optPkgCount: number;
  private _passedPkgs: OptDepData[];
  private _checkedPkgs: Record<string, CheckResult>;
  private _resolving: boolean;
  private _failedChecks: Array<{ err?: Error; data: OptDepData }>;
  private _failedPkgs: OptDepData[];
  private _depResolver: DepResolver;
  private _inflights: Inflight;
  private _fyn: FynForOptResolver;
  private _depLinker: PkgDepLinker;
  private _promiseQ!: PromiseQueue;

  constructor(options: { depResolver: DepResolver; fyn: FynForOptResolver }) {
    this._optPkgCount = 0;
    this._passedPkgs = [];
    this._checkedPkgs = {};
    this._resolving = false;
    this._failedChecks = [];
    this._failedPkgs = [];
    this._depResolver = options.depResolver;
    this._inflights = new Inflight();
    this._fyn = options.fyn;
    this._depLinker = new PkgDepLinker({ fyn: this._fyn });
    this.setupQ();
  }

  setupQ(): void {
    this._promiseQ = new PromiseQueue({
      concurrency: 2,
      stopOnError: false,
      watchTime: 2000,
      processItem: (x: OptDepData) => this.optCheck(x)
    });
    this._promiseQ.on("watch", items => {
      items.watched = items.watched.filter((x: { item: OptDepData }) => !x.item.item?.runningScript);
      items.still = items.still.filter((x: { item: OptDepData }) => !x.item.item?.runningScript);
      items.total = items.watched.length + items.still.length;
      longPending.onWatch(items, {
        makeId: (item: { item: OptDepData }) => {
          const depItem = item.item.item;
          return chalk.magenta(`${depItem.name}@${depItem.resolved}`);
        }
      });
    });
    this._promiseQ.on("done", () => logger.removeItem(OPTIONAL_RESOLVER));
    this._promiseQ.on("fail", x => logger.error("opt-check fail", x));
    this._promiseQ.on("failItem", x => logger.error("opt-check failItem", x.error));
  }

  //
  // optDep should contain:
  // - the item for the optional dep
  // - the meta info for the whole package
  //
  add(optDep: OptDepData): void {
    this._optPkgCount++;
    this._promiseQ.addItem(optDep, true);
  }

  start(): void {
    this._promiseQ._process();
  }

  //
  // - check if installed under node_modules
  // - check if installed under FV_DIR
  // - if none, then fetch tarball and extract to FV_DIR
  // - run preinstall npm script
  // - check if exit 0 or not
  // - 0: add item back to resolve
  // - not: add item to queue for logging at end
  //
  /* eslint-disable max-statements */
  optCheck(data: OptDepData): Promise<void> {
    const name = data.item.name;
    const version = data.item.resolved;
    const pkgId = `${name}@${version}`;
    const displayId = logFormat.pkgId(data.item);

    const processCheckResult = (promise: Promise<CheckResult>): Promise<void> => {
      return promise.then(res => {
        if (res.passed) {
          // exec exit status 0, add to defer resolve queue
          this._passedPkgs.push(data);
        } else {
          // exec failed, add to queue for logging at end
          this._failedPkgs.push(data);
          this._failedChecks.push({ err: res.err, data });
        }
      });
    };

    const addChecked = (res: CheckResult): void => {
      if (!this._checkedPkgs[pkgId]) {
        this._checkedPkgs[pkgId] = res;
      }
    };

    const logFail = (msg: string): void => {
      logger.warn(chalk.yellow(`optional dep check failed`), displayId, chalk.yellow(`- ${msg}`));
      logger.info(
        chalk.green(`  you may ignore this since it is optional but some features may be missing`)
      );
    };

    const logPass = (msg: string, level?: string): void => {
      level = level || "verbose";
      (logger as Record<string, (...args: unknown[]) => void>)[level](
        chalk.green(`optional dep check passed`),
        displayId,
        chalk.green(`- ${msg}`)
      );
    };

    // already check completed, just use existing result
    const checkedPkgRes = this._checkedPkgs[pkgId];
    if (checkedPkgRes) {
      return processCheckResult(Promise.resolve(checkedPkgRes));
    }

    // already check in progress
    const inflight = this._inflights.get(pkgId);
    if (inflight) {
      logger.debug("opt check reusing existing inflight for", pkgId);
      return processCheckResult(inflight);
    }

    if (!this._fyn.refreshOptionals && _.get(data, ["meta", "versions", version, "optFailed"])) {
      logFail("by flag optFailed in lockfile");
      const rx = {
        passed: false,
        err: new Error("optional dep fail by flag optFailed in lockfile")
      };
      addChecked(rx);
      return processCheckResult(Promise.resolve(rx));
    }

    const checkPkg = (
      path: string
    ): Promise<false | { path: string; pkg: Record<string, unknown> }> => {
      return readPkgJson(path, true).then((pkg: Record<string, unknown>) => {
        return semverUtil.equal(pkg.version as string, version) && { path, pkg };
      });
    };

    const fvInstalledPath = this._fyn.getInstalledPkgDir(name, version);

    const linkLocalPackage = async (): Promise<
      false | { path: string; pkg: Record<string, unknown> }
    > => {
      const meta = data.meta;
      const local = meta.local || _.get(meta, ["versions", version, "local"]);
      logger.debug("opt resolver", name, version, "local", local);
      if (!local) return false;

      const dist = meta.versions[version].dist;
      logger.debug("opt resolver linking local package", name, version, dist);
      if (local === "sym") {
        // await this._depLinker.symlinkLocalPackage(fvInstalledPath, dist.fullPath);
        throw new Error("only hard linking local mode supported now. symlinking local deprecated");
      } else {
        await hardLinkDir.link(dist.fullPath, fvInstalledPath, {
          sourceMaps: this._fyn._options.sourceMaps
        });
      }
      return checkPkg(fvInstalledPath);
    };

    // is it under node_modules/<name> and has the right version?
    const promise = Promise.try(() => {
      if (data.err) {
        return "metaFail";
      }

      const pkgFromMeta = data.meta.versions[version];

      const scripts = pkgFromMeta.scripts;

      if (pkgFromMeta.fromLocked) {
        // it's locked meta and hasPI is not 1
        if (!this._fyn.refreshOptionals && pkgFromMeta.hasPI !== 1) {
          return pkgFromMeta;
        }
      } else if (!scripts || !scripts.preinstall) {
        // full meta and doesn't have scripts or preinstall in scripts
        return pkgFromMeta;
      }

      // package actually has preinstall script, first check if it's already
      // installed at top level in node_modules
      const pkg = Object.assign({}, pkgFromMeta, { name, version });

      return this._fyn._distFetcher.findPkgInNodeModules(pkg).then(find => {
        if (find.pkgJson) {
          return { pkg: find.pkgJson, path: find.existDir };
        }

        if (this._fyn.lockOnly) {
          // regen only, don't bother fetching anything
          return "lockOnlyFail";
        }

        // no existing install found, try to link local or fetch tarball into
        // ${FV_DIR}/<version>/<name>.
        return linkLocalPackage().then(linked => {
          if (linked) return linked;
          return this._fyn._distFetcher
            .putPkgInNodeModules(pkg, false, true)
            .then(() => checkPkg(fvInstalledPath))
            .catch(() => {
              return "fetchFail";
            });
        });
      });
    })
      // .catch(async () => {
      //   return (await linkLocalPackage()) || fetchPkgTarball(fvInstalledPath);
      // })
      .then(res => {
        if (res === "lockOnlyFail") {
          logFail("lock only but no package tarball");
          return { passed: false };
        }
        if (res === "fetchFail") {
          logFail("fetch tarball failed, your install likely will be bad.");
          return { passed: false };
        }
        if (res === "metaFail") {
          logFail("fetch meta failed");
          return { passed: false };
        }
        // run npm script `preinstall`
        if (!this._fyn.refreshOptionals && _.get(res, "pkg._fyn.preinstall")) {
          // package already installed and its package.json has _fyn.preinstall set
          // so do not run preinstall script again
          logPass(
            `_fyn.preinstall from package.json is '${res.pkg._fyn.preinstall}' => script already passed`
          );
          return { passed: true };
        } else if (_.get(res, "pkg.scripts.preinstall")) {
          data.runningScript = true;
          logger.updateItem(OPTIONAL_RESOLVER, `running preinstall for ${displayId}`);
          const ls = new LifecycleScripts({
            appDir: this._fyn.cwd,
            _fyn: this._fyn,
            dir: res.path,
            json: res.pkg
          });
          return ls
            .execute(["preinstall"], true)
            .then(() => {
              logPass("preinstall script exit with code 0", "info");
              return { passed: true };
            })
            .catch(err => {
              logFail("preinstall script failed");
              return { passed: false, err };
            });
        } else {
          // no preinstall script, always pass
          logPass(`package ${name} has no preinstall script`);
          return { passed: true };
        }
      })
      .tap(res => {
        assert(
          this._checkedPkgs[pkgId] === undefined,
          `opt-resolver already checked package ${pkgId}`
        );
        addChecked(res);
      })
      .finally(() => {
        this._inflights.remove(pkgId);
      });

    this._inflights.add(pkgId, promise);

    return processCheckResult(promise);
  }

  resolve(): Promise<void> {
    this._optPkgCount = 0;
    this._resolving = true;
    this.start();
    return this._promiseQ.wait().then(async () => {
      for (const x of this._passedPkgs) {
        x.item.optChecked = true;
        await this._depResolver.addPackageResolution(x.item, x.meta, x.item.resolved);
      }
      for (const x of this._failedPkgs) {
        x.item.optChecked = true;
        x.item.optFailed = _.get(x, ["meta", "versions", x.item.resolved, "optFailed"], 1);
        await this._depResolver.addPackageResolution(x.item, x.meta, x.item.resolved);
      }
      this._passedPkgs = [];
      this._failedPkgs = [];
      this._resolving = false;
      this._depResolver.start();
    });
  }

  isPending(): boolean {
    return this._resolving === true;
  }

  isEmpty(): boolean {
    return this._optPkgCount === 0;
  }
}

export default PkgOptResolver;