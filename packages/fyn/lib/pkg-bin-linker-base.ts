/* eslint-disable global-require, max-statements, no-param-reassign */

import Fs from "./util/file-ops";
import Path from "path";
import _ from "lodash";
import logger from "./logger";

/** Package JSON bin field type */
export type BinList = string | Record<string, string>;

/** Dependency resolution section */
export interface DepSection {
  [depName: string]: {
    resolved: string;
    [key: string]: unknown;
  };
}

/** Dependency info passed to linker methods */
export interface DepInfo {
  name: string;
  version: string;
  top?: boolean;
  json: {
    name: string;
    bin?: BinList;
    [key: string]: unknown;
  };
  res?: {
    dep?: DepSection;
    opt?: DepSection;
    [key: string]: unknown;
  };
  privateBin?: Record<string, string>;
  [key: string]: unknown;
}

/** Package data structure */
export interface PkgData {
  name: string;
  version: string;
  json: {
    name: string;
    bin?: BinList;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Linked bin tracking */
interface LinkedBin {
  relTarget: string;
  name: string;
  version: string;
}

/** Fyn instance interface for bin linker */
export interface FynForBinLinker {
  getInstalledPkgDir(name: string, version: string, info?: unknown): string;
  createSubNodeModulesDir(pkgDir: string): Promise<string>;
  _data: {
    getPkgsData(): Record<string, { versions: Record<string, PkgData> }>;
  };
}

/** Options for PkgBinLinker constructor */
export interface PkgBinLinkerOptions {
  outputDir: string;
  fyn: FynForBinLinker;
}

//
// Look at each promoted package and link their bin to node_modules/.bin
// TODO: only do this for packages in package.json [*]dependencies
//

class PkgBinLinkerBase {
  protected _binDir: string;
  protected _fyn: FynForBinLinker;
  protected _linked: Record<string, LinkedBin>;

  constructor(options: PkgBinLinkerOptions) {
    this._binDir = Path.join(options.outputDir, ".bin");
    this._fyn = options.fyn;
    this._linked = {};
  }

  async clearExtras(): Promise<void> {
    try {
      const bins = await this._readBinLinks();
      for (const sym of bins) {
        if (!this._linked[sym] && !(await this._cleanLink(sym))) {
          logger.verbose(`bin-linker: ${sym} is not linked by fyn but it's valid, ignoring.`);
        }
      }
    } catch (e: unknown) {
      logger.verbose("bin-linker: error clearing extras in .bin", (e as Error).message);
    }
  }

  //
  // For a package's dependencies that has bin but conflicts with what's in
  // top-level .bin already, need to link them privately.
  //
  async linkDepBin(depInfo: DepInfo): Promise<void> {
    const pkgDir = this._fyn.getInstalledPkgDir(depInfo.name, depInfo.version, depInfo);
    let binDir: string | undefined;
    const privatelyLinked: Record<string, boolean> = {};
    const pkgData = this._fyn._data.getPkgsData();

    const link = async (target: string, sym: string): Promise<void> => {
      if (!binDir) {
        binDir = Path.join(pkgDir, "node_modules", ".bin");
        await Fs.$.mkdirp(binDir);
      }
      const relTarget = Path.relative(binDir, target);
      // get rid of scope
      sym = _.last(sym.split("/")) as string;

      const symlink = Path.join(binDir, sym);

      if (!(await this._ensureGoodLink(symlink, relTarget))) {
        try {
          await this._generateBinLink(relTarget, symlink);
        } catch (err: unknown) {
          logger.error(`bin-linker: symlink failed ${symlink} => ${relTarget}`, (err as Error).message);
        }
      }
    };

    const linkPrivateDep = async (depName: string, resolved: string): Promise<void> => {
      if (!pkgData[depName]) {
        return;
      }
      const depPkg = pkgData[depName].versions[resolved];
      let depPkgDir: string | undefined;
      const json = depPkg.json;
      if (_.isEmpty(json.bin)) {
        return;
      }

      const handle = async (bin: string, file: string): Promise<void> => {
        if (privatelyLinked[bin]) return;
        const linked = this._linked[bin];
        if (!linked || linked.name !== depPkg.name || linked.version !== depPkg.version) {
          // it's not linked at top or something diff already linked
          // so need to privately link it for the pkg of depInfo
          privatelyLinked[bin] = true;
          if (!depPkgDir) {
            depPkgDir = this._fyn.getInstalledPkgDir(depPkg.name, depPkg.version, depPkg);
          }
          const targetFile = Path.join(depPkgDir, file);
          await link(targetFile, bin);
        }
      };

      if (_.isObject(json.bin)) {
        for (const name in json.bin as Record<string, string>) {
          await handle(name, (json.bin as Record<string, string>)[name]);
        }
      } else {
        await handle(json.name, json.bin as string);
      }
    };

    const linkDepOfSection = async (depSection?: DepSection): Promise<void> => {
      if (!_.isEmpty(depSection)) {
        for (const depName in depSection) {
          await linkPrivateDep(depName, depSection[depName].resolved);
        }
      }
    };

    await linkDepOfSection(depInfo.res?.dep);
    await linkDepOfSection(depInfo.res?.opt);
  }

  async linkBin(depInfo: DepInfo, binList?: BinList): Promise<boolean> {
    const isPrivate = Boolean(binList);
    const conflicts: Record<string, string> = {};
    const pkgDir = this._fyn.getInstalledPkgDir(depInfo.name, depInfo.version, depInfo);

    const link = async (file: string, sym: string): Promise<void> => {
      const target = Path.join(pkgDir, file);
      const relTarget = Path.relative(this._binDir, target);

      // get rid of scope
      sym = _.last(sym.split("/")) as string;
      if (this._linked[sym]) {
        const same = relTarget === this._linked[sym].relTarget;
        logger.debug(
          `bin-linker: bin already linked ${sym} => ${this._linked[sym].relTarget}`,
          depInfo.top ? "(top)" : "(__fv)",
          same ? "(same)" : `(diff ${relTarget})`
        );
        if (!isPrivate && !same) conflicts[sym] = file;
        return;
      }

      await this._mkBinDir();
      const symlink = Path.join(this._binDir, sym);

      if (!(await this._ensureGoodLink(symlink, relTarget))) {
        logger.debug(`bin-linker: symlinking ${symlink} => ${relTarget} for ${pkgDir}`);
        try {
          await this._generateBinLink(relTarget, symlink);
        } catch (err: unknown) {
          logger.error(`bin-linker: symlink failed ${symlink} => ${relTarget}`, (err as Error).message);
        }
      }

      await this._chmod(target);
      logger.debug(`bin-linker: setting linked for ${sym} => ${relTarget}`);
      this._linked[sym] = {
        relTarget,
        name: depInfo.name,
        version: depInfo.version
      };
    };

    let actualBinList = binList;
    if (!actualBinList) {
      actualBinList = depInfo.json.bin;
    }

    if (actualBinList) {
      if (_.isObject(actualBinList)) {
        for (const sym in actualBinList as Record<string, string>) {
          await link((actualBinList as Record<string, string>)[sym], sym);
        }
      } else {
        await link(actualBinList as string, Path.basename(depInfo.json.name));
      }
    }

    if (!_.isEmpty(conflicts)) {
      depInfo.privateBin = conflicts;
      logger.debug(`bin-linker: symlinking private bin for ${pkgDir}`);
      const nmDir = await this._fyn.createSubNodeModulesDir(pkgDir);
      await this._linkPrivateBin(nmDir, depInfo, conflicts);
      logger.debug(`bin-linker: done symlinking private bin`);
    }

    return true;
  }

  async _linkPrivateBin(outputDir: string, depInfo: DepInfo, binList: BinList): Promise<void> {
    const Ctor = this.constructor as new (opts: PkgBinLinkerOptions) => PkgBinLinkerBase;
    const binLinker = new Ctor({ fyn: this._fyn, outputDir });
    await binLinker.linkBin(depInfo, binList);
  }

  protected async _unlinkFile(symlink: string): Promise<void> {
    try {
      await Fs.unlink(symlink);
    } catch {
      //
    }
  }

  async _cleanLink(sym: string): Promise<boolean> {
    const symlink = Path.join(this._binDir, sym);

    try {
      await Fs.access(symlink);
      return false;
    } catch {
      //
    }

    await this._rmBinLink(symlink);

    return true;
  }

  async _mkBinDir(): Promise<void> {
    if (!(await Fs.exists(this._binDir))) {
      await Fs.$.mkdirp(this._binDir);
    }
  }

  // Override in subclasses
  protected async _ensureGoodLink(_symlink: string, _target: string): Promise<boolean> {
    return false;
  }

  protected async _generateBinLink(_relTarget: string, _symlink: string): Promise<void> {
    // Override in subclasses
  }

  protected async _rmBinLink(_symlink: string): Promise<void> {
    // Override in subclasses
  }

  protected async _readBinLinks(): Promise<string[]> {
    return [];
  }

  protected async _chmod(_target: string): Promise<void> {
    // Override in subclasses
  }
}

export default PkgBinLinkerBase;