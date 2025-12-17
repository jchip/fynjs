// @ts-nocheck

import PkgBinLinkerWin32 from "./pkg-bin-linker-win32";
import PkgBinLinkerUnix from "./pkg-bin-linker-unix";

/* istanbul ignore next */
const PkgBinLinker = process.platform === "win32" ? PkgBinLinkerWin32 : PkgBinLinkerUnix;

export default PkgBinLinker;