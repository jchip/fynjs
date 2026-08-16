/* eslint-disable global-require, prefer-template */

import Fs from "./util/file-ops";
import Path from "path";
import PkgBinLinkerBase, { type PkgBinLinkerOptions } from "./pkg-bin-linker-base";

//
// Look at each promoted package and link their bin to node_modules/.bin
// TODO: only do this for packages in package.json [*]dependencies
//

const CYGWIN_LINK = `#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\,/,g')")

case \`uname\` in
    *CYGWIN*) basedir=\`cygpath -w "$basedir"\`;;
esac

if [ -x "$basedir/node" ]; then
  "$basedir\\node"  "$basedir\\{{TARGET}}" "$@"
  ret=$?
else
  node  "$basedir\\{{TARGET}}" "$@"
  ret=$?
fi
exit $ret
`;

const CMD_BATCH = `@IF EXIST "%~dp0\\node.exe" (
  "%~dp0\\node.exe"  "%~dp0\\{{TARGET}}" %*
) ELSE (
  @SETLOCAL
  @SET PATHEXT=%PATHEXT:;.JS;=;%
  node  "%~dp0\\{{TARGET}}" %*
)
`;

class PkgBinLinkerWin32 extends PkgBinLinkerBase {
  constructor(options: PkgBinLinkerOptions) {
    super(options);
  }

  //
  // Platform specific
  //

  protected async _isBinLinkTarget(symlink: string, target: string): Promise<boolean> {
    try {
      const existTarget = (await Fs.readFile(symlink)).toString();
      return existTarget.indexOf(target) >= 0;
    } catch {
      return false;
    }
  }

  protected async _ensureGoodLink(symlink: string, target: string): Promise<boolean> {
    if (await this._isBinLinkTarget(symlink, target)) {
      return true;
    }

    await this._rmBinLink(symlink);

    return false;
  }

  protected async _generateBinLink(relTarget: string, symlink: string): Promise<void> {
    await this._saveCmd(symlink, CYGWIN_LINK, relTarget);
    await this._saveCmd(symlink + ".cmd", CMD_BATCH, relTarget);
  }

  protected async _rmBinLink(symlink: string): Promise<void> {
    await this._unlinkFile(symlink);
    await this._unlinkFile(symlink + ".cmd");
  }

  // Extract the {{TARGET}} path baked into a generated .cmd wrapper (the path
  // after `%~dp0\`, ignoring the node.exe reference).
  protected async _readBinLinkTarget(symlink: string): Promise<string | undefined> {
    const content = (await Fs.readFile(symlink + ".cmd")).toString();
    const matches = [...content.matchAll(/%~dp0[\\/]+([^"\r\n]+)/g)].map(m => m[1]);
    return matches.find(m => m !== "node.exe");
  }

  //
  // Platform specific: the "bin" is a pair of regular script files (cygwin +
  // .cmd), not a symlink, so the base _cleanLink's Fs.access on the wrapper
  // always succeeds and never cleans a stale bin. Instead, read the wrapper and
  // remove it only if the target it points to no longer exists.
  //
  async _cleanLink(sym: string): Promise<boolean> {
    const symlink = Path.join(this._binDir, sym);

    try {
      const target = await this._readBinLinkTarget(symlink);
      if (target && (await Fs.exists(Path.join(this._binDir, target)))) {
        return false;
      }
    } catch {
      // unreadable / malformed wrapper -> treat as stale and remove
    }

    await this._rmBinLink(symlink);

    return true;
  }

  protected async _readBinLinks(): Promise<string[]> {
    return (await Fs.readdir(this._binDir)).filter(x => !x.endsWith(".cmd"));
  }

  private async _saveCmd(name: string, data: string, target: string): Promise<void> {
    await Fs.writeFile(name, data.replace(/{{TARGET}}/g, target));
  }
}

export default PkgBinLinkerWin32;
