/* eslint-disable max-params, max-statements */

import Fs from "./file-ops";
import Path from "path";
import mm from "minimatch";
import { filterScanDir } from "filter-scan-dir";

async function _scanFileStats(dir: string, ignores: string[], baseDir: string = "") {
  const ignore = (fullPath: string) => ignores.find(pattern => mm(fullPath, pattern, { dot: true }));

  let latestMtimeMs = 0;
  let latestFile = "";

  const updateLatest = (mtimeMs: number, file: string) => {
    if (mtimeMs > latestMtimeMs) {
      latestMtimeMs = mtimeMs;
      latestFile = file;
    }
  };

  const filter = (file: string, path: string, extras: { fullFile: string; stat: { mtimeMs: number } }) => {
    if (ignore(extras.fullFile)) {
      return false;
    }
    updateLatest(extras.stat.mtimeMs, extras.fullFile);
    return true;
  };

  const fullDir = Path.join(baseDir, dir);
  const topDirStat = await Fs.stat(fullDir);
  updateLatest(topDirStat.mtimeMs, fullDir);

  await filterScanDir({
    dir: fullDir,
    includeRoot: false,
    filter,
    filterDir: filter,
    concurrency: 500,
    fullStat: true // we need full stat to get the mtimeMs prop
  });

  return { latestMtimeMs, latestFile };
}

function scanFileStats(dir: string, options: { ignores?: string | string[]; moreIgnores?: string | string[] } = {}) {
  // TODO: make this more flexible and configurable
  const ignores = [
    `**/?(node_modules|.vscode|.DS_Store|coverage|.nyc_output|.fynpo|.git|.github|.gitignore)`,
    "**/*.?(log|md)"
  ]
    .concat(options.ignores || `**/?(docs|docusaurus|packages|tmp|.etmp|samples|dist)`)
    .concat(options.moreIgnores)
    .filter(x => x);

  return _scanFileStats(dir, ignores, "");
}

export { scanFileStats };

// async function test() {
//   console.log(await scanFileStats("."));
// }

// test();