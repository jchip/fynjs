/* eslint-disable global-require */

import Fs from "./util/file-ops";
import logger from "./logger";
import PkgBinLinkerBase, { type PkgBinLinkerOptions } from "./pkg-bin-linker-base";

//
// Look at each promoted package and link their bin to node_modules/.bin
// TODO: only do this for packages in package.json [*]dependencies
//

class PkgBinLinker extends PkgBinLinkerBase {
  constructor(options: PkgBinLinkerOptions) {
    super(options);
  }

  //
  // Platform specific
  //

  protected async _ensureGoodLink(symlink: string, target: string): Promise<boolean> {
    try {
      const existTarget = await Fs.readlink(symlink);
      if (existTarget === target) {
        return true;
      }
    } catch {
      //
    }

    await this._rmBinLink(symlink);

    return false;
  }

  protected async _chmod(target: string): Promise<void> {
    try {
      await Fs.access(target, Fs.constants.X_OK);
      return;
    } catch {
      //
    }

    try {
      await Fs.chmod(target, "0755");
    } catch (err: unknown) {
      logger.error(`bin-linker: chmod on ${target} failed`, (err as Error).message);
    }
  }

  protected async _generateBinLink(relTarget: string, symlink: string): Promise<void> {
    await Fs.symlink(relTarget, symlink);
  }

  protected async _rmBinLink(symlink: string): Promise<void> {
    await this._unlinkFile(symlink);
  }

  protected async _readBinLinks(): Promise<string[]> {
    return Fs.readdir(this._binDir);
  }
}

export default PkgBinLinker;