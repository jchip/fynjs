import Path from "path";
import Promise from "./util/aveazul";
import _ from "lodash";
import chalk from "chalk";
import Fs from "./util/file-ops";
import PkgDepLinker, { type FynForDepLinker } from "./pkg-dep-linker";
import PkgBinLinker, { type FynForBinLinker } from "./pkg-bin-linker";
import PkgDepLocker, { type FynForDepLocker } from "./pkg-dep-locker";
import logger from "./logger";
import logFormat from "./util/log-format";
import fynTil from "./util/fyntil";
import * as hardLinkDir from "./util/hard-link-dir";
import {
  makeLocalExportsManifest,
  reconcileLocalExports,
  resolveLocalExportsConfig
} from "./local-exports";
import { INSTALL_PACKAGE } from "./log-items";
import { InstallScripts } from "./install-scripts";
import { runNpmScript } from "./util/run-npm-script";
import {
  evaluateScriptPolicy,
  isScriptAllowed,
  strictestScriptPolicy,
  LIFECYCLE_SCRIPTS
} from "./util/lifecycle-script-policy";
import {
  makeBlockedRecord,
  formatBlockedScriptsSummary,
  formatPendingScriptsSummary
} from "./util/script-policy-report";
import xaa from "./util/xaa";
import { AggregateError } from "@jchip/error";
import {
  RESOLVE_ORDER,
  RSEMVERS,
  LOCK_RSEMVERS,
  SEMVER,
  type DepInfo,
  type InstallPkgJson,
  type ResolutionData,
  type KnownPackage
} from "./types";
import type { DepData } from "./dep-data";
import type FynCentral from "./fyn-central";


/**
 * Extended KnownPackage with versions typed as DepInfo
 *
 * At runtime, version objects in the installer phase have been
 * extended with DepInfo properties (install state, scripts, etc.).
 */
type InstallerPkgsData = Record<string, KnownPackage & {
  versions: Record<string, DepInfo>;
}>;

/** Local link info for hard-linked packages */
interface LocalLinkInfo {
  srcDir: string;
  sourceMaps?: boolean;
}

/** FV versions structure */
type FvVersions = Record<string, string[] | null>;

/** Fyn instance interface for installer - extends linker and locker interfaces */
interface FynForInstaller extends FynForDepLinker, FynForBinLinker, FynForDepLocker {
  _data: DepData;
  _options: {
    sourceMaps?: boolean;
    buildLocal?: boolean;
    flattenTop?: boolean;
    layout?: string;
    ignoreLockUrl?: boolean;
  };
  _cwd: string;
  _depResolver: {
    resolvePkgPeerDep(pkg: unknown, name: string, data: DepData): void;
    resolvePeerDep(depInfo: DepInfo): void;
  };
  _pkg: Record<string, unknown>;
  _depLocker?: PkgDepLocker;
  _localPkgBuilder?: {
    waitForItem(dir: string): Promise<{ error?: Error } | null>;
  };
  cwd: string;
  central?: FynCentral | false;
  showDeprecated: string | false;
  lockOnly: string | false;
  allowScripts: Record<string, unknown>;
  scriptPolicy: string;
  allowScriptsPin: boolean;
  allowScriptsPending: boolean;
  scriptPolicyOptions: Record<string, unknown>;
  resetAllowScripts(): void;
  setBlockedScripts(blocked: BlockedScriptRecord[], pending?: BlockedScriptRecord[]): void;
  isNormalLayout: boolean;
  getOutputDir(): string;
  getInstalledPkgDir(name: string, version: string, pkg?: unknown): string;
  getFvDir(x?: string): string;
  loadFvVersions(): Promise<FvVersions>;
  setLocalPkgLinks(links: Record<string, LocalLinkInfo>): void;
  createSubNodeModulesDir(dir: string): Promise<string>;
}

/** A package whose install scripts the lifecycle-script policy blocked */
interface BlockedScriptRecord {
  name: string;
  version: string;
  key?: string;
  scripts: string[];
  urlType?: string;
  reason?: string;
  topLevel: boolean;
  local: boolean;
}

/** Options for PkgInstaller constructor */
interface PkgInstallerOptions {
  fyn: FynForInstaller;
}

/** Bin linker instance interface */
interface BinLinkerInstance {
  linkBin(depInfo: DepInfo): Promise<boolean>;
  linkDepBin(depInfo: DepInfo): Promise<void>;
  clearExtras(): Promise<void>;
}

class PkgInstaller {
  private _fyn: FynForInstaller;
  private _data: DepData;
  private _depLinker: PkgDepLinker;
  private _binLinker!: BinLinkerInstance;
  private _localLinks: Record<string, LocalLinkInfo>;
  private _stepTime!: number;
  private _fvVersions!: FvVersions;
  private _removedCount!: number;
  public preInstall!: DepInfo[] | undefined;
  public postInstall!: DepInfo[] | undefined;
  public toLink!: DepInfo[] | undefined;
  /** packages whose install scripts the policy blocked, reported once at the end */
  public blockedScripts: BlockedScriptRecord[] = [];
  /** packages that would need approval under "review" - only with --allow-scripts-pending */
  public pendingScripts: BlockedScriptRecord[] = [];
  /** the blocked packages themselves, so an approval at the prompt can queue their scripts */
  private _blockedDeps: { depInfo: DepInfo; candidates: string[] }[] = [];

  constructor(options: PkgInstallerOptions) {
    this._fyn = options.fyn;
    this._data = this._fyn._data;
    this._depLinker = new PkgDepLinker({ fyn: this._fyn });
    this._localLinks = {};
  }

  async install(): Promise<void> {
    this._stepTime = Date.now();

    this.timeCheck("beginning");
    const outputDir = this._fyn.getOutputDir();
    this._binLinker = new PkgBinLinker({ outputDir, fyn: this._fyn });
    // /*deprecated*/ const fynRes = await this._depLinker.readAppFynRes(outputDir);

    this.preInstall = [];
    this.postInstall = [];
    this.toLink = [];
    this.blockedScripts = [];
    this.pendingScripts = [];
    this._blockedDeps = [];
    this._data.cleanLinked();
    this._fyn._depResolver.resolvePkgPeerDep(this._fyn._pkg, "your app", this._data);
    // go through each package and insert
    // _depResolutions into its package.json
    const pkgsData = this._data.getPkgsData() as InstallerPkgsData;
    this.timeCheck("queueing packages");
    for (const info of this._data.resolvedPackages) {
      const depInfo = pkgsData[info.name].versions[info.version] as DepInfo;
      logger.debug("queuing", depInfo.name, depInfo.version, "for install");
      await this._gatherPkg(depInfo);
    }

    // /*deprecated*/ await this._depLinker.linkAppFynRes(this._data.res, fynRes._fynFo, this._fyn.getOutputDir());

    await this._reviewBlockedScripts();

    return this._doInstall().finally(() => {
      this.preInstall = undefined;
      this.postInstall = undefined;
      this.toLink = undefined;
      this._fyn.setLocalPkgLinks(this._localLinks);
    });
  }

  async _linkLocalPkg(depInfo: DepInfo): Promise<void> {
    // avoid linking multiple times
    if (depInfo.linkLocal) {
      return;
    }
    depInfo.linkLocal = true;

    const vdir = this._fyn.getInstalledPkgDir(depInfo.name, depInfo.version, depInfo);
    if (depInfo.local === "hard") {
      const { sourceMaps } = this._fyn._options;
      this._localLinks[Path.relative(this._fyn._cwd, vdir)] = {
        srcDir: Path.relative(this._fyn._cwd, depInfo.dir),
        sourceMaps
      };
      await hardLinkDir.link(depInfo.dir!, vdir, { sourceMaps });
    } else {
      // await this._depLinker.symlinkLocalPackage(vdir, depInfo.dir);
      // await this._depLinker.loadLocalPackageAppFynLink(depInfo, vdir);
      throw new Error("only hard linking local mode supported now.  symlinking local deprecated");
    }
  }

  async _savePkgJson(log?: boolean): Promise<void> {
    //
    // TODO: skip modifying package.json in node_modules
    // this was done to follow npm behavior of adding some extra fields
    // like _id and _from to installed package.json, but modifying package.json
    // is not compatible with central or local mode.
    //
    //
    for (const depInfo of this.toLink!) {
      // can't touch package.json if package is a symlink to the real
      // local package.
      if (depInfo.local === "sym" || depInfo._removed) {
        continue;
      }
      depInfo.json!._from = `${depInfo.name}@${depInfo[SEMVER]}`;
      depInfo.json!._id = `${depInfo.name}@${depInfo.version}`;
      const outputStr = JSON.stringify(depInfo.json, null, 2);
      if (log && depInfo.linkDep) {
        const pkgJson = depInfo.json!;
        logger.debug("linked dependencies for", pkgJson.name, pkgJson.version);
      }
      const hardLocalPkgJson =
        depInfo.local === "hard"
          ? Path.join(
              this._fyn.getInstalledPkgDir(depInfo.name, depInfo.version, depInfo),
              "package.json"
            )
          : undefined;

      if (depInfo.str!.trim() === outputStr.trim()) {
        // Nothing to write - but an installed manifest must not be left as an alias of the
        // local source manifest.  hardLinkDir linked the two, and the unlink below only
        // happens on the path that writes, so skipping the write used to leave them
        // sharing an inode: an in place write to the installed copy by anything at all
        // then lands on the tracked source file.  See FPM-76.
        if (hardLocalPkgJson) {
          await this._detachPkgJsonLink(hardLocalPkgJson);
        }
        continue;
      }
      let pkgJsonFp: string;
      if (hardLocalPkgJson) {
        // do not override hard linked package.json, instead remove it and
        // write a new physical file.
        pkgJsonFp = hardLocalPkgJson;
        await xaa.try(() => Fs.unlink(pkgJsonFp));
      } else {
        pkgJsonFp = Path.join(depInfo.dir!, "package.json");
      }
      depInfo.str = outputStr;
      try {
        await Fs.writeFile(pkgJsonFp, `${outputStr}\n`);
      } catch (err) {
        //
        // some package publish files with readonly set
        //
        if ((err as NodeJS.ErrnoException).code === "EPERM") {
          const st = await Fs.stat(pkgJsonFp);
          // OR in owner read/write; arithmetic + carried into higher mode bits
          // for a read-only file (0o444 + 0o600 = 0o1244) and dropped owner read.
          await Fs.chmod(pkgJsonFp, st.mode | 0o600);
          await Fs.writeFile(pkgJsonFp, `${outputStr}\n`);
        }
      }
    }
  }

  /**
   * Give an installed package.json its own inode if it is still hardlinked to the local
   * package it was replicated from.
   *
   * Same content, new physical file: unlink the directory entry and write the bytes back.
   * Cheap - it only touches manifests that actually still share an inode.
   *
   * @param pkgJsonFp - installed package.json to detach
   */
  async _detachPkgJsonLink(pkgJsonFp: string): Promise<void> {
    const stat = await xaa.try(() => Fs.stat(pkgJsonFp));
    if (!stat || stat.nlink < 2) {
      return;
    }

    const data = await xaa.try(() => Fs.readFile(pkgJsonFp));
    if (data === undefined) {
      return;
    }

    logger.debug("detaching hardlinked package.json from its local source", pkgJsonFp);
    await xaa.try(() => Fs.unlink(pkgJsonFp));
    await Fs.writeFile(pkgJsonFp, data);
  }

  _isDepSrcOptionalOnly(depInfo: DepInfo): boolean {
    if ((!depInfo.src || depInfo.src === "opt") && (!depInfo.dsrc || depInfo.dsrc === "opt")) {
      return true;
    }

    /*
     * Scenarios
     *
     * 1. dep of an opt A, so A can't be installed
     *   opt: A
     *      dep: failed
     * 2. opt dep of A, so can't install failed
     *   dep or opt: A
     *      opt: failed
     *
     * So as long as there's an opt along the dep path, can ignore failed.
     */

    // walk all requests
    // if all eventually came from an opt, then it's ok
    const optRequests = depInfo.requests.filter(req => req.find(r => r.startsWith("opt")));
    return optRequests.length === depInfo.requests.length; // all of them trace from opt
  }

  async _removeDepsOf(depInfo: DepInfo, originId: string): Promise<void> {
    if (depInfo._removingDeps || !originId) return;
    depInfo._removingDeps = true;

    const dataPackages = this._fyn._data.getPkgsData() as InstallerPkgsData;
    const doRemove = async (section: Record<string, { resolved: string }> | undefined): Promise<void> => {
      if (!section) return;
      for (const name in section) {
        const pkgData = dataPackages[name];
        if (!pkgData) continue;
        const resolved = section[name].resolved;
        const pkgDepInfo = pkgData.versions[resolved] as DepInfo | undefined;
        if (!pkgDepInfo) continue;

        await this._removeDepsOf(pkgDepInfo, originId);
        // a simple quick check to validate if the dep can be removed
        // won't cover all scenarios so still leave some unneeded pkgs around
        const rmSemVs = pkgDepInfo.requests.reduce(
          (a, req) => {
            // extract original semv
            const sv = _.last(req).split(";")[1];
            const tgt = req.find(r => r.startsWith("opt;") && r.endsWith(originId)) ? a.opt : a.dep;
            tgt[sv] = true;
            return a;
          },
          { opt: {}, dep: {} }
        );

        if (!pkgDepInfo.optFailed) {
          for (const semv in rmSemVs.opt) {
            if (rmSemVs.dep[semv]) continue;
            if (pkgData[RSEMVERS]) delete pkgData[RSEMVERS][semv];
            if (pkgData[LOCK_RSEMVERS]) delete pkgData[LOCK_RSEMVERS][semv];
          }
        }

        if (!_.isEmpty(rmSemVs.dep)) continue;

        const dir = this._fyn.getInstalledPkgDir(pkgDepInfo.name, pkgDepInfo.version);
        logger.debug(
          "removing pkg",
          logFormat.pkgId(pkgDepInfo),
          "due to optional parent install failures, at",
          chalk.cyan(dir)
        );

        await Fs.$.rimraf(dir);
        // if a pkg's marked optFailed, then it should be kept
        if (!pkgDepInfo.optFailed) {
          delete pkgData[resolved];
          // remove resolve order
          const roIdx = pkgData[RESOLVE_ORDER].indexOf(resolved);
          if (roIdx >= 0) pkgData[RESOLVE_ORDER].splice(roIdx, 1);
          // remove rsemvers
          _.each(pkgData[RSEMVERS], (v, k) => {
            if (v === resolved) delete pkgData[RSEMVERS][k];
          });
          // remove LOCK_RSEMVERS
          _.each(pkgData[LOCK_RSEMVERS], (v, k) => {
            if (v === resolved) delete pkgData[LOCK_RSEMVERS][k];
          });
        }
      }
    };

    await doRemove(depInfo.res?.dep);
    await doRemove(depInfo.res?.opt);
  }

  async _removeFailedOptional(depInfo: DepInfo, causeId?: string): Promise<void> {
    if (depInfo._removing) return;
    depInfo._removing = true;
    // - reverse search each request path to the first opt pkg
    // - if opt pkg is diff from depInfo, then need to ensure it's opt only, else fail.
    const optReqs = depInfo.requests.map(req => {
      // copy before reversing: req arrays are shared request paths read by
      // other consumers (deprecation display, _removeDepsOf), so reversing them
      // in place would corrupt that state.
      return req
        .slice()
        .reverse()
        .find(r => r.startsWith("opt"));
    });

    const failedId = `${depInfo.name}@${depInfo.version}`;
    for (const r of optReqs) {
      // from top level package.json, skip
      if (r === "opt") continue;
      const id = r.split(";")[2];
      // a top level opt dep would not have any parent in the request path
      // and can't remove top level package. ;-)
      if (!id && depInfo.top) continue;
      // same pkg as depInfo, skip
      if (id === failedId) continue;

      if (id) {
        // lookup new dep info, make sure it's optional only, and remove it
        const upDepInfo = this._fyn._data.getPkgById(id) as DepInfo;
        if (!this._isDepSrcOptionalOnly(upDepInfo)) {
          throw new Error("failure chained from pkg that's more than optional");
        }
        await this._removeFailedOptional(upDepInfo, causeId || failedId);
      } else {
        break; // no more up level packages that're optionals
      }
    }
    depInfo.optFailed = 2;
    // remove files
    const causeMsg = causeId
      ? ` because its dep ${logFormat.pkgId(causeId)} failed to install`
      : "";
    logger.info(
      `${logFormat.pkgId(
        depInfo
      )}: package failed to install${causeMsg} - but will continue because it's optional`
    );

    await this._removeDepsOf(depInfo, failedId);
    await Fs.$.rimraf(this._fyn.getInstalledPkgDir(depInfo.name, depInfo.version, depInfo));
  }

  timeCheck(x: string): void {
    const tmp = Date.now();
    logger.debug(
      `${chalk.green("install time check", x)} ${logFormat.time(tmp - this._stepTime)}`,
      new Date()
    );
    this._stepTime = tmp;
  }

  async _runPreInstallScripts(depInfo: DepInfo): Promise<void> {
    return runNpmScript({
      appDir: this._fyn.cwd,
      fyn: this._fyn,
      scripts: ["preinstall"],
      depInfo
    }).then(() => {
      depInfo.json!._fyn.preinstall = true;
      if (depInfo.fynLinkData) {
        depInfo.fynLinkData.preinstall = true;
      }
    });
  }

  async _runPostInstallScripts(depInfo: DepInfo): Promise<void> {
    const integrity = fynTil.distIntegrity(depInfo.dist);
    const centralBeforeSha =
      this._fyn.central &&
      integrity &&
      (await this._fyn.central.allow(integrity)) &&
      (await this._fyn.central.getMutation(integrity)) === undefined &&
      (await this._fyn.central.getContentShasum(integrity));

    let runningScript: string | undefined;
    return xaa
      .each(depInfo.install!, (installScript: string) => {
        runningScript = installScript;
        return runNpmScript({
          appDir: this._fyn.cwd,
          fyn: this._fyn,
          scripts: [installScript],
          depInfo
        }).then(() => {
          depInfo.json!._fyn[installScript] = true;
          if (depInfo.fynLinkData) {
            depInfo.fynLinkData[installScript] = true;
          }
        });
      })
      .then(async () => {
        if (centralBeforeSha) {
          const afterSha = await this._fyn.central.getContentShasum(integrity);
          const id = logFormat.pkgId(depInfo);
          if (afterSha !== centralBeforeSha) {
            logger.info(
              `package ${id} can't use central store because its post install scripts ${depInfo.install} mutated content, before: ${centralBeforeSha} after: ${afterSha}`
            );
            await this._fyn.central.setMutation(integrity, true);
          } else {
            await this._fyn.central.setMutation(integrity, false);
          }
        }
      })
      .catch((err: Error) => {
        if (this._isDepSrcOptionalOnly(depInfo)) {
          logger.info(
            "running package",
            logFormat.pkgId(depInfo),
            "script",
            chalk.magenta(runningScript),
            `failed, but it's${depInfo.dsrc !== "opt" ? " indirect" : ""}`,
            "optional, so ignoring and removing."
          );
          return this._removeFailedOptional(depInfo);
        } else {
          throw err;
        }
      });
  }

  _checkDeprecated(depInfo: DepInfo): boolean {
    if (depInfo.deprecated && (depInfo.showDepr || this._fyn.showDeprecated)) {
      const id = logFormat.pkgId(depInfo);
      logger.warn(
        `${chalk.black.bgYellow("WARN")} ${chalk.magenta("deprecated")} ${id}`,
        chalk.yellow(depInfo.deprecated)
      );
      const req = depInfo.requests[depInfo.firstReqIdx];
      logger.verbose(
        chalk.blue("  First seen through:"),
        chalk.cyan((req.length > 1 ? req.slice(1) : req).reverse().join(chalk.magenta(" < ")))
      );
      if (depInfo.requests.length > 1) {
        logger.verbose(chalk.blue(`  Number of other dep paths:`), depInfo.requests.length - 1);
      }
      return true;
    }
    return false;
  }

  _doInstall(): Promise<void> {
    const start = Date.now();

    this.timeCheck("starting preinstall");

    return (
      Promise.map(this.preInstall!, (di: DepInfo) => this._runPreInstallScripts(di), { concurrency: 3 })
        .tap(() => this.timeCheck("preInstall"))
        .tap(() => {
          logger.updateItem(INSTALL_PACKAGE, `linking packages...`);
        })
        .then(() => this._linkTopPackages())
        .return(this.toLink!)
        .each((depInfo: DepInfo) => this._linkNestedPackages(depInfo))
        .tap(() => this.timeCheck("linking packages"))
        .tap(() => logger.debug("linking bin for non-top but promoted packages"))
        .return(this.toLink!) // Link bin for all none top but promoted pkg first
        .each((x: DepInfo) => !x.top && x.promoted && this._binLinker.linkBin(x))
        .tap(() => this.timeCheck("linking bin promoted non-top"))
        .tap(() => logger.debug("linking bin for FV_DIR packages"))
        .return(this.toLink!) // Link bin for all pkg under FV_DIR
        .each((x: DepInfo) => !x.top && !x.promoted && this._binLinker.linkBin(x))
        .tap(() => this.timeCheck("linking bin FV_DIR"))
        .return(this.toLink!) // link bin for package's dep that conflicts
        .each((x: DepInfo) => this._binLinker.linkDepBin(x))
        .tap(() => this.timeCheck("linking dep bin"))
        // we are about to run install/postInstall scripts
        // save pkg JSON to disk in case any updates were done
        .then(() => this._savePkgJson())
        .tap(() => this.timeCheck("first _savePkgJson"))
        .then(() => this._initFvVersions())
        .tap(() => this.timeCheck("_initFvVersions"))
        .then(() => this._cleanUp())
        .tap(() => this.timeCheck("_cleanUp"))
        .then(() => this._cleanOrphanedFv())
        .tap(() => this.timeCheck("_cleanOrphanedFv"))
        .then(() => this._cleanBin())
        .tap(() => this.timeCheck("_cleanBin"))
        .return(this.postInstall!)
        .map((depInfo: DepInfo) => this._runPostInstallScripts(depInfo), { concurrency: 3 })
        .tap(() => this.timeCheck("postInstall"))
        // Go through save package.json again in case any changed
        .then(() => this._savePkgJson(true))
        .tap(() => this.timeCheck("second _savePkgJson"))
        .return(this.toLink!)
        .filter((depInfo: DepInfo) => this._checkDeprecated(depInfo))
        .tap(() => this.timeCheck("show deprecated"))
        .then((warned: DepInfo[]) => {
          if (this._fyn.showDeprecated && _.isEmpty(warned)) {
            logger.info(chalk.green("HOORAY!!! None of your dependencies are marked deprecated."));
          }
        })
        .then(() => this._installLocalExports())
        .then(() => this._saveLockData())
        .then(() => {
          this._fyn._depResolver._logConsolidatedPeerDepWarnings();
          this._reportBlockedScripts();
          logger.info(`${chalk.green("done install")} ${logFormat.time(Date.now() - start)}`);
        })
        .finally(() => {
          logger.removeItem(INSTALL_PACKAGE);
        })
    );
  }

  async _installLocalExports(): Promise<void> {
    const pkgsData = this._data.getPkgsData() as InstallerPkgsData;
    const config = resolveLocalExportsConfig(this._fyn._pkg);
    const manifest = await makeLocalExportsManifest({
      cwd: this._fyn._cwd,
      config,
      depInfos: this.toLink!.filter((depInfo: DepInfo) => {
        const kpkg = pkgsData[depInfo.name];
        return kpkg && kpkg.versions && kpkg.versions[depInfo.version!] === depInfo;
      })
    });
    const previous = this._fyn._installConfig.localExports;
    await reconcileLocalExports({ cwd: this._fyn._cwd, manifest, previous });
    this._fyn.setLocalExports(manifest);
  }

  async _buildLocalPkg(depInfo: DepInfo): Promise<void> {
    if (this._fyn._options.buildLocal && this._fyn._localPkgBuilder) {
      const itemRes = await this._fyn._localPkgBuilder.waitForItem(depInfo.dir!);
      if (itemRes && itemRes.error) {
        const buildError = new AggregateError(
          [itemRes.error],
          `install fail because local package build failed: ${depInfo.dir}`
        );
        // Preserve the _fynAlreadyLogged flag from the original error
        if ((itemRes.error as any)?._fynAlreadyLogged) {
          (buildError as any)._fynAlreadyLogged = true;
        }
        throw buildError;
      }
    }
  }

  async _gatherPkg(depInfo: DepInfo): Promise<void> {
    const { name, version } = depInfo;
    if (depInfo.local) {
      this.timeCheck("buildLocal");
      await this._buildLocalPkg(depInfo);
      this.timeCheck("linkLocal");
      await this._linkLocalPkg(depInfo);
      this.timeCheck("done link Local");
    }

    const json: InstallPkgJson = depInfo.json || ({} as InstallPkgJson);

    if (_.isEmpty(json) || json.fromLocked) {
      const dir = this._fyn.getInstalledPkgDir(name, version, depInfo);
      const file = Path.join(dir, "package.json");
      const str = (await Fs.readFile(file)).toString();
      Object.assign(json, JSON.parse(str));
      Object.assign(depInfo, { str, json });
      if (!depInfo.dir) depInfo.dir = dir;
    }

    // Reset _fyn markers for fresh installs - these track script execution
    // and shouldn't persist from cached package.json
    json._fyn = {};
    const scripts = json.scripts || {};

    // Security hardening: a package only runs its lifecycle scripts when
    // `fyn.scriptPolicy` allows it. Under "source" (the default) that means it
    // came from a configured registry or the workspace; under "review" it means
    // an explicit `fyn.allowScripts` entry, workspace-local packages excepted.
    // Deps declared directly in the top-level package.json can also be opted in
    // via `fyn.allowTopLevelScripts`.
    const scriptPolicy = evaluateScriptPolicy(
      depInfo,
      this._fyn.allowScripts,
      this._fyn.scriptPolicyOptions
    );
    const hasPI = json.hasPI || Boolean(scripts.preinstall);
    const piExed = Boolean(depInfo.preinstall);

    // the scripts this package would run if the policy let it
    const candidates = [];

    if (!piExed && hasPI) {
      if (depInfo.preInstalled) {
        json._fyn.preinstall = true;
      } else {
        candidates.push("preinstall");
      }
    }

    for (const name of ["install", "postinstall"]) {
      if (Boolean(scripts[name]) && !json._fyn[name]) {
        candidates.push(name);
      }
    }

    this.toLink!.push(depInfo);

    const blockedScripts = candidates.filter(name => !isScriptAllowed(scriptPolicy, name));
    this._queueScripts(
      depInfo,
      candidates.filter(name => isScriptAllowed(scriptPolicy, name))
    );

    if (blockedScripts.length > 0) {
      // a script blocked by name - `denyScripts` naming it, or an
      // `!postinstall` marker - is a denial, not something awaiting review.
      // Recorded separately so it is not offered for an approval that could not
      // take effect; the whole-package case is already `policy.denied`.
      const byName = scriptPolicy.deniedScripts || new Set();
      const denied = blockedScripts.filter(name => byName.has(name));
      const pending = blockedScripts.filter(name => !byName.has(name));

      if (denied.length > 0) {
        this._recordBlockedScripts(depInfo, { ...scriptPolicy, reason: "denied" }, denied);
      }

      if (pending.length > 0) {
        this._recordBlockedScripts(depInfo, scriptPolicy, pending);
        // kept out of the persisted record, which is JSON - this is only so an
        // approval given at the prompt can queue the scripts it just allowed
        this._blockedDeps.push({ depInfo, candidates: pending });
      }
    }

    this._recordPendingReview(depInfo, { hasPI, ...scripts });
  }

  /**
   * Queue a package's allowed install scripts.
   *
   * Idempotent per package, because the review prompt re-queues after an
   * approval and a package may already have had some of its scripts allowed.
   *
   * @param {object} depInfo resolved package data
   * @param {string[]} names the lifecycle scripts to run
   * @returns {void}
   */
  _queueScripts(depInfo, names) {
    if (names.includes("preinstall") && !this.preInstall!.includes(depInfo)) {
      logger.debug("adding preinstall step for", depInfo.dir);
      this.preInstall!.push(depInfo);
    }

    const install = ["install", "postinstall"].filter(name => names.includes(name));

    if (install.length > 0) {
      logger.debug("adding install step for", depInfo.dir, install);
      depInfo.install = _.union(depInfo.install || [], install);
      if (!this.postInstall!.includes(depInfo)) {
        this.postInstall!.push(depInfo);
      }
    }
  }

  /**
   * Stop before running anything when packages want to run install scripts
   * nobody has approved. On a terminal this asks and re-queues whatever the
   * person approves; anywhere else it throws.
   *
   * Only under `"review"`: `"source"` is the documented opt-out and keeps
   * warning-and-continuing, and under `"off"` nothing running is the point.
   *
   * @returns {Promise<void>} nothing
   */
  async _reviewBlockedScripts() {
    if (this._fyn.scriptPolicy !== "review" || this._blockedDeps.length === 0) {
      return;
    }

    // a denied package is not an unreviewed one - there is nothing to approve,
    // and offering it would send `fyn install-scripts approve` at a package
    // that refuses by design. Off a terminal that turned `deny` plus any CI
    // install into a deadlock with no way out but deleting the denial. They
    // stay in the end-of-install summary, which says why they were skipped.
    const pending = this.blockedScripts.filter(record => record.reason !== "denied");

    if (pending.length === 0) {
      return;
    }

    const approved = await new InstallScripts({ fyn: this._fyn }).review(pending);

    if (approved.length === 0) {
      return;
    }

    this._fyn.resetAllowScripts();
    this._requeueApproved();
  }

  /**
   * Re-evaluate the packages that were blocked, after the allowlist on disk
   * changed, and queue whatever is now allowed.
   *
   * @returns {void}
   */
  _requeueApproved() {
    const blockedDeps = this._blockedDeps;
    const stillBlocked = [];

    this._blockedDeps = [];
    this.blockedScripts = [];

    for (const { depInfo, candidates } of blockedDeps) {
      const policy = evaluateScriptPolicy(
        depInfo,
        this._fyn.allowScripts,
        this._fyn.scriptPolicyOptions
      );
      const blocked = candidates.filter(name => !isScriptAllowed(policy, name));

      this._queueScripts(
        depInfo,
        candidates.filter(name => isScriptAllowed(policy, name))
      );

      if (blocked.length > 0) {
        this._recordBlockedScripts(depInfo, policy, blocked);
        stillBlocked.push({ depInfo, candidates });
      }
    }

    this._blockedDeps = stillBlocked;
  }

  /**
   * With `--allow-scripts-pending`, also answer the question `"review"` would
   * ask - which packages have install scripts that nobody has approved - while
   * still running the install under the mode in effect. That is how a project
   * sees what switching to `"review"` would cost before switching.
   *
   * @param {object} depInfo resolved package data
   * @param {object} scripts the package's scripts, plus `hasPI`
   * @returns {void}
   */
  _recordPendingReview(depInfo, scripts) {
    if (!this._fyn.allowScriptsPending) {
      return;
    }

    const has = LIFECYCLE_SCRIPTS.filter(
      name => Boolean(scripts[name]) || (name === "preinstall" && scripts.hasPI)
    );

    if (has.length === 0) {
      return;
    }

    const policy = evaluateScriptPolicy(depInfo, this._fyn.allowScripts, {
      ...this._fyn.scriptPolicyOptions,
      mode: strictestScriptPolicy(this._fyn.scriptPolicy, "review")
    });

    const pending = has.filter(name => !isScriptAllowed(policy, name));

    if (pending.length > 0) {
      this.pendingScripts.push(makeBlockedRecord(depInfo, policy, pending));
    }
  }

  /**
   * Record a package whose install scripts the policy blocked. Reported as one
   * summary at the end of the install rather than a warning per package - under
   * "review" mode every native dependency blocks on a first install.
   *
   * @param {object} depInfo resolved package data
   * @param {object} policy result of `evaluateScriptPolicy`
   * @param {string[]} blocked the lifecycle scripts that were skipped
   * @returns {void}
   */
  _recordBlockedScripts(depInfo, policy, blocked) {
    logger.debug(
      "scripts blocked",
      logFormat.pkgId(depInfo),
      `[${blocked.join(", ")}]`,
      policy.reason
    );
    this.blockedScripts.push(makeBlockedRecord(depInfo, policy, blocked));
  }

  /**
   * Report every package whose install scripts were blocked, with the exact
   * config to paste to allow them, and hand the same records to fyn so they are
   * saved for `fyn install-scripts ls`.
   *
   * @returns {void}
   */
  _reportBlockedScripts() {
    const records = this.blockedScripts;

    this._fyn.setBlockedScripts(records, this.pendingScripts);

    for (const line of formatBlockedScriptsSummary(records, {
      mode: this._fyn.scriptPolicy,
      pin: this._fyn.allowScriptsPin
    })) {
      logger.warn(line);
    }

    for (const line of formatPendingScriptsSummary(this.pendingScripts, {
      mode: this._fyn.scriptPolicy,
      pin: this._fyn.allowScriptsPin
    })) {
      logger.info(line);
    }
  }

  _cleanBin(): Promise<void> {
    logger.updateItem(INSTALL_PACKAGE, "cleaning node_modules/.bin");
    return this._binLinker.clearExtras();
  }

  async _initFvVersions(): Promise<void> {
    if (!this._fvVersions) {
      this._fvVersions = await this._fyn.loadFvVersions();
    }
  }

  async _cleanOrphanedFv(): Promise<void> {
    for (const pkgName in this._fvVersions) {
      const versions = this._fvVersions[pkgName];
      if (versions !== null) {
        await this._cleanUpVersions(pkgName);
      }
    }
  }

  async _cleanUp(scope?: string): Promise<void> {
    const outDir = this._fyn.getOutputDir();
    const pkgsData = this._data.getPkgsData() as InstallerPkgsData;

    scope = scope || "";
    logger.updateItem(INSTALL_PACKAGE, `cleaning extraneous packages... ${scope}`);

    const installedPkgs = await xaa.try(() => Fs.readdir(Path.join(outDir, scope)), []) as string[];

    for (const dirName of installedPkgs) {
      if (dirName.startsWith(".") || dirName.startsWith("_")) continue;

      if (!scope && dirName.startsWith("@")) {
        await this._cleanUp(dirName);
        continue;
      }

      const pkgName = Path.posix.join(scope, dirName);
      const pkgData = pkgsData[pkgName];
      const topPkg = pkgData && _.find(pkgData.versions, (x: DepInfo) => x.promoted);

      if (!topPkg) {
        this._removedCount++;
        await this._removeDir(Path.join(outDir, pkgName));
      }

      await this._cleanUpVersions(pkgName);
    }

    // get rid of potentially empty scope dir
    if (scope) await xaa.try(() => Fs.rmdir(Path.join(outDir, scope)));

    // get rid of potentially empty FV_DIR dir
    await xaa.try(() => Fs.rmdir(this._fyn.getFvDir("_")));
  }

  /**
   * Process detail layout for node_modules.
   *
   * Real copies of packages are store under FV_DIR.
   *
   * 1. For top level packages that exist in app's package.json, make symlinks under node_modules.
   * 2. For packages that could be promoted to the top level:
   * - If flattenTop enabled, make symlinks under node_modules
   * - flattenTop disabled, make symlinks under FV_Dir/node_modules
   *
   * @returns {*} none
   */
  async _linkTopPackages(): Promise<void> {
    // only for detail layout
    if (this._fyn.isNormalLayout) {
      return;
    }

    const { flattenTop } = this._fyn._options;
    const pkgsData = this._data.getPkgsData() as InstallerPkgsData;
    let createFvNmDir: boolean | undefined;
    for (const pkgName in pkgsData) {
      const pkg = pkgsData[pkgName];
      for (const version in pkg.versions) {
        const verPkg = pkg.versions[version] as DepInfo;
        let symLinkLocation: string;
        logger.debug("linkTop", pkgName, "top", verPkg.top, "promoted", verPkg.promoted);
        if (verPkg.top) {
          // top level dep from package.json, put or link it under node_modules
          symLinkLocation = this._fyn.getOutputDir();
        } else if (verPkg.promoted) {
          if (flattenTop) {
            // put all packages that are promoted under node_modules
            symLinkLocation = this._fyn.getOutputDir();
          } else {
            // promoted flattened dep, link to node_modules/${FV_DIR}/node_modules
            symLinkLocation = this._fyn.getFvDir("node_modules");
            if (!createFvNmDir) {
              createFvNmDir = true;
              await Fs.$.mkdirp(symLinkLocation);
            }
          }
        } else {
          continue; // no need to link
        }

        const linkName = Path.join(symLinkLocation, pkgName);
        const pkgInstalledPath = this._fyn.getInstalledPkgDir(pkgName, version);
        logger.debug("linkTop", linkName, "=>", pkgInstalledPath);

        if (pkgName.startsWith("@")) {
          // package has scope, create a scope dir for it
          await Fs.$.mkdirp(Path.dirname(linkName));
        }

        const symLinkExist = await fynTil.validateExistSymlink(linkName, pkgInstalledPath, true);

        if (!symLinkExist) {
          await fynTil.symlinkDir(linkName, pkgInstalledPath, true);
        }
      }
    }
  }

  async _linkNestedPackages(depInfo: DepInfo): Promise<boolean | undefined> {
    this._fyn._depResolver.resolvePeerDep(depInfo);
    await this._depLinker.linkPackage(depInfo);
    //
    if (depInfo.deprecated && !depInfo.json!._deprecated) {
      depInfo.json!._deprecated = depInfo.deprecated;
      depInfo.showDepr = true;
    }

    if (depInfo.top) {
      return this._binLinker.linkBin(depInfo);
    }

    return undefined;
  }

  async _cleanUpVersions(pkgName: string): Promise<void> {
    const kpkg = this._data.getPkgsData()[pkgName];
    const pkg = kpkg?.versions as Record<string, DepInfo> | undefined;
    const versions = this._fvVersions[pkgName];

    if (!versions || versions.length < 1) return;

    const removed: string[] = [];

    for (const ver of versions) {
      if (!pkg || !pkg[ver] || (this._fyn.isNormalLayout && pkg[ver].promoted)) {
        const pkgInstalledPath = this._fyn.getInstalledPkgDir(pkgName, ver);

        logger.verbose("removing extraneous version", ver, "of", pkgName, pkgInstalledPath);
        await Fs.$.rimraf(pkgInstalledPath);
        removed.push(pkgInstalledPath);
      }
    }

    for (const pkgDir of removed) {
      let dir = pkgDir;
      try {
        // long form has an extra node_modules level between the version dir
        // and the package's <name> dir; short form does not.
        if (!this._fyn._shortPkgDir) {
          dir = Path.dirname(dir);
          await Fs.rmdir(dir);
        }
        if (pkgName.startsWith("@")) {
          dir = Path.dirname(dir);
          await Fs.rmdir(dir);
        }
        dir = Path.dirname(dir);
        await Fs.rmdir(dir);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOTEMPTY") {
          logger.error(`fail to remove dir for package ${pkgName}`, err, dir);
        }
      }
    }

    // in case the package container directory has no versions left, it'd be an empty dir => remove it.
    if (versions.length === removed.length) {
      let dir = this._fyn.getInstalledPkgDir(pkgName);
      try {
        await Fs.rmdir(dir);
        if (pkgName.startsWith("@")) {
          dir = Path.dirname(dir);
          await Fs.rmdir(dir);
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOTEMPTY") {
          logger.error(`fail to remove container dir for package ${pkgName}`, err, dir);
        }
      }
    }

    // cleanup applied, no longer need the data for this package

    this._fvVersions[pkgName] = null;
  }

  async _removeDir(dir: string): Promise<void | null> {
    try {
      const stat = await Fs.stat(dir);
      if (stat.isDirectory()) {
        return Fs.$.rimraf(dir);
      } else {
        return Fs.unlink(dir);
      }
    } catch (err) {
      return null;
    }
  }

  _saveLockData(): void {
    if (!this._fyn.lockOnly) {
      const locker = this._fyn._depLocker || new PkgDepLocker(false, true, this._fyn);
      locker.generate(this._fyn._data);
      locker.save(Path.join(this._fyn.cwd, "fyn-lock.yaml"));
    }
  }
}

export default PkgInstaller;
