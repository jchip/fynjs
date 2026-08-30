
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

//
// Same wrappers for an absolute target: `%~dp0\` must not be prefixed, or the path becomes
// `C:\...\bin\C:\...`. Used for the global bin dir - see `_useAbsoluteTarget` below.
//
const CYGWIN_LINK_ABS = `#!/bin/sh
if [ -x "$(dirname "$0")/node" ]; then
  "$(dirname "$0")/node"  "{{TARGET}}" "$@"
  ret=$?
else
  node  "{{TARGET}}" "$@"
  ret=$?
fi
exit $ret
`;

const CMD_BATCH_ABS = `@IF EXIST "%~dp0\\node.exe" (
  "%~dp0\\node.exe"  "{{TARGET}}" %*
) ELSE (
  @SETLOCAL
  @SET PATHEXT=%PATHEXT:;.JS;=;%
  node  "{{TARGET}}" %*
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

  //
  // A `.cmd` is a regular file, so `%~dp0` expands to the directory used to *invoke* it, not the
  // real one. fyn's global bin dir is normally reached through the `global/bin` -> `v<N>/bin`
  // directory symlink, and from there `%~dp0\..\packages\...` resolves to
  // `.fyn\global\packages\...` - one level short of `.fyn\global\v<N>\packages\...`, so every
  // global bin fails with "Cannot find module". POSIX does not have this problem: its bin link
  // is a symlink, and the OS resolves a relative symlink against the real containing dir.
  //
  protected get _useAbsoluteTarget(): boolean {
    return this._absoluteTarget;
  }

  protected async _generateBinLink(relTarget: string, symlink: string): Promise<void> {
    const absolute = Path.isAbsolute(relTarget);

    await this._saveCmd(symlink, absolute ? CYGWIN_LINK_ABS : CYGWIN_LINK, relTarget);
    await this._saveCmd(symlink + ".cmd", absolute ? CMD_BATCH_ABS : CMD_BATCH, relTarget);
  }

  protected async _rmBinLink(symlink: string): Promise<void> {
    await this._unlinkFile(symlink);
    await this._unlinkFile(symlink + ".cmd");
  }

  // Extract the {{TARGET}} path baked into a generated .cmd wrapper. Both shapes quote their
  // target; the only other quoted value is the node.exe probe. The relative shape prefixes
  // `%~dp0\`, the absolute one does not.
  protected async _readBinLinkTarget(symlink: string): Promise<string | undefined> {
    const content = (await Fs.readFile(symlink + ".cmd")).toString();

    for (const [, quoted] of content.matchAll(/"([^"\r\n]+)"/g)) {
      const value = quoted.replace(/^%~dp0[\\/]+/, "");
      if (value.toLowerCase().endsWith("node.exe")) {
        continue;
      }
      return value;
    }

    return undefined;
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
      const full = target && (Path.isAbsolute(target) ? target : Path.join(this._binDir, target));
      if (full && (await Fs.exists(full))) {
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
