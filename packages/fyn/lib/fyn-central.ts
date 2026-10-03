
import Path from "path";
import Fs from "./util/file-ops";
import ssri from "ssri";
import * as Tar from "tar";
import fyntil from "./util/fyntil";
import { cloneFile, copyFile, linkFile } from "./util/hard-link-dir";
import { loadReflinkCloneDir, loadReflinkCloneFiles, type CloneDir } from "./util/reflink";
import logger from "./logger";
import { AggregateError } from "@jchip/error";
import { filterScanDir, type ExtrasData } from "filter-scan-dir";
import type { Stats } from "fs";
import Crypto from "crypto";
import * as xaa from "xaa";
import type { Readable } from "stream";

const { missPipe } = fyntil;

/** File metadata in the tree */
interface FileInfo {
  /** File size */
  z: number;
  /** Modification time in seconds */
  m: number;
  /** Checksum (tar header cksum) */
  $: number | boolean;
}

/** Directory tree node - uses null prototype objects to avoid name conflicts */
interface TreeNode {
  /** Files in this directory */
  "/": Record<string, FileInfo>;
  /** Subdirectories */
  [dir: string]: TreeNode | Record<string, FileInfo>;
}

/** Flattened tree structure */
interface FlattenedTree {
  dirs: string[];
  files: string[];
}

/** Package info from integrity analysis */
interface PackageInfo {
  algorithm: string;
  contentPath: string;
  hex: string;
  tree?: TreeNode | false;
  exist?: boolean;
  mutates?: boolean;
  shaSum?: string;
  /** tree.json's `_`, which says how shaSum was made; undefined for the unwrapped legacy tree */
  sumVersion?: number;
  validated?: boolean;
}

/**
 * tree.json's current format. Its shaSum hashes each file's path, mtime in whole seconds and
 * size, so a fresh extraction gets it from the tar headers without walking the files again.
 * Format 1 hashed a stat walk of files and dirs with mtimes in ms.
 */
const SUM_VERSION = 2;

const hashList = (list: string[]): string =>
  Crypto.createHash("sha512").update(JSON.stringify(list.sort())).digest("base64");

/** Tree file content structure (new format with version) */
interface TreeFileContent {
  _: number;
  $?: TreeNode;
  shaSum?: string;
  mutates?: boolean;
}

/** Type guard to check if parsed tree is new format with version */
function isTreeFileContent(obj: unknown): obj is TreeFileContent {
  return typeof obj === "object" && obj !== null && "_" in obj && typeof (obj as TreeFileContent)._ === "number";
}

/** Options for FynCentral constructor */
interface FynCentralOptions {
  centralDir?: string;
  /** hardlink replicated files to the store, falling back to a copy where links fail */
  hardlink?: boolean;
  /** false never reflinks (clones) replicated files, so @fynjs/reflink isn't used */
  reflink?: boolean;
  /** false fails instead of copying a file that can't be cloned or hardlinked */
  copyFallback?: boolean;
}

/** an extraction marker or temp dir older than this was left by an install that died */
const STALE_MS = 5 * 60 * 1000;

/** a name suffix no other install, or other call in this one, will pick */
const uniqueSuffix = (): string => `${process.pid}-${Crypto.randomBytes(4).toString("hex")}`;

/** link errors that mean the filesystem can't hardlink from the store at all */
const NO_LINK_CODES = ["EXDEV", "EPERM", "ENOTSUP", "EOPNOTSUPP", "ENOSYS"];

/**
 * Convert a directory tree structure to a flatten one like:
 * ```
 * {
 *  dirs: [
 *    "/dir1"
 *  ],
 *  files: [
 *    "/file1",
 *    "/dir1/file1"
 *  ]
 * }
 * ```
 *
 * @param tree - the dir tree
 * @param output - output object
 * @param baseDir - base dir path
 * @returns flatten dir list
 */
function flattenTree(tree: TreeNode, output: FlattenedTree, baseDir: string): FlattenedTree {
  const dirs = Object.keys(tree);

  for (const dir of dirs) {
    if (dir === "/") continue;
    const fdir = Path.join(baseDir, dir);
    output.dirs.push(fdir);
    flattenTree(tree[dir] as TreeNode, output, fdir);
  }

  const files = Object.keys(tree["/"]);
  for (const file of files) {
    output.files.push(Path.join(baseDir, file));
  }

  return output;
}

/**
 * Create and maintain the fyn central storage
 */
class FynCentral {
  private _centralDir: string;
  private _map: Map<string, PackageInfo>;
  private _hardlink: boolean;
  private _reflink: boolean;
  private _copyFallback: boolean;
  /** cleared on the first dir clone the filesystem can't do, so later packages skip it */
  private _cloneDirs = true;

  constructor({
    centralDir = ".fyn/_central-storage",
    hardlink = true,
    reflink = true,
    copyFallback = true
  }: FynCentralOptions = {}) {
    this._centralDir = Path.resolve(centralDir);
    this._map = new Map();
    this._hardlink = hardlink;
    this._reflink = reflink;
    this._copyFallback = copyFallback;
  }

  _analyze(integrity: string): PackageInfo {
    const sri = ssri.parse(integrity, { single: true });

    const algorithm = sri.algorithm;
    const hex = sri.hexDigest();

    const segLen = 2;
    const contentPath = Path.join(
      ...[this._centralDir, algorithm].concat(
        hex.substring(0, segLen),
        hex.substring(segLen, segLen * 2),
        hex.substring(segLen * 2)
      )
    );

    return { algorithm, contentPath, hex };
  }

  /**
   * Load a dir tree for a centrally stored package
   *
   * @param integrity - package integrity checksum
   * @param _info - package info
   * @param _noSet - if true, then do not mark package in map
   * @returns dir tree info
   */
  async _loadTree(
    integrity: string,
    _info?: PackageInfo,
    _noSet?: boolean
  ): Promise<PackageInfo> {
    let info = _info;
    let noSet = _noSet;

    if (!info) {
      if (this._map.has(integrity)) {
        info = this._map.get(integrity)!;
        noSet = true;
      } else {
        info = this._analyze(integrity);
        info.tree = false;
      }
    }

    try {
      const stat = await Fs.stat(info.contentPath);
      info.exist = true;
      if (stat.isDirectory()) {
        await this.readInfoTree(info);
        if (!noSet) {
          this._map.set(integrity, info);
        }
      }
      return info;
    } catch (_err) {
      return info;
    }
  }

  /**
   * Check if central has the package
   *
   * @param integrity - package integrity
   * @returns boolean
   */
  async has(integrity: string): Promise<boolean> {
    const info = this._map.has(integrity)
      ? this._map.get(integrity)!
      : await this._loadTree(integrity);

    return Boolean(info.tree);
  }

  /**
   * Check if a package is allowed to go into central store
   *
   * @param integrity - package integrity
   * @returns boolean
   */
  async allow(integrity: string): Promise<boolean> {
    const info = this._map.has(integrity)
      ? this._map.get(integrity)!
      : await this._loadTree(integrity);

    return info.mutates ? false : true;
  }

  async getContentPath(integrity: string): Promise<string> {
    return (await this.getInfo(integrity)).contentPath;
  }

  async getInfo(integrity: string): Promise<PackageInfo> {
    if (this._map.has(integrity)) {
      return this._map.get(integrity)!;
    }
    const info = await this._loadTree(integrity);
    if (!info.tree) {
      throw new Error(`fyn-central can't get package for integrity ${integrity}`);
    }
    return info;
  }

  /**
   * Hash a package dir in one stat walk, in both formats: v1 for checking an old entry, v2 for
   * everything else (see SUM_VERSION).
   */
  async _scanShasums(packageDir: string): Promise<{ v1: string; v2: string } | undefined> {
    try {
      const v2: string[] = [];
      const filter = (
        _file: string,
        _path: string,
        extras: ExtrasData
      ): { formatName: string } => {
        const { stat, dirFile } = extras;
        const fullStat = stat as Stats;
        if (!fullStat.isDirectory()) {
          v2.push(`${dirFile.replace(/\\/g, "/")}-${Math.floor(fullStat.mtimeMs / 1000)}-${fullStat.size}`);
        }
        return { formatName: `${dirFile}-${fullStat.mtimeMs}-${fullStat.size}` };
      };

      const files = await filterScanDir({
        cwd: packageDir,
        filter,
        filterDir: filter,
        fullStat: true, // need full stat for mtimeMs and size prop
        concurrency: 500,
        sortFiles: false, // concurrency breaks sorting, sort files all at once after
        includeDir: true
      });

      return { v1: hashList(files as string[]), v2: hashList(v2) };
    } catch (_err) {
      return undefined;
    }
  }

  /** The v2 hash of a fresh extraction, from the tar header sizes and mtimes in its tree */
  _treeShasum(tree: TreeNode): string {
    const files: string[] = [];
    const walk = (node: TreeNode, dir: string): void => {
      for (const [name, child] of Object.entries(node)) {
        if (name === "/") {
          for (const [file, info] of Object.entries(child as Record<string, FileInfo>)) {
            files.push(`${dir}${file}-${info.m}-${info.z}`);
          }
        } else {
          walk(child as TreeNode, `${dir}${name}/`);
        }
      }
    };
    walk(tree, "");
    return hashList(files);
  }

  async _calcContentShasum(info: PackageInfo, pkgDir?: string): Promise<string | undefined> {
    return (await this._scanShasums(pkgDir || Path.join(info.contentPath, "package")))?.v1;
  }

  /**
   * Get the hash of a npm package's extracted content.
   * - only consider the file names and their mtime and size because npm tar files
   *   with a fixed timestamp to publish, so the mtime give us some assurance
   *   to know if file changed.
   *
   * @param integrity - shasum integrity for the package
   * @returns shasum or undefined
   */
  async getContentShasum(integrity: string): Promise<string | undefined> {
    try {
      const info = await this.getInfo(integrity);
      return this._calcContentShasum(info);
    } catch (_err) {
      return undefined;
    }
  }

  async getMutation(integrity: string): Promise<boolean | undefined> {
    const info = this._map.has(integrity)
      ? this._map.get(integrity)!
      : await this._loadTree(integrity);

    return info.mutates;
  }

  /**
   * Rename the entry away before removing it, so a concurrent install never finds it half
   * deleted, with tree.json present and package/ partly gone.
   */
  async delete(integrity: string): Promise<void> {
    const info = this._map.get(integrity);
    if (info && info.exist && info.contentPath) {
      const trash = `${info.contentPath}.del-${uniqueSuffix()}`;
      try {
        await Fs.rename(info.contentPath, trash);
      } catch (err) {
        // ENOENT: another install deleted it first
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
      this._map.delete(integrity);
      await Fs.$.rimraf(trash);
    }
  }

  /**
   * Read the content dir tree from file into info
   *
   * @param info - package info
   */
  async readInfoTree(info: PackageInfo): Promise<void> {
    const treeFile = Path.join(info.contentPath, "tree.json");
    try {
      const data = await Fs.readFile(treeFile);
      const parsed: unknown = JSON.parse(data.toString());
      if (isTreeFileContent(parsed) && parsed._ >= 1) {
        if (parsed.mutates !== undefined) {
          info.mutates = parsed.mutates;
        }
        info.tree = parsed.$;
        info.shaSum = parsed.shaSum;
        info.sumVersion = parsed._;
      } else {
        // Legacy format: tree stored directly without wrapper
        info.tree = parsed as TreeNode;
      }
    } catch (err) {
      throw new AggregateError([err as Error], `fyn-central: reading tree file ${treeFile}`);
    }
  }

  /**
   * Save the content dir tree from info to file. In a live entry it's written to a temp file
   * and renamed over, so a concurrent install never reads half of it. A `path` is a temp dir
   * only this install uses, so it's written directly.
   *
   * @param info - package info
   * @param path - path to save the file
   */
  async saveInfoTree(info: PackageInfo, path?: string): Promise<void> {
    // an old entry keeps its format until validate() converts it, so a v1 hash is never labeled v2
    const data = JSON.stringify({ $: info.tree, shaSum: info.shaSum, mutates: info.mutates, _: info.sumVersion ?? 1 });
    if (path) {
      await Fs.writeFile(Path.join(path, "tree.json"), data);
      return;
    }
    const treeFile = Path.join(info.contentPath, "tree.json");
    const tmpFile = `${treeFile}.${uniqueSuffix()}`;
    await Fs.writeFile(tmpFile, data);
    await Fs.rename(tmpFile, treeFile);
  }

  async setMutation(integrity: string, mutates = true): Promise<void> {
    const info = await this._loadTree(integrity);
    if (!info.exist || !info.tree || info.mutates === mutates) {
      return;
    }
    info.mutates = mutates;
    await this.saveInfoTree(info);
  }

  async replicate(integrity: string, destDir: string): Promise<void> {
    try {
      const info = await this.getInfo(integrity);

      const list = flattenTree(info.tree as TreeNode, { dirs: [], files: [] }, "");
      const srcDir = Path.join(info.contentPath, "package");

      // one clone for the whole package, where the filesystem can (APFS). Per-file placement
      // pays a metadata cost for every file, clone or link alike.
      const cloneDir = this._reflink && this._cloneDirs && (await loadReflinkCloneDir());
      if (cloneDir && (await this._cloneWholeDir(cloneDir, srcDir, destDir))) {
        return;
      }

      for (const dir of list.dirs) {
        await Fs.$.mkdirp(Path.join(destDir, dir));
      }

      // @fynjs/reflink clones, else hardlinks unless hardlink is off, else copies unless
      // copyFallback is off. package.json is never linked, since fyn rewrites it in place. With
      // reflink off, @fynjs/reflink is skipped, since it always tries a clone first.
      const reflinkCloneFiles = this._reflink && (await loadReflinkCloneFiles());
      const copy = this._copyFallback;
      if (reflinkCloneFiles) {
        const others = list.files.filter(f => f !== "package.json");
        await Promise.all([
          reflinkCloneFiles(srcDir, destDir, others, this._hardlink, copy),
          others.length < list.files.length &&
            reflinkCloneFiles(srcDir, destDir, ["package.json"], false, copy)
        ]);
        return;
      }

      await xaa.map(
        list.files,
        (file: string) => {
          const src = Path.join(info.contentPath, "package", file);
          const dest = Path.join(destDir, file);
          // copy package.json because we modify it. With reflink off, a copy is its only way
          // in, not a fallback, so copyFallback doesn't apply to it.
          // TODO: don't modify it?
          if (file === "package.json") {
            return this._reflink && !copy ? cloneFile(src, dest, true) : copyFile(src, dest);
          }
          return this._hardlink ? this._linkFile(src, dest) : this._cloneOrCopy(src, dest);
        },
        { concurrency: 5 }
      );
    } catch (err) {
      const msg = `fyn-central can't replicate package at ${destDir} for integrity ${integrity}`;
      throw new AggregateError([err as Error], msg);
    }
  }

  /**
   * Hardlink a file from the store, or clone it where the filesystem can't link it, such as a
   * store on another volume. That failure turns linking off for the rest of the run.
   */
  async _linkFile(src: string, dest: string): Promise<void> {
    try {
      await linkFile(src, dest);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code!;
      if (NO_LINK_CODES.includes(code)) {
        if (this._hardlink) {
          this._hardlink = false;
          logger.info(`fyn-central: can't hardlink from ${this._centralDir} (${code}), copying instead`);
        }
      } else if (code !== "EMLINK") {
        // EMLINK: this one file has too many links, so copy just it
        throw err;
      }
    }
    await this._cloneOrCopy(src, dest);
  }

  /** Clone, else copy, as reflink and copyFallback allow. */
  async _cloneOrCopy(src: string, dest: string): Promise<void> {
    if (this._reflink) {
      await cloneFile(src, dest, !this._copyFallback);
    } else if (this._copyFallback) {
      await copyFile(src, dest);
    } else {
      throw new Error(`fyn-central: can't place ${dest}: it can't be hardlinked, and reflink and copy-fallback are off`);
    }
  }

  /**
   * Clone the store's package dir to `destDir` in one call. A dir clone needs a path that
   * doesn't exist, so it goes to a unique sibling that's then renamed over `destDir`. The
   * rename replaces `destDir` only while it's still the empty dir createPkgOutDir made. If
   * anything put files there meanwhile, the clone is dropped for the per-file path, which never
   * writes through an existing file. Resolves false, with `destDir` untouched, when not cloned.
   */
  async _cloneWholeDir(cloneDir: CloneDir, srcDir: string, destDir: string): Promise<boolean> {
    const tmp = `${destDir}.clone-${uniqueSuffix()}`;
    if (!(await cloneDir(srcDir, tmp))) {
      this._cloneDirs = false;
      logger.debug(`fyn-central: can't clone dirs from ${this._centralDir}, cloning files instead`);
      return false;
    }
    try {
      await Fs.rename(tmp, destDir);
      return true;
    } catch (err) {
      await Fs.$.rimraf(tmp);
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOTEMPTY" || code === "EEXIST") {
        return false;
      }
      throw err;
    }
  }

  /**
   * Extract a tarball and build its tree from the tar headers.
   *
   * @returns the tree, and whether its sizes and mtimes are what stat will report: true when
   *   every non-dir entry is a regular file with an mtime. A link or a missing mtime leaves
   *   something only a stat walk can see.
   */
  _untarStream(tarStream: Readable, targetDir: string): Promise<{ tree: TreeNode; fromHeaders: boolean }> {
    // since we are using objects to store directory tree we have to
    // create objects without the normal prototypes to avoid name conflict
    // with file names
    const newDirObj = (): TreeNode => {
      const n = Object.create(null) as TreeNode;
      n["/"] = Object.create(null);
      return n;
    };

    const dirTree = newDirObj();
    let fromHeaders = true;

    const strip = 1;

    const untarStream = Tar.x({
      strip,
      strict: true,
      C: targetDir,
      onentry: (entry: Tar.ReadEntry) => {
        const parts = entry.path.split(/\/|\\/);
        const isDir = entry.type === "Directory";
        const dirs = parts.slice(strip, isDir ? parts.length : parts.length - 1);

        const wtree = dirs.reduce((wt: TreeNode, dir: string) => {
          return (wt[dir] as TreeNode) || (wt[dir] = newDirObj());
        }, dirTree);

        if (isDir) return;

        if (!entry.mtime || !["File", "OldFile", "ContiguousFile"].includes(entry.type)) {
          fromHeaders = false;
        }

        const fname = parts[parts.length - 1];
        if (fname) {
          const m = Math.round((entry.mtime ? entry.mtime.getTime() : Date.now()) / 1000);
          wtree["/"][fname] = {
            z: entry.size,
            m,
            $: entry.header.cksumValid && entry.header.cksum
          };
        }
      }
    });

    return missPipe(tarStream, untarStream).then(() => ({ tree: dirTree, fromHeaders }));
  }

  /**
   * Claim the `.extracting` marker that tells other installs this one is writing the entry.
   * mkdir is atomic, so only one install gets it. A marker older than STALE_MS was left by an
   * install that died, so it is taken over.
   *
   * @returns true when this install owns the marker
   */
  async _claimMarker(marker: string, retry = true): Promise<boolean> {
    try {
      await Fs.mkdir(marker);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
    const stat = await Fs.stat(marker).catch(() => undefined);
    if (retry && (!stat || Date.now() - stat.mtimeMs > STALE_MS)) {
      await Fs.$.rimraf(marker);
      return this._claimMarker(marker, false);
    }
    return false;
  }

  /** Remove temp and trash dirs that installs which died left next to the entry. */
  async _removeStaleTemps(contentPath: string): Promise<void> {
    const dir = Path.dirname(contentPath);
    const base = Path.basename(contentPath);
    for (const name of await Fs.readdir(dir)) {
      if (!name.startsWith(`${base}.tmp`) && !name.startsWith(`${base}.del-`)) continue;
      const stat = await Fs.stat(Path.join(dir, name)).catch(() => undefined);
      if (stat && Date.now() - stat.mtimeMs > STALE_MS) {
        await Fs.$.rimraf(Path.join(dir, name));
      }
    }
  }

  /**
   * Extract into a temp dir only this call uses, then rename it into place. The rename is
   * atomic, so other installs see the entry complete or not at all. If another install renamed
   * its copy in first, that copy has the same integrity, so this one is dropped for it.
   */
  async _storeTarStream(
    info: PackageInfo,
    _stream: Readable | (() => Readable) | (() => Promise<Readable>) | Promise<Readable>
  ): Promise<void> {
    let stream = _stream;
    const tmp = `${info.contentPath}.tmp-${uniqueSuffix()}`;

    try {
      const targetDir = Path.join(tmp, "package");
      await Fs.$.mkdirp(targetDir);
      if (typeof stream === "function") {
        stream = stream();
      }
      if ((stream as Promise<Readable>).then) {
        stream = await (stream as Promise<Readable>);
      }
      const { tree, fromHeaders } = await this._untarStream(stream as Readable, targetDir);
      info.tree = tree;
      info.shaSum = fromHeaders ? this._treeShasum(tree) : (await this._scanShasums(targetDir))?.v2;
      info.sumVersion = SUM_VERSION;
      await this.saveInfoTree(info, tmp);

      try {
        await Fs.rename(tmp, info.contentPath);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code!;
        if (!["ENOTEMPTY", "EEXIST", "EPERM"].includes(code) || !(await Fs.exists(info.contentPath))) {
          throw err;
        }
        logger.debug("fyn-central: another install stored it first", info.contentPath);
        await Fs.$.rimraf(tmp);
        await this.readInfoTree(info);
      }
    } catch (err) {
      await Fs.$.rimraf(tmp);
      throw err;
    }
    info.exist = true;
  }

  /**
   * Validate the central store package content by file size and timestamp
   *
   * @param integrity - package integrity
   * @returns true or false
   */
  async validate(integrity: string): Promise<boolean> {
    const info = this._map.get(integrity);
    if (info === undefined || !info.exist) {
      return false;
    }

    if (info.validated === undefined) {
      const sums = await this._scanShasums(Path.join(info.contentPath, "package"));
      if (info.sumVersion === SUM_VERSION) {
        info.validated = Boolean(sums) && info.shaSum === sums!.v2;
      } else {
        // an older entry: check it with its own format's hash, then move it to the current one
        info.validated = Boolean(sums) && (!info.shaSum || info.shaSum === sums!.v1);
        if (info.validated) {
          info.shaSum = sums!.v2;
          info.sumVersion = SUM_VERSION;
          await this.saveInfoTree(info);
        }
      }
    }

    return info.validated;
  }

  /**
   * Store a package's tarball in the central store. Installs never wait on each other: each
   * extracts into its own temp dir and renames it into place.
   *
   * While extracting, an install holds the entry's `.extracting` marker. With `deferIfBusy`, a
   * live marker from another install returns false without reading the stream, so the caller
   * can do its other packages first and come back to this one.
   *
   * @returns false when deferred, true when the package is in the store
   */
  async storeTarStream(
    pkgId: string,
    integrity: string,
    stream: Readable | (() => Readable) | (() => Promise<Readable>) | Promise<Readable>,
    deferIfBusy = false
  ): Promise<boolean> {
    let currentStream: typeof stream | undefined = stream;
    let marker: string | undefined;

    try {
      const info = await this._loadTree(integrity);

      if (info.exist) {
        logger.debug("fyn-central storeTarStream: already exist", info.contentPath);
        if (!info.tree) {
          logger.error(`fyn-central exist package missing tree.json`);
        }
        return true;
      }

      await Fs.$.mkdirp(Path.dirname(info.contentPath));
      const markerPath = `${info.contentPath}.extracting`;
      if (await this._claimMarker(markerPath)) {
        marker = markerPath;
        // another install may have finished the entry just before releasing its marker
        if ((await this._loadTree(integrity, info)).exist) {
          return true;
        }
        await this._removeStaleTemps(info.contentPath);
      } else if (deferIfBusy) {
        logger.debug("fyn-central: another install is storing it, deferring", pkgId);
        return false;
      }

      logger.debug("storing tar to central store", pkgId, integrity);
      await this._storeTarStream(info, currentStream);
      currentStream = undefined;
      this._map.set(integrity, info);
      logger.debug("fyn-central storeTarStream: stored", pkgId, info.contentPath);
      return true;
    } finally {
      if (currentStream && (currentStream as Readable).destroy !== undefined) {
        (currentStream as Readable).destroy();
      }
      if (marker) {
        await Fs.rmdir(marker).catch(() => undefined);
      }
    }
  }
}

export default FynCentral;
