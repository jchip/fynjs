/**
 * Remove non-runtime files from a production `node_modules` tree, so a
 * container image carries only what node actually loads.
 *
 * ESM, TypeScript, bundled like the rest of fyn (see tsconfig.json for why the
 * lib target sits at ES2022). This backs the `fyn prod-prune` command rather
 * than running as its own standalone tool.
 *
 * None of what this deletes is reachable code, all of it is readable by anyone
 * who pulls the image, and every file of it is inventory a scanner has to
 * enumerate. Source maps reconstruct a dependency's original source; test and
 * fixture directories are a well-known home for hardcoded credentials and
 * sample tokens.
 *
 *   fyn prod-prune [dir] [--max-kb <n>] [--max-files <n>]
 *
 * Nothing about a file's size says whether it may be deleted — the largest file
 * in a BFF install is loaded at runtime — so size is only ever reported, never
 * acted on. Every run lists the files over 100kB, so the build log says where
 * the weight sits. The budgets are the regression gate on top of that: they
 * make new material entering the image someone's decision at review time
 * rather than a surprise at deploy time, and exceeding either names the largest
 * packages and exits non-zero.
 */
import Fs from "fs";
import Path from "path";
import { filterScanDir } from "filter-scan-dir";
import logger from "../logger";
import { combineLicenses, type LicenseEntry, type CombinedLicenses } from "./licenses";
import {
  REMOVE_DIRS,
  isBundlerOnlyEsnext,
  isFynInstalledLock,
  isLicenseFile,
  isNonRuntimeFile,
  isPackageRoot,
  isReviewableAsset,
  readManifestTargets,
  type ManifestTargets
} from "./rules";

const LARGE_FILE_BYTES = 100 * 1024;
const LARGE_LIST_LIMIT = 20;
const REVIEW_LIST_LIMIT = 20;
const COMBINED_LICENSE_FILE = "THIRD-PARTY-LICENSES.txt";

export interface ProdPruningConfig {
  maxKb: number;
  maxFiles: number;
  keepPaths: string[];
}

export interface KeptFile {
  path: string;
  size: number;
  review?: boolean;
}

interface CollectedLicense extends LicenseEntry {
  path: string;
}

interface ScanResult {
  removeDirs: string[];
  removeFiles: string[];
  licenses: CollectedLicense[];
  kept: KeptFile[];
  keptBytes: number;
}

interface PackageIdentity {
  name: string;
  version: string;
}

export interface CleanResult {
  files: number;
  kb: number;
  withinBudget: boolean;
}

/**
 * What the package owning this tree declares about its own pruning, under a
 * `prodPruning` key in the package.json beside `node_modules`.
 *
 *   "prodPruning": {
 *     "maxKb": 15600,        // fail the build above this many kB
 *     "maxFiles": 2850,      // fail the build above this many files
 *     "keepPaths": ["some-pkg/vendor", "some-pkg/table.bin"]
 *   }
 *
 * Budgets live here rather than in a Dockerfile so that a dependency change and
 * the budget it moves land in the same file, in the same commit, under the same
 * review. `keepPaths` is the escape hatch that lets the rules stay generic: an
 * app that needs one specific file or directory spared says so here, instead of
 * a package name leaking into a rule where it would go stale.
 *
 * @param root the node_modules being cleaned
 */
function readConfig(root: string): ProdPruningConfig {
  let declared: any = {};
  try {
    const manifest = Path.join(Path.dirname(root), "package.json");
    declared = JSON.parse(Fs.readFileSync(manifest, "utf8")).prodPruning ?? {};
  } catch {
    // no manifest beside the tree, or nothing declared
  }
  return {
    maxKb: Number(declared.maxKb) || 0,
    maxFiles: Number(declared.maxFiles) || 0,
    keepPaths: Array.isArray(declared.keepPaths) ? declared.keepPaths : []
  };
}

/**
 * Walk the tree once, sorting every entry into what goes, what stays, and what
 * carries a copyright notice.
 *
 * @param root
 * @param keepPaths relative to `root`, each either a file or a directory;
 *   naming a directory spares everything under it
 */
async function scan(root: string, keepPaths: string[]): Promise<ScanResult> {
  const keepList = keepPaths.map(path => path.split("/").join(Path.sep));
  const isKeepPath = (fullPath: string) => {
    const rel = Path.relative(root, fullPath);
    return keepList.some(path => rel === path || rel.startsWith(`${path}${Path.sep}`));
  };

  // The walk lstats, so a symlink to a directory is not treated as one and is
  // never descended into. That is deliberate, and load-bearing: a package
  // manager may link a package rather than copy it, and deleting through such a
  // link would strip files from whatever it points at — a shared store, or in
  // this repo a workspace package that is somebody's working checkout. A link
  // whose target lives inside the tree still gets cleaned, once, by its real
  // path; a link out of the tree is left alone, which is the right answer.
  //
  // Directories are collected here rather than through the library's grouping
  // because a directory added to a group is also recursed into, and there is no
  // point walking a tree that is about to be deleted whole. Kept files are
  // collected here too, because the budget and the report need their sizes and
  // a group holds only paths.
  const removeDirs: string[] = [];
  const kept: KeptFile[] = [];
  const licenses: CollectedLicense[] = [];
  let keptBytes = 0;

  const targetCache = new Map<string, ManifestTargets>();
  const manifestTargets = (pkgDir: string) => {
    if (!targetCache.has(pkgDir)) {
      targetCache.set(pkgDir, readManifestTargets(pkgDir));
    }
    return targetCache.get(pkgDir)!;
  };

  const groups = await filterScanDir({
    cwd: root,
    prependCwd: true,
    grouping: true,
    rethrowError: true,
    filterDir: (file, path, extras) => {
      if (isKeepPath(extras.fullFile)) {
        return true;
      }
      if (
        !isPackageRoot(root, extras.fullFile) &&
        (REMOVE_DIRS.has(file) ||
          isBundlerOnlyEsnext(extras.fullFile, extras.files as string[], manifestTargets))
      ) {
        removeDirs.push(extras.fullFile);
        return false;
      }
      return true;
    },
    filter: (file, path, extras) => {
      if (isKeepPath(extras.fullFile)) {
        kept.push({ path: extras.fullFile, size: extras.stat.size, review: false });
        keptBytes += extras.stat.size;
        return false;
      }
      if (isLicenseFile(file, extras.ext)) {
        // Read here, while the walk is already at the file. The notices are
        // merged in memory and written out once at the end; nothing is read
        // back off disk after this point.
        const owner = packageOf(root, extras.fullFile);
        licenses.push({
          path: extras.fullFile,
          package: owner.version ? `${owner.name}@${owner.version}` : owner.name,
          file,
          text: Fs.readFileSync(extras.fullFile, "utf8")
        });
        return false;
      }
      if (isNonRuntimeFile(file, extras.ext) || isFynInstalledLock(root, extras.fullFile)) {
        return "remove";
      }
      kept.push({
        path: extras.fullFile,
        size: extras.stat.size,
        review: isReviewableAsset(extras.ext)
      });
      keptBytes += extras.stat.size;
      return false;
    }
  });

  return { removeDirs, removeFiles: groups.remove || [], licenses, kept, keptBytes };
}

/**
 * Delete the directories the deletions left empty. Deepest first, so a parent
 * emptied by its own children going away is collected in the same pass.
 */
async function removeEmptyDirs(root: string): Promise<number> {
  const dirs = await filterScanDir({
    cwd: root,
    prependCwd: true,
    includeDir: true,
    rethrowError: true,
    filter: () => false
  });
  const depth = (dir: string) => dir.split("/").length;
  dirs.sort((a, b) => depth(b) - depth(a));

  let removed = 0;
  for (const dir of dirs) {
    try {
      Fs.rmdirSync(dir);
      removed++;
    } catch {
      // still holds something — nothing to do
    }
  }
  return removed;
}

const packageCache = new Map<string, PackageIdentity>();

/**
 * Which package ships this file, and at which version.
 *
 * The directory is found from the *last* `node_modules` in the path, not the
 * first, so a nested copy is attributed to the package itself rather than to
 * the store holding it — fyn keeps duplicate versions under
 * `.f/_/<name>/<version>/node_modules/`, and reporting those as a package
 * called `.f` tells you nothing. One path segment after that, or two when the
 * first starts with `@`.
 *
 * The name then comes from that directory's own package.json rather than from
 * the directory name, which is the only authoritative answer — and the reason
 * to compute the directory this way instead of walking up looking for the
 * nearest manifest, since packages routinely drop a `dist/cjs/package.json`
 * carrying nothing but `{"type": "commonjs"}`.
 */
function packageOf(root: string, fullPath: string): PackageIdentity {
  const parts = Path.relative(root, fullPath).split(Path.sep);
  const start = parts.lastIndexOf("node_modules") + 1;
  if (start >= parts.length - 1) {
    return { name: parts.at(-1)!, version: "" }; // a file at the root of the tree
  }
  const span = parts[start].startsWith("@") ? 2 : 1;
  const dir = Path.join(root, ...parts.slice(0, start + span));
  if (!packageCache.has(dir)) {
    packageCache.set(dir, readPackageIdentity(dir, parts.slice(start, start + span).join("/")));
  }
  return packageCache.get(dir)!;
}

function readPackageIdentity(dir: string, fallbackName: string): PackageIdentity {
  try {
    const manifest = JSON.parse(Fs.readFileSync(Path.join(dir, "package.json"), "utf8"));
    return { name: manifest.name ?? fallbackName, version: manifest.version ?? "" };
  } catch {
    return { name: fallbackName, version: "" };
  }
}

/** Total size of the surviving files, grouped by the package that ships them. */
function largestPackages(root: string, files: KeptFile[], limit: number): [string, number][] {
  const byPackage = new Map<string, KeptFile[]>();
  for (const file of files) {
    const name = packageOf(root, file.path).name;
    const group = byPackage.get(name);
    if (group) {
      group.push(file);
    } else {
      byPackage.set(name, [file]);
    }
  }
  return [...byPackage.entries()]
    .map(([name, group]): [string, number] => [name, group.reduce((total, file) => total + file.size, 0)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function kb(bytes: number): number {
  return Math.round(bytes / 1024);
}

/** The limits that are set, like `15600kB / 2850 files`, or `none`. */
function describeBudget(maxKb: number, maxFiles: number): string {
  const limits = [maxKb > 0 && `${maxKb}kB`, maxFiles > 0 && `${maxFiles} file${maxFiles === 1 ? "" : "s"}`].filter(Boolean);
  return limits.length > 0 ? limits.join(" / ") : "none";
}

/**
 * @returns the state of the tree afterwards. Returned rather than turned
 *   straight into an exit code so the caller decides what a budget overrun
 *   means — the CLI fails the build with it; a test just reads it.
 */
export async function clean(dir: string, cliMaxKb: number, cliMaxFiles: number): Promise<CleanResult> {
  const root = Path.resolve(dir);
  if (!Fs.existsSync(root)) {
    throw new Error(`no such directory: ${root}`);
  }

  // A flag beats what the package declares, so a one-off run can override a
  // budget without editing the manifest it is measuring.
  const config = readConfig(root);
  const maxKb = cliMaxKb || config.maxKb;
  const maxFiles = cliMaxFiles || config.maxFiles;
  if (config.keepPaths.length > 0) {
    logger.info(
      `keeping ${config.keepPaths.length} path` +
        `${config.keepPaths.length === 1 ? "" : "s"} named in prodPruning: ` +
        config.keepPaths.join(", ")
    );
  }

  const found = await scan(root, config.keepPaths);

  // Written before the originals go, so a failure here cannot lose a notice.
  let combined: (CombinedLicenses & { path: string; size: number }) | null = null;
  if (found.licenses.length > 0) {
    const merged = combineLicenses(found.licenses);
    const path = Path.join(root, COMBINED_LICENSE_FILE);
    Fs.writeFileSync(path, merged.content);
    combined = { ...merged, path, size: Buffer.byteLength(merged.content) };
  }

  for (const path of found.removeDirs) {
    Fs.rmSync(path, { recursive: true, force: true });
  }
  for (const path of found.removeFiles.concat(found.licenses.map(l => l.path))) {
    Fs.rmSync(path, { force: true });
  }
  const emptied = await removeEmptyDirs(root);

  const kept = combined
    ? found.kept.concat([{ path: combined.path, size: combined.size }])
    : found.kept;
  const keptBytes = found.keptBytes + (combined ? combined.size : 0);

  logger.info(
    `removed ${found.removeFiles.length} files, ` +
      `${found.removeDirs.length} directories and ${emptied} more left empty`
  );
  if (combined) {
    logger.info(
      `merged ${found.licenses.length} license files from ` +
        `${combined.packages} packages into ${combined.licenses} distinct ` +
        `${combined.licenses === 1 ? "license" : "licenses"} in ${COMBINED_LICENSE_FILE}`
    );
  }
  logger.info(
    `${kept.length} files, ${kb(keptBytes)}kB remain ` +
      `(budget ${describeBudget(maxKb, maxFiles)})`
  );

  // Advisory, never acted on: see `isReviewableAsset`.
  const review = found.kept.filter(file => file.review).sort((a, b) => b.size - a.size);
  if (review.length > 0) {
    logger.info(
      `${review.length} media or archive ` +
        `${review.length === 1 ? "file survives" : "files survive"} the prune. A ` +
        `server's runtime tree rarely needs one, but only a human can say whether a ` +
        `package reads its own asset, so these are reported and left alone:`
    );
    for (const file of review.slice(0, REVIEW_LIST_LIMIT)) {
      logger.info(`  ${String(kb(file.size)).padStart(7)}kB  ${Path.relative(root, file.path)}`);
    }
    if (review.length > REVIEW_LIST_LIMIT) {
      logger.info(`  ... and ${review.length - REVIEW_LIST_LIMIT} more`);
    }
  }

  // Reported on every run, not only when a budget trips. These files are not
  // deletable — the largest of them are loaded at runtime — so the value is in
  // the build log saying plainly where the weight sits, every time. A report
  // that only appears on failure tells you nothing until it is too late to
  // have noticed the trend.
  const large = kept.filter(file => file.size > LARGE_FILE_BYTES).sort((a, b) => b.size - a.size);
  if (large.length > 0) {
    const total = large.reduce((sum, file) => sum + file.size, 0);
    logger.info(
      `${large.length} files over ${kb(LARGE_FILE_BYTES)}kB hold ` +
        `${kb(total)}kB of the remaining ${kb(keptBytes)}kB:`
    );
    for (const file of large.slice(0, LARGE_LIST_LIMIT)) {
      logger.info(`  ${String(kb(file.size)).padStart(7)}kB  ${Path.relative(root, file.path)}`);
    }
    if (large.length > LARGE_LIST_LIMIT) {
      logger.info(`  ... and ${large.length - LARGE_LIST_LIMIT} more`);
    }
  }

  const result: CleanResult = { files: kept.length, kb: kb(keptBytes), withinBudget: true };
  const overKb = maxKb > 0 && result.kb > maxKb;
  const overFiles = maxFiles > 0 && result.files > maxFiles;
  if (!overKb && !overFiles) {
    return result;
  }

  logger.error(
    `FATAL: ${root} holds ${result.files} files and ${result.kb}kB, over the ` +
      `${describeBudget(maxKb, maxFiles)} budget.`
  );
  logger.error("Largest packages:");
  for (const [name, size] of largestPackages(root, kept, 20)) {
    logger.error(`  ${String(kb(size)).padStart(7)}kB  ${name}`);
  }
  return { ...result, withinBudget: false };
}
