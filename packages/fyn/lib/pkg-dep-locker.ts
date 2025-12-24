/* eslint-disable no-magic-numbers, max-depth */

import Path from "path";
import crypto from "crypto";
import assert from "assert";
import Fs from "./util/file-ops";
import _ from "lodash";
import chalk from "chalk";
import { simpleCompare as simpleSemverCompare } from "./util/semver";
import Yaml from "yamljs";
import sortObjKeys from "./util/sort-obj-keys";
import {
  LOCK_RSEMVERS,
  RSEMVERS,
  SORTED_VERSIONS,
  LOCK_SORTED_VERSIONS,
  LATEST_TAG_VERSION,
  LATEST_SORTED_VERSIONS,
  LATEST_VERSION_TIME,
  LOCAL_VERSION_MAPS,
  type LockLockVersionMeta,
  type PkgLockData,
  type LockDepItem,
  type LockLockPkgDepItems
} from "./types";
import logger from "./logger";
import fyntil from "./util/fyntil";
import type { DepData, PkgVersion } from "./dep-data";

/** Lock data with symbol properties (runtime expanded form) */
interface ConvertedLockData {
  [LATEST_TAG_VERSION]?: string;
  [LOCK_RSEMVERS]?: Record<string, string | string[]>;
  [SORTED_VERSIONS]?: string[];
  [LOCK_SORTED_VERSIONS]?: string[];
  [LATEST_SORTED_VERSIONS]?: string[];
  [LATEST_VERSION_TIME]?: number;
  [LOCAL_VERSION_MAPS]?: Record<string, string>;
  versions: Record<string, LockLockVersionMeta>;
  "dist-tags"?: Record<string, string>;
  time?: Record<string, string>;
  urlVersions?: Record<string, unknown>;
}

/** Lock file data structure with symbol support */
interface LockData {
  $pkg?: LockLockPkgDepItems;
  $fyn?: Record<string, unknown>;
  [pkgName: string]:
    | PkgLockData
    | ConvertedLockData
    | LockLockPkgDepItems
    | Record<string, unknown>
    | undefined;
}

/** Package metadata from registry */
interface PkgMeta {
  local?: boolean;
  versions: Record<string, LockLockVersionMeta>;
  "dist-tags"?: Record<string, string>;
  time?: Record<string, string>;
  urlVersions?: Record<string, unknown>;
  [SORTED_VERSIONS]?: string[];
  [LATEST_TAG_VERSION]?: string;
  [LATEST_VERSION_TIME]?: number;
  [LATEST_SORTED_VERSIONS]?: string[];
  [LOCAL_VERSION_MAPS]?: Record<string, string>;
}

/** Version package data from dep-data */
interface VersionPkgData extends PkgVersion {
  top?: boolean;
  optFailed?: number;
  hasPI?: boolean;
  local?: boolean;
  deprecated?: string;
  json?: {
    scripts?: { preinstall?: string; install?: string; postinstall?: string; postInstall?: string };
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    bundleDependencies?: string[];
    bundledDependencies?: string[];
    os?: string[];
    cpu?: string[];
    _hasShrinkwrap?: boolean;
    [key: string]: unknown;
  };
  dist?: {
    tarball?: string;
    shasum?: string;
    integrity?: string;
    fullPath?: string;
  };
}

/** Fyn instance interface for dep locker */
interface FynForDepLocker {
  _pkgSrcMgr?: {
    getRegistryUrl(name: string): string;
  };
  _options?: { ignoreLockUrl?: boolean };
  _shownMissingFiles: Set<string>;
}

class PkgDepLocker {
  private _enable: boolean;
  private _lockOnly: boolean;
  private _lockData: LockData;
  private _isFynFormat: boolean;
  private _config: Record<string, unknown>;
  private _fyn: FynForDepLocker;
  private _shaSum?: string | number;
  private _$pkg?: LockPkgDepItems;
  private _$pkgDiff?: { dep: Record<string, string>; dev: Record<string, string>; opt: Record<string, string> };
  private _$allPkgDiff: Record<string, string>;

  constructor(lockOnly: boolean, enableLockfile: boolean, fyn: FynForDepLocker) {
    this._enable = enableLockfile;
    this._lockOnly = lockOnly;
    this._lockData = {};
    this._isFynFormat = true;
    this._config = {};
    this._fyn = fyn;
    this._$allPkgDiff = {};
  }

  get data(): LockData {
    return this._lockData;
  }

  /**
   * Generate lock data from dep data
   */
  generate(depData: DepData): void {
    if (!this._enable) return;
    //
    // expect package names already sorted in depData
    //
    this._isFynFormat = true;
    const lockData = (this._lockData = { $pkg: this._$pkg });

    const genFrom = (pkgsData: Record<string, { versions: Record<string, VersionPkgData> }>): void => {
      _.each(pkgsData, (kpkg, name) => {
        const pkg = kpkg.versions;
        if (_.isEmpty(pkg)) return;
        const versions = Object.keys(pkg).sort(simpleSemverCompare);
        // collect all semvers that resolved to the same version
        // due to shrinkwrapping, sometimes the same semver could resolve to
        // multiple versions, causing resolved to be an array.
        let _semvers: Record<string, string[]> = _.transform(
          (kpkg as unknown as Record<symbol, Record<string, string | string[]>>)[RSEMVERS] || {},
          (a: Record<string, string[]>, resolved: string | string[], semv: string) => {
            const x = resolved.toString();
            if (a[x]) a[x].push(semv);
            else a[x] = [semv];
            return a;
          },
          {} as Record<string, string[]>
        );
        // join the collected semvers by , into a single string and use it as key
        // for the resolved version, and make sure multiple resolved versions
        // are converted back to an array.
        const semversTransformed: Record<string, string | string[]> = _.transform(
          _semvers,
          (a: Record<string, string | string[]>, semv: string[], resolved: string) => {
            const x = resolved.indexOf(",") > 0 ? resolved.split(",") : resolved.toString();
            a[semv.sort().join(",")] = x;
            return a;
          },
          {} as Record<string, string | string[]>
        );

        const pkgLock = (lockData[name] as PkgLockData) || ((lockData[name] = {}) as PkgLockData);

        const latestTagVersion = (kpkg as unknown as Record<symbol, string>)[LATEST_TAG_VERSION];
        if (latestTagVersion) {
          pkgLock._latest = latestTagVersion;
        }

        pkgLock._ = sortObjKeys({ ...pkgLock._, ...semversTransformed });

        _.each(versions, (version: string) => {
          const vpkg = pkg[version];
          if (!vpkg) return;
          const json = vpkg.json || {};
          const meta: LockVersionMeta = {};
          const dist = vpkg.dist || {};
          if (vpkg.top) meta.top = 1;
          const scripts = json.scripts || {};
          if (vpkg.optFailed) {
            meta.optFailed = vpkg.optFailed;
            // no need to remember whether there's preinstall or not if
            // it's already marked as failed.
          } else if (scripts.preinstall || vpkg.hasPI) {
            meta.hasPI = 1;
          }

          if (scripts.install || scripts.postinstall || scripts.postInstall) {
            meta.hasI = 1;
          }

          if (vpkg.local) {
            meta.$ = "local";
            meta._ = dist.fullPath;
          } else {
            meta.$ = fyntil.distIntegrity(dist) || 0;
            meta._ = dist.tarball;
          }

          if (!meta.optFailed) {
            if (_.isEmpty(json)) {
              meta._missingJson = true;
            } else {
              // save dependencies from package.json to meta in lockfile
              if (!_.isEmpty(json.dependencies)) {
                meta.dependencies = json.dependencies;
              }
              if (!_.isEmpty(json.optionalDependencies)) {
                meta.optionalDependencies = json.optionalDependencies;
              }
              if (!_.isEmpty(json.peerDependencies)) {
                meta.peerDependencies = json.peerDependencies;
              }
              const bd = json.bundleDependencies || json.bundledDependencies;
              if (!_.isEmpty(bd)) {
                meta.bundleDependencies = bd;
              }
            }
          }

          if (vpkg.deprecated) meta.deprecated = vpkg.deprecated;
          if (json.os) meta.os = json.os;
          if (json.cpu) meta.cpu = json.cpu;
          if (json._hasShrinkwrap) {
            meta._hasShrinkwrap = 1;
          }

          pkgLock[version] = meta;
        });
      });
    };

    // add lock info for installed packages
    genFrom(depData.getPkgsData() as Record<string, { versions: Record<string, VersionPkgData> }>);
    // now add lock info for packages that didn't install due to failures (optionalDependencies)
    genFrom(depData.getPkgsData(true) as Record<string, { versions: Record<string, VersionPkgData> }>);
  }

  /**
   * Take dep-item with its real meta and update lock data
   */
  update(item: LockDepItem, meta: PkgMeta): PkgMeta | ConvertedLockData {
    if (!this._enable || meta.local) return meta;
    let locked = this._lockData[item.name] as ConvertedLockData | PkgLockData | undefined;
    if (!locked) {
      return meta;
    }

    //
    // Add versions from <meta>
    //

    this._isFynFormat = false;

    if (!Object.prototype.hasOwnProperty.call(locked, LOCK_SORTED_VERSIONS)) {
      locked = (this.convert(item) || this._lockData[item.name]) as ConvertedLockData;
    }

    const convertedLocked = locked as ConvertedLockData;
    Object.assign(convertedLocked.versions, meta.versions);
    convertedLocked[SORTED_VERSIONS] = undefined;
    convertedLocked[LATEST_TAG_VERSION] = undefined;
    convertedLocked[LATEST_VERSION_TIME] = undefined;
    convertedLocked[LATEST_SORTED_VERSIONS] = undefined;
    if (Object.prototype.hasOwnProperty.call(meta, LOCAL_VERSION_MAPS)) {
      convertedLocked[LOCAL_VERSION_MAPS] = meta[LOCAL_VERSION_MAPS];
    }
    convertedLocked["dist-tags"] = meta["dist-tags"];
    convertedLocked.time = meta.time;

    if (meta.urlVersions) {
      convertedLocked.urlVersions = meta.urlVersions;
    }

    return convertedLocked;
  }

  hasLock(item: LockDepItem): boolean {
    return Boolean(this._enable && this._lockData[item.name]);
  }

  /**
   * Convert from fyn lock format to npm meta format
   */
  convert(item: LockDepItem): ConvertedLockData | false | undefined {
    if (!this._enable) return undefined;
    let locked = this._lockData[item.name] as PkgLockData | ConvertedLockData | undefined;
    if (!locked) return false;
    let valid = true;

    if (!Object.prototype.hasOwnProperty.call(locked, LOCK_SORTED_VERSIONS)) {
      this._isFynFormat = false;
      const pkgLocked = locked as PkgLockData;
      const sorted = Object.keys(pkgLocked)
        .filter(x => !x.startsWith("_"))
        .sort(simpleSemverCompare);
      const versions: Record<string, LockVersionMeta> = {};
      _.each(sorted, (version: string) => {
        const vpkg = pkgLocked[version] as LockVersionMeta;
        if (!_.isEmpty(vpkg) && vpkg._valid !== false) {
          if (vpkg.$ === "local") {
            vpkg.local = true;
            vpkg.dist = {
              integrity: "local",
              fullPath: vpkg._
            };
          } else {
            // When loading from lockfile, the tarball URL may have an old registry host/port
            // We need to update it to use the current registry to avoid connection errors
            let tarballUrl = vpkg._;
            if (tarballUrl && this._fyn && this._fyn._pkgSrcMgr) {
              const currentRegistry = this._fyn._pkgSrcMgr.getRegistryUrl(item.name);
              // Check if the tarball URL starts with a different registry
              // Format: http://host:port/package/-/package-version.tgz
              const urlMatch = tarballUrl.match(/^(https?:\/\/[^\/]+)(\/.*)/);
              if (urlMatch && currentRegistry) {
                const lockRegistry = urlMatch[1] + "/";
                const tarballPath = urlMatch[2];
                const ignoreLockUrl = this._fyn._options?.ignoreLockUrl;
                // If --ignore-lock-url is set or registries don't match, use current registry
                if (ignoreLockUrl || lockRegistry !== currentRegistry) {
                  tarballUrl = currentRegistry.replace(/\/$/, "") + tarballPath;
                }
              }
            }
            vpkg.dist = {
              integrity: fyntil.shaToIntegrity(vpkg.$),
              tarball: tarballUrl
            };
          }
          vpkg.$ = undefined;
          vpkg._ = undefined;
          vpkg.fromLocked = true;
          vpkg.name = item.name;
          vpkg.version = version;
          if (vpkg._hasShrinkwrap) {
            vpkg._hasShrinkwrap = true;
          }
          versions[version] = vpkg;
        } else {
          valid = false;
        }
      });
      // separated the semvers joined by , back into individual ones
      // and use them as keys to point to the resolved version.
      const _semvers: Record<string, string | string[]> = _.transform(
        pkgLocked._ || {},
        (a: Record<string, string | string[]>, v: string | string[], k: string) => {
          k.split(",").forEach(sv => (a[sv] = v));
          return a;
        },
        {} as Record<string, string | string[]>
      );
      locked = this._lockData[item.name] = {
        [LATEST_TAG_VERSION]: pkgLocked._latest,
        [LOCK_RSEMVERS]: _semvers,
        [LOCK_SORTED_VERSIONS]: sorted,
        versions
      } as ConvertedLockData;
    }

    return valid && (locked as ConvertedLockData);
  }

  /**
   * Set the package.json's dependencies items and check if they changed from
   * lock data.
   *
   * - dependencies
   * - optionalDependencies
   * - devDependencies
   * @param pkgDepItems - dep items generated by makePkgDepItems in pkg-dep-resolver.js
   * @param reset - whether to reset even if already set
   */
  setPkgDepItems(pkgDepItems: LockPkgDepItems, reset = false): void {
    if (this._$pkg && !reset) {
      return;
    }

    const { dep, dev, opt } = pkgDepItems;
    const items: { dep?: Record<string, string>; dev?: Record<string, string>; opt?: Record<string, string> } = {};
    const makeDep = (acc: Record<string, string>, di: LockDepItem): Record<string, string> => {
      acc[di.name] = di._semver!.$;
      return acc;
    };

    // check if pkg deps changed from lock
    const diffDep = (lock: Record<string, string>, update: Record<string, string>): Record<string, string> => {
      const diff: Record<string, string> = {};
      // items that are new or changed
      for (const name in update) {
        if (!lock[name] || lock[name] !== update[name]) {
          diff[name] = update[name];
        }
      }
      // items that are removed in new deps
      for (const name in lock) {
        if (!update[name]) {
          diff[name] = "-";
        }
      }
      return diff;
    };

    const $lockPkg = this._lockData.$pkg || {};
    const $pkgDiff: { dep: Record<string, string>; dev: Record<string, string>; opt: Record<string, string> } = {
      dep: {},
      dev: {},
      opt: {}
    };

    if (dep) {
      items.dep = dep.reduce(makeDep, {});
    }
    $pkgDiff.dep = diffDep(($lockPkg.dep as unknown as Record<string, string>) || {}, items.dep || {});

    if (dev) {
      items.dev = dev.reduce(makeDep, {});
    }
    $pkgDiff.dev = diffDep(($lockPkg.dev as unknown as Record<string, string>) || {}, items.dev || {});

    if (opt) {
      items.opt = opt.reduce(makeDep, {});
    }
    $pkgDiff.opt = diffDep(($lockPkg.opt as unknown as Record<string, string>) || {}, items.opt || {});

    this._$pkg = items as LockPkgDepItems;
    this._$pkgDiff = $pkgDiff;

    // set diff only if existing lock data has the $pkg info
    if (this._lockData.$pkg) {
      this._$allPkgDiff = { ...$pkgDiff.dep, ...$pkgDiff.opt, ...$pkgDiff.dev };
    } else {
      this._$allPkgDiff = {};
    }

    if (!_.isEmpty(this._$allPkgDiff)) {
      logger.info("your dependencies changed for these packages:", this._$allPkgDiff);
    }
  }

  get pkgDepChanged(): boolean {
    return !_.isEmpty(this._$allPkgDiff);
  }

  /**
   * Remove the lock data for a specific dep item
   *
   * @param item - item to remove
   * @param force - force removal
   */
  remove(item: LockDepItem, force = false): void {
    if (!this._enable) return;

    const locked = this._lockData[item.name] as PkgLockData | ConvertedLockData | undefined;
    if (!locked || (!this._$allPkgDiff[item.name] && !force)) {
      return;
    }

    const pkgLocked = locked as PkgLockData;
    if (pkgLocked._) {
      // in serialized format
      Object.keys(pkgLocked._).forEach(k => {
        const lockedVers = ([] as string[]).concat(pkgLocked._![k] as string | string[]);
        if (lockedVers.includes(item.resolved!)) {
          logger.debug("removing version lock info for", item.name, item.resolved, item.semver, k);
          const newLocked = lockedVers.filter(x => x !== item.resolved);
          if (newLocked.length > 0) {
            pkgLocked._![k] = newLocked;
          } else {
            delete pkgLocked._![k];
          }
        }
      });
    }

    const convertedLocked = locked as ConvertedLockData;
    if (convertedLocked[LOCK_RSEMVERS]) {
      // in run time format
      const lockRsv = convertedLocked[LOCK_RSEMVERS]!;
      for (const sv in lockRsv) {
        if (lockRsv[sv] === item.resolved) {
          delete lockRsv[sv];
        }
      }
      const sorted = convertedLocked[LOCK_SORTED_VERSIONS];
      if (sorted) {
        _.remove(sorted, x => x === item.resolved);
      }
    }
  }

  shasum(data: string): string {
    return crypto
      .createHash("sha1")
      .update(data)
      .digest("hex");
  }

  /**
   * Convert all local packages paths relative to from
   */
  _relativeLocalPath(from: string, lockData: LockData): void {
    _.each(lockData, (pkg: PkgLockData | undefined, pkgName: string) => {
      if (!pkg || pkgName.startsWith("$")) return;
      let copied = false;
      Object.keys(pkg).forEach((version: string) => {
        if (version.startsWith("_")) return;
        const vpkg = pkg[version] as LockVersionMeta;
        if (vpkg && vpkg.$ === "local" && vpkg._ && Path.isAbsolute(vpkg._)) {
          if (!copied) lockData[pkgName] = pkg = Object.assign({}, pkg);
          copied = true;
          let relPath = Path.relative(from, vpkg._);
          if (!relPath.startsWith(".")) {
            relPath = `.${Path.sep}${relPath}`;
          }
          pkg[version] = Object.assign({}, vpkg, {
            _: relPath.replace(/\\/g, "/")
          });
        }
      });
    });
  }

  /**
   * Convert all local packages paths to under base
   */
  _fullLocalPath(base: string, lockData?: LockData): void {
    _.each(lockData || this._lockData, (pkg: PkgLockData | undefined, pkgName: string) => {
      if (!pkg || pkgName.startsWith("$")) return;
      _.each(pkg, (vpkg: LockVersionMeta | undefined, key: string) => {
        if (key === "_" || key.startsWith("_")) return;
        if (vpkg && vpkg.$ === "local" && vpkg._ && !Path.isAbsolute(vpkg._)) {
          vpkg._ = Path.join(base, vpkg._);
        }
      });
    });
  }

  /**
   * Save lock file
   */
  save(filename: string): void {
    if (!this._enable) {
      return;
    }

    let resolvedFilename = filename;
    if (!Path.isAbsolute(resolvedFilename)) {
      resolvedFilename = Path.resolve(resolvedFilename);
    }

    if (!this._lockOnly) {
      assert(this._isFynFormat, "can't save lock data that's no longer in fyn format");
      const basedir = Path.dirname(resolvedFilename);
      // sort by package names
      this._lockData.$fyn = this._config;
      const sortData = sortObjKeys(this._lockData);
      this._relativeLocalPath(basedir, sortData);
      const data = Yaml.stringify(sortData, 4, 1);
      const shaSum = this.shasum(data);
      if (shaSum !== this._shaSum) {
        logger.info("saving lock file", resolvedFilename);
        Fs.writeFileSync(resolvedFilename, data);
      } else {
        logger.verbose("lock data didn't change");
      }
    }
  }

  /**
   * Read lock file
   */
  async read(filename: string): Promise<boolean> {
    if (!this._enable) {
      return false;
    }

    try {
      let resolvedFilename = filename;
      if (!Path.isAbsolute(resolvedFilename)) resolvedFilename = Path.resolve(resolvedFilename);
      const data = (await Fs.readFile(resolvedFilename)).toString();
      this._shaSum = this.shasum(data);
      this._lockData = Yaml.parse(data);

      const basedir = Path.dirname(resolvedFilename);

      this._fullLocalPath(basedir);

      Object.assign(this._config, this._lockData.$fyn || {});

      logger.verbose(chalk.green(`loaded lockfile ${basedir}`));

      return true;
    } catch (err) {
      if (this._lockOnly) {
        logger.error(`failed to load lockfile ${filename} -`, (err as Error).message);
        logger.error("Can't proceed without lockfile in lock-only mode");
        fyntil.exit(err);
      } else {
        // Track shown messages to avoid duplicates
        const msgKey = `lockfile:${filename}`;
        if (!this._fyn._shownMissingFiles.has(msgKey)) {
          this._fyn._shownMissingFiles.add(msgKey);
          logger.debug(`failed to load lockfile ${filename} -`, (err as Error).message);
        }
      }
      this._shaSum = Date.now();
      this._lockData = {};
    }

    return false;
  }

  setConfig(key: string, value: unknown): void {
    if (value === undefined) {
      delete this._config[key];
    } else {
      this._config[key] = value;
    }
  }

  getConfig(key: string): unknown {
    return this._config[key];
  }
}

export default PkgDepLocker;