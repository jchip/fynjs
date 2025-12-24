/* eslint-disable no-magic-numbers,max-statements,prefer-template */

import Crypto from "crypto";
import Path from "path";
import Fs from "./util/file-ops";
import _ from "lodash";
import logger from "./logger";
import logFormat from "./util/log-format";
import fynTil from "./util/fyntil";

/** Package info for linking */
interface PkgInfo {
  name: string;
  version: string;
  promoted?: boolean;
  local?: string;
  json?: Record<string, unknown>;
  linkDep?: boolean;
  res?: ResData;
  fynLinkData?: { targetPath: string };
}

/** Resolution data structure */
interface ResData {
  dep?: Record<string, { resolved: string }>;
  per?: Record<string, { resolved: string }>;
  opt?: Record<string, { resolved: string }>;
  [key: string]: unknown;
}

/** Package data from registry */
interface PkgData {
  promoted?: boolean;
  [key: string]: unknown;
}

/** Fyn instance interface for dep linker */
interface FynForDepLinker {
  _data: {
    getPkgsData(): Record<string, { versions: Record<string, PkgData> }>;
  };
  getInstalledPkgDir(name: string, version: string, info?: unknown): string;
  createSubNodeModulesDir(pkgDir: string): Promise<string>;
  addLocalPkgWithNestedDep(depInfo: PkgInfo): void;
  cwd: string;
}

/** FV dependency info */
interface FvDepInfo {
  name: string;
  version: string;
  promoted?: boolean;
}

/*
 * generate data to link all packages' resolution
 * information.
 */

class PkgDepLinker {
  private _fyn: FynForDepLinker;

  constructor({ fyn }: { fyn: FynForDepLinker }) {
    this._fyn = fyn;
  }

  makeAppFynRes(
    resData: Record<string, Record<string, unknown>>,
    fynFo: unknown
  ): Record<string, unknown> {
    const depRes: Record<string, unknown> = {};

    _.each(["dep", "dev", "opt", "devopt"], section => {
      _.each(resData[section], (resInfo, depName) => {
        depRes[depName] = Object.assign({}, resInfo as object);
      });
    });

    depRes._fynFo = fynFo;

    return depRes;
  }

  // link top level package
  /*deprecated*/ async linkAppFynRes(): Promise<void> {
    throw new Error("fyn resolutions deprecated.");
  }

  /*deprecated*/ async readAppFynRes(): Promise<void> {
    throw new Error("fyn resolutions deprecated.");
  }

  async addSubNodeModules(depInfo: PkgInfo, fvDeps: FvDepInfo[]): Promise<void> {
    if (fvDeps.length <= 0) return;

    if (depInfo.local && depInfo.local === "sym1") {
      this._fyn.addLocalPkgWithNestedDep(depInfo);
      return;
    }

    const subjectNmDir = await this._fyn.createSubNodeModulesDir(
      this._fyn.getInstalledPkgDir(depInfo.name, depInfo.version, depInfo)
    );

    const getDirForScope = (name: string): { dir: string; name: string } => {
      if (name.startsWith("@") && name.indexOf("/") > 0) {
        const splits = name.split("/");
        return { dir: Path.join(subjectNmDir, splits[0]), name: splits[1] };
      }
      return { dir: subjectNmDir, name };
    };

    for (const di of fvDeps) {
      const diDir = this._fyn.getInstalledPkgDir(di.name, di.version, di);
      const scope = getDirForScope(di.name);
      const relLinkPath = Path.relative(scope.dir, diDir);
      logger.debug(
        "pkg",
        logFormat.pkgId(depInfo),
        "need sub node_modules for",
        logFormat.pkgId(di),
        "to",
        relLinkPath
      );
      try {
        const symlinkName = Path.join(scope.dir, scope.name);
        if (!(await Fs.exists(scope.dir))) {
          await Fs.mkdir(scope.dir);
        }
        const existTarget = await fynTil.validateExistSymlink(symlinkName, relLinkPath);
        if (!existTarget) {
          await fynTil.symlinkDir(symlinkName, relLinkPath);
        }
      } catch (e) {
        logger.warn("symlink sub node_modules failed", (e as Error).message);
      }
    }
  }

  async addPackageRes(depInfo: PkgInfo): Promise<boolean> {
    const depRes: Record<string, { resolved: string; type: string }> = {};

    const resData = depInfo.res;
    // TODO: check existing node_modules and do clean-up as necessary
    if (_.isEmpty(resData)) return true;

    const pkgs = this._fyn._data.getPkgsData();
    const fvDeps: FvDepInfo[] = [];

    _.each(["dep", "per", "opt"], (section: "dep" | "per" | "opt") => {
      const dep = (resData?.[section] || {}) as Record<string, { resolved: string }>;

      Object.keys(dep)
        .sort()
        .forEach(depName => {
          const depPkg = dep[depName];
          // depends on a package that's not promoted to flatten top level.
          // need to create a node_modules dir within and add a symlink
          // there to the depPkg.
          if (!pkgs[depName] || !pkgs[depName].versions[depPkg.resolved]) return;
          const pkgInfo = pkgs[depName].versions[depPkg.resolved];
          if (!pkgInfo.promoted) {
            fvDeps.push(pkgInfo);
          }
          if (depRes[depName]) {
            depRes[depName].type += `;${section}`;
          } else {
            depRes[depName] = { resolved: depPkg.resolved, type: section };
          }
        });
    });

    await this.addSubNodeModules(depInfo, fvDeps);

    return true;
  }

  async linkPackage(depInfo: PkgInfo): Promise<boolean> {
    depInfo.linkDep = await this.addPackageRes(depInfo);
    return depInfo.linkDep;
  }

  //
  // Use symlink to connect fynlocal packages.
  // First creates the package's directory under node_modules/${FV_DIR/<version>
  // and then make a symlink from there to the actual directory of the local package.
  //
  /*deprecated*/ async symlinkLocalPackage(): Promise<void> {
    throw new Error("symlinking local package deprecated, only hard linking.");
  }

  _createLinkName(targetNmDir: string, name: string): string {
    const sha1 = Crypto.createHash("sha1")
      .update(targetNmDir)
      .update(name)
      .digest("base64")
      .replace(/\//g, "_")
      .replace(/=/g, "");
    return `${name.replace(/[@\/]/g, "_")}-${sha1}`;
  }

  //
  // Save fynlink data of a local package for the package and the app.
  // - For the local package, it's saved in <fyndir>/links with filename as
  // <package_name>-<sha1 of targetNmDir & name>.json
  // and then make a symlink in its node_modules directory to the file
  // - For the app, it's saved with info setup in loadLocalPackageAppFynLink
  //
  /*deprecated*/ async saveLocalPackageFynLink(): Promise<void> {
    throw new Error("symlink local package is deprecated, only hard linking.");
  }

  //
  // Load the fynlink to a local package for the app in node_modules/${FV_DIR}
  //
  /*deprecated*/ async loadLocalPackageAppFynLink(): Promise<void> {
    throw new Error("symlink local package is deprecated, only hard linking.");
  }

  //
  // Take a pkg dep info and load previously saved dep data into it
  // Used by fyn stat command
  //
  async loadPkgDepData(depInfo: PkgInfo): Promise<void> {
    // a normal installed package's dep data are saved to its package.json
    // so loading that is usually enough
    const installedDir = this._fyn.getInstalledPkgDir(depInfo.name, depInfo.version, depInfo);

    if (!depInfo.json) {
      const fname = Path.join(installedDir, "package.json");
      depInfo.json = JSON.parse(await Fs.readFile(fname));
    }

    // for a locally linked package, the dep data is in the __fyn_link__ JSON file
    if (depInfo.local === "sym") {
      throw new Error("sym linking local package deprecated. only hard linking.");

      // await this.loadLocalPackageAppFynLink(depInfo, installedDir);
      // const targetFynlinkFile = Path.join(
      //   depInfo.fynLinkData.targetPath,
      //   "node_modules",
      //   FYN_LINK_JSON
      // );

      // const depRes = JSON.parse(await Fs.readFile(targetFynlinkFile));
      // depInfo.json._depResolutions = depRes[this._fyn.cwd]._depResolutions;
    }
  }
}

export default PkgDepLinker;