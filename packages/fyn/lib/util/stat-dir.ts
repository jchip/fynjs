
import Fs from "./file-ops";
import Path from "path";
import { Minimatch } from "minimatch";
import gitignore from "ignore";
import { filterScanDir, type ExtrasData } from "filter-scan-dir";
import type { Stats } from "fs";

async function _scanFileStats(dir: string, ignores: string[], baseDir: string = "") {
  const patterns = ignores.map(pattern => new Minimatch(pattern, { dot: true }));
  const ignore = (fullPath: string) => patterns.find(pattern => pattern.match(fullPath));

  let latestMtimeMs = 0;
  let latestFile = "";

  const updateLatest = (mtimeMs: number, file: string) => {
    if (mtimeMs > latestMtimeMs) {
      latestMtimeMs = mtimeMs;
      latestFile = file;
    }
  };

  const inspectFile = (file: string) => {
    try {
      updateLatest(Fs.statSync(file).mtimeMs, file);
    } catch (err) {
      if (err.code !== "ENOENT" && err.code !== "ENOTDIR") throw err;
    }
  };

  const filter = (file: string, path: string, extras: ExtrasData) => {
    if (ignore(extras.fullFile)) {
      return false;
    }
    updateLatest((extras.stat as Stats).mtimeMs, extras.fullFile);
    return true;
  };

  const fullDir = Path.join(baseDir, dir);
  const topDirStat = await Fs.stat(fullDir);
  updateLatest(topDirStat.mtimeMs, fullDir);

  // Install inputs still matter when a repository ignores generated lockfiles or overrides.
  for (const file of [
    "package.json", "package-fyn.json", "fyn-lock.yaml", "package-lock.json",
    "npm-shrinkwrap.json", "yarn.lock", ".npmrc", ".fynrc", "fynpo.json", "fynpo.config.js",
    "fynpo.config.json"
  ]) {
    inspectFile(Path.join(fullDir, file));
  }

  // Inherited rule edits can expose source files older than the last install.
  const ruleDirs = [];
  let ancestor = Path.resolve(fullDir);
  while (true) {
    ruleDirs.push(ancestor);
    if (Fs.existsSync(Path.join(ancestor, ".git"))) break;
    const parent = Path.dirname(ancestor);
    if (parent === ancestor) {
      ruleDirs.length = 1;
      break;
    }
    ancestor = parent;
  }
  for (const ruleDir of ruleDirs) {
    inspectFile(ruleDir); // Also detect deletion of an inherited .gitignore.
    inspectFile(Path.join(ruleDir, ".gitignore"));
  }

  await filterScanDir({
    cwd: fullDir,
    prependCwd: false,
    gitignore: rules => gitignore().add(rules),
    filter,
    filterDir: (file, path, extras) => {
      if (!filter(file, path, extras)) return false;
      // Inspect rules even when the rules themselves are ignored (for example by '*').
      inspectFile(Path.join(extras.fullFile, ".gitignore"));
      return true;
    },
    concurrency: 500,
    fullStat: true // we need full stat to get the mtimeMs prop
  });

  return { latestMtimeMs, latestFile };
}

function scanFileStats(dir: string, options: { ignores?: string | string[]; moreIgnores?: string | string[] } = {}) {
  // TODO: make this more flexible and configurable
  const ignores = [
    `**/?(node_modules|_fyn|.vscode|.DS_Store|coverage|.nyc_output|.fynpo|.git|.github|.gitignore)`,
    "**/*.?(log|md)"
  ]
    .concat(options.ignores || `**/?(docs|docusaurus|packages|tmp|.temp|.etmp|samples|dist)`)
    .concat(options.moreIgnores)
    .filter(x => x);

  return _scanFileStats(dir, ignores, "");
}

export { scanFileStats };

// async function test() {
//   console.log(await scanFileStats("."));
// }

// test();
