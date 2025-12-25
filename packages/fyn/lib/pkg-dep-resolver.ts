/* eslint-disable no-magic-numbers, max-params, max-statements, complexity, no-param-reassign */

import _ from "lodash";
import Fs from "./util/file-ops";
import Path from "path";
import * as semverUtil from "./util/semver";
import Semver from "semver";
import chalk from "chalk";
import logger from "./logger";
import DepItem from "./dep-item";
import PromiseQueue from "./util/promise-queue";
import logFormat from "./util/log-format";
import { LONG_WAIT_META } from "./log-items";
import fyntil from "./util/fyntil";
import { getDepSection, makeDepStep } from "@fynpo/base";
import xaa from "./util/xaa";
import { AggregateError } from "@jchip/error";
import Promise from "aveazul";
import {
  SEMVER,
  RSEMVERS,
  LOCK_RSEMVERS,
  SORTED_VERSIONS,
  LATEST_SORTED_VERSIONS,
  LATEST_VERSION_TIME,
  LOCK_SORTED_VERSIONS,
  LATEST_TAG_VERSION,
  LOCAL_VERSION_MAPS,
  RESOLVE_ORDER,
  PACKAGE_RAW_INFO,
  DEP_ITEM
} from "./types";
import type { DepData, PkgVersion } from "./dep-data";
import type {
  SemverAnalysis,
  PackageDist,
  PackageVersionMeta,
  PackageMeta,
  KnownPackage,
  PkgVersionInfo,
  ResolutionData,
  PackageJson
} from "./types";

/** Depth info item for a package at a specific depth */
interface DepthInfoItem {
  items: DepItem[];
  versions?: string[];
  depItems?: PkgDepItems[];
}

/** Depth resolving data for a specific depth level */
interface DepthData {
  [pkgName: string]: DepthInfoItem;
}

/** Depth resolving state tracking */
interface DepthResolving {
  current?: number;
  [depth: number]: DepthData;
}

/** Result of makePkgDepItems */
interface PkgDepItems {
  name: string;
  dep?: DepItem[];
  dev?: DepItem[];
  opt?: DepItem[];
  devOpt?: DepItem[];
}

/** Package.json with raw info symbol for resolver */
interface ResolverPackageJson extends PackageJson {
  [PACKAGE_RAW_INFO]?: { dir: string; str: string };
}

/** Minimal interface for dependency extraction - used by makePkgDepItems */
type DependencySource = ResolverPackageJson | PackageVersionMeta;

/** Fynpo package graph interface */
interface FynpoGraph {
  packages: {
    byPath: Record<string, FynpoPackage>;
    byName: Record<string, FynpoPackage[]>;
  };
  getPackageByName(name: string): FynpoPackage | undefined;
  getPackageAtDir(dir: string): FynpoPackage | undefined;
  resolvePackage(name: string, semver: string, strict: boolean): FynpoPackage | undefined;
  addDep(
    fromPkg: FynpoPackage,
    toPkg: FynpoPackage,
    section: string,
    steps: unknown[]
  ): boolean;
}

/** Fynpo package info */
interface FynpoPackage {
  name: string;
  version: string;
  path: string;
}

/** Fynpo configuration and data */
interface FynpoData {
  config?: {
    localDepAutoSemver?: "patch" | "minor" | "major";
    [key: string]: unknown;
  };
  dir: string;
  graph: FynpoGraph;
  indirects: unknown[];
}

/** Fyn instance interface for dependency resolver */
interface FynInstance {
  concurrency: number;
  production: boolean;
  deepResolve?: boolean;
  lockOnly: boolean;
  fynlocal: boolean;
  isFynpo: boolean;
  preferLock: boolean;
  alwaysFetchDist?: boolean;
  refreshOptionals?: boolean;
  lockTime?: Date;
  cwd: string;
  _fynpo?: FynpoData;
  _pkg: PackageJson;
  _pkgSrcMgr: PkgSrcManager;
  _depLocker: PkgDepLocker;
  _distFetcher: PkgDistFetcher;
  _shownMissingFiles: Set<string>;
  _resolutions?: Record<string, string>;
  _resolutionsMatchers?: ResolutionMatcher[];
  _overridesMatchers?: OverrideMatcher[];
  depLocker: PkgDepLocker;
  checkNoFynLocal(name: string): boolean;
  isTopLevelFynpoInstall(): boolean;
  createLocalPkgBuilder(localsByDepth: DepItem[][]): LocalPkgBuilder;
}

/** Package source manager interface */
interface PkgSrcManager {
  hasMeta(item: DepItem): boolean;
  fetchMeta(item: DepItem): Promise<PackageMeta>;
  fetchLocalItem(item: DepItem): Promise<PackageMeta | undefined>;
  getLocalPackageMeta(item: DepItem, version: string): PackageMeta | undefined;
  getAllLocalMetaOfPackage(name: string): Record<string, PackageMeta> | undefined;
}

/** Package dependency locker interface */
interface PkgDepLocker {
  hasLock(item: DepItem): boolean;
  convert(item: DepItem): PackageMeta | undefined;
  update(item: DepItem, meta: PackageMeta): PackageMeta;
  remove(item: DepItem): void;
  setPkgDepItems(items: PkgDepItems): void;
}

/** Package distribution fetcher interface */
interface PkgDistFetcher {
  putPkgInNodeModules(pkg: PkgVersionInfo, force: boolean): Promise<void>;
}

/** Local package builder interface */
interface LocalPkgBuilder {
  start(): void;
}

/** Resolution matcher from minimatch */
interface ResolutionMatcher {
  mm: { match(path: string): boolean };
  res: string;
}

/** Override matcher for npm-style overrides */
interface OverrideMatcher {
  pkgName: string;
  versionConstraint: string | null;
  parentPath: string;
  replacement: string;
}

/** Options passed to PkgOptResolver */
interface PkgOptResolver {
  isEmpty(): boolean;
  resolve(): void;
  isPending(): boolean;
  add(data: { item: DepItem; meta: PackageMeta; err?: Error }): void;
  _depResolver: PkgDepResolver;
}

/** Yarn lock parsed data */
interface YarnLockData {
  [key: string]: {
    version: string;
    resolved?: string;
    integrity?: string;
    dependencies?: Record<string, string>;
  };
}

/** Constructor options for PkgDepResolver */
interface PkgDepResolverOptions {
  fyn: FynInstance;
  data: DepData;
  optResolver: PkgOptResolver;
  shrinkwrap?: Record<string, unknown>;
  buildLocal?: boolean;
  deDuping?: boolean;
  yarnLock?: YarnLockData;
}

/** Queue depth item */
interface QueueDepthItem {
  queueDepth: boolean;
  depth: number;
}

/** Promise item for queue */
interface PromiseItem {
  promise: Promise<unknown> | null;
}

/** Resolve result with meta and resolved version */
interface ResolveResult {
  meta: PackageMeta;
  resolved: string;
}

const simpleSemverCompare = semverUtil.simpleCompare;
const { checkPkgOsCpu, relativePath, unSlashNpmScope } = fyntil;

const failMetaMsg = name =>
  `Unable to retrieve meta for package ${name} - If you've updated its version recently, try to run fyn with '--refresh-meta' again`;

/*
 * Package dependencies resolver
 *
 * - 1. From top level package.json, add all dependencies to list
 * - 2. Take each package, retrieve their meta data
 * - 3. Match semver to the best version
 * - 4. Fetch package.json for the matched version
 * - 5. Add dependencies and optionalDependencies to list
 * - 6. Back to step 2 until all packages are processed in list
 *
 * Basically doing level order traversal on the dependency tree using an
 * async queue.
 */

class PkgDepResolver {
  private _options: PkgDepResolverOptions;
  private _fyn: FynInstance;
  private _pkgSrcMgr: PkgSrcManager;
  private _data: DepData;
  private _promiseQ: PromiseQueue;
  private _defer: { promise: Promise<void>; resolve: () => void; reject: (err: Error) => void };
  private _optResolver: PkgOptResolver;
  private _lockOnly: boolean;
  private _depthResolving: DepthResolving | undefined;
  private _localsByDepth?: DepItem[][];
  private _buildLocal?: LocalPkgBuilder;

  constructor(pkg: PackageJson, options: PkgDepResolverOptions) {
    this._options = Object.assign({}, options);
    // The master object
    this._fyn = this._options.fyn;
    // Package source data manager
    this._pkgSrcMgr = this._fyn._pkgSrcMgr;
    // Dependencies data
    this._data = options.data;
    // Promise Queue to process all dependencies in list
    this._promiseQ = new PromiseQueue({
      concurrency: Math.max(this._fyn.concurrency * 2, 15),
      stopOnError: true,
      processItem: (x: string | QueueDepthItem | PromiseItem) => this.processItem(x)
    });
    this._defer = Promise.defer();
    this._promiseQ.on("done", (x: { totalTime: number }) => {
      return this.done(x);
    });
    this._promiseQ.on("pause", (x: unknown) => this.onPause(x));
    this._promiseQ.on("fail", (data: { error: Error }) => {
      return this._defer.reject(data.error);
    });
    // this._optResolver = new PkgOptResolver({ fyn: this._fyn, depResolver: this });
    this._optResolver = options.optResolver;
    this._optResolver._depResolver = this;
    this._promiseQ.on("empty", () => this.checkOptResolver());
    this._lockOnly = this._fyn.lockOnly;
    //
    // We have to resolve each package in the order they were seen
    // through the dep tree because in case an earlier resolved version
    // satisfies a later semver.
    //
    // We also need to make sure each depth has to resolve completely before
    // dependencies in the next depth level can be resolved.
    //
    // In the _depthResolving object, each depth level # is used as a key to an
    // object with info about the status of resolving that level.
    //
    // - contains package name to array of DepItem seen in order.
    // - When ready to resolve a depth, all names are queued for processing.
    //
    this._depthResolving = { 0: {} };
    const topDepItems = this.makePkgDepItems(
      pkg,
      new DepItem({
        name: "~package.json",
        semver: "-",
        src: "",
        dsrc: "pkg",
        resolved: "~",
        shrinkwrap: options.shrinkwrap,
        // set to zero to que children to take their priorities from their position
        priority: 0
      }),
      !this._fyn.production
    );
    this.addPkgDepItems(topDepItems);
    this._fyn._depLocker.setPkgDepItems(topDepItems);
    this.queueDepth(0);
  }

  start(): void {
    this._promiseQ.resume();
  }

  wait(): Promise<void> {
    return this._defer.promise;
  }

  checkOptResolver(): boolean {
    if (!this._optResolver.isEmpty()) {
      this._optResolver.resolve();
      return true;
    }
    return false;
  }

  //
  // any package that only has a single version is promoted to top level for flattening
  // promote priority by src: dep, opt, dev
  //
  // TODO: support options:
  // - Promote the latest version
  // - Promote the version with the most requests
  // - Promote the earliest version
  // - Allow explicit config to specify what version/semver to promote
  //
  promotePackages(): void {
    let version: string;

    const pkgsData = this._data.getPkgsData() as Record<string, KnownPackage>;
    const names = Object.keys(pkgsData);

    names.forEach(name => {
      const pkg = pkgsData[name];
      const versions = Object.keys(pkg.versions);
      // there's only one version, auto promote
      if (versions.length === 1) {
        version = versions[0];
      } else if (!(version = _.find(versions, v => pkg.versions[v]?.top) as string)) {
        // default to promote first seen version
        version = pkg[RESOLVE_ORDER][0];
        // but promote the version with the highest priority
        versions.forEach(x => {
          const pkgX = pkg.versions[x];
          const pkgV = pkg.versions[version];
          if (pkgX?.priority > pkgV?.priority) {
            version = x;
          }
        });
      }
      const pkgV = pkg.versions[version]!;
      pkgV.promoted = true;
    });
  }

  onPause(_data: unknown): void {
    // logger.info("onPause");
    // if optional resolver kicked off, then it will resume dep resolver
    // when it's done.
    if (!this.checkOptResolver()) {
      this._promiseQ.resume();
    }
  }

  done(data: { totalTime: number }): void {
    if (!this.checkOptResolver() && this._promiseQ.isPause) {
      this._promiseQ.resume();
    } else if (!this._optResolver.isPending()) {
      logger.removeItem(LONG_WAIT_META);
      const time = logFormat.time(data.totalTime);
      logger.info(`${chalk.green("done resolving dependencies")} ${time}`);
      this._data.sortPackagesByKeys();
      this.promotePackages();
      this._depthResolving = undefined;
      this._defer.resolve();
    }
  }

  resolvePkgPeerDep(
    json: PackageVersionMeta,
    pkgId: string,
    depInfo: PkgVersionInfo
  ): void {
    const peerDepMeta = json.peerDependenciesMeta || {};
    _.each(json.peerDependencies || (json as Record<string, unknown>).peerDepenencies as Record<string, string>, (semver: string, name: string) => {
      const peerId = chalk.cyan(`${name}@${semver}`);
      const resolved = this.resolvePackage({
        item: { name, semver } as DepItem,
        meta: { versions: {} } as PackageMeta
      });
      if (!resolved) {
        // Skip warning if peer dependency is marked as optional in peerDependenciesMeta
        const isOptional = peerDepMeta[name] && peerDepMeta[name].optional;
        if (!isOptional) {
          logger.warn(
            chalk.yellow("Warning:"),
            `peer dependencies ${peerId} of ${pkgId} ${chalk.red("is missing")}`
          );
        }
      } else {
        logger.debug(
          `peer dependencies ${peerId} of ${pkgId}`,
          `${chalk.green("resolved to")} ${resolved}`
        );
        _.set(depInfo, ["res", "per", name], { resolved });
      }
    });
  }

  resolvePeerDep(depInfo: PkgVersionInfo): void {
    const json = depInfo.json;
    if (!json) return undefined;
    const pkgId = logFormat.pkgId(depInfo);
    return this.resolvePkgPeerDep(json, pkgId, depInfo);
  }

  queueDepth(depth: number): void {
    if (depth > 1) {
      const parentDepth = this._depthResolving![depth - 1];
      // add all packages' dependencies according to their appearing order
      // that's in the parent's dependency lists, therefore guaranteeing
      // a consistent resolving order
      Object.keys(parentDepth).forEach(x => {
        const depthInfo = parentDepth[x];
        if (depthInfo.versions) {
          depthInfo.versions.forEach(version => this._data.addResolved({ name: x, version }));
        }
        if (depthInfo.depItems) {
          depthInfo.depItems.forEach(x2 => this.addPkgDepItems(x2));
          depthInfo.depItems = undefined;
        }
      });
    }

    const depthInfo = this._depthResolving![depth];
    if (!depthInfo) {
      // all dependencies resolved, start local package build if there are any
      if (!this._buildLocal && this._options.buildLocal && !_.isEmpty(this._localsByDepth)) {
        this._buildLocal = this._fyn.createLocalPkgBuilder(this._localsByDepth!);
        this._buildLocal.start();
      }
      return;
    }
    this._depthResolving!.current = depth;

    const depthPkgs = Object.keys(depthInfo);

    // TODO: create test scenario for build-local
    if (this._options.buildLocal) {
      const locals = depthPkgs
        .map(x => depthInfo[x].items.find(it => it.localType))
        .filter(x => {
          // if fynpo top level depends on a local package that's part of the monorepo, then
          // we should not try to build the package while installing top level modules, because
          // building a local package would likely require build tools that are typically
          // installed as part of the top level packages
          if (x && this._fyn.isTopLevelFynpoInstall()) {
            const t1 = this._fyn._fynpo!.graph.getPackageAtDir(Path.normalize(x.semverPath!));
            if (t1) {
              logger.info(
                "installing fynpo top level modules - skip build local for package at",
                x.semverPath
              );
              return false;
            }
          }
          return x;
        }) as DepItem[];

      // logger.info("adding depth pkgs", depthPkgs.join(", "), locals);

      if (locals.length > 0) {
        if (!this._localsByDepth) {
          this._localsByDepth = [];
        }
        this._localsByDepth.push(locals);
      }
    }

    depthPkgs.forEach(x => this._promiseQ.addItem(x, true));

    // depth 1 is the dependencies from app's package.json
    if (depth === 1) {
      // check if any dep item changed from lock and remove them in lock data
      // TODO: should this be done for every depth?
      for (const name in depthInfo) {
        depthInfo[name].items.forEach(di => this._fyn._depLocker.remove(di));
      }
    }
    this._promiseQ.addItem(PromiseQueue.pauseItem, true);
    this._promiseQ.addItem({ queueDepth: true, depth: depth + 1 }, true);
    // depthInfo.names = {};
  }

  prefetchMeta(item: DepItem): void {
    // fire-and-forget to retrieve meta
    // if it's not local, doesn't have meta yet, and doesn't have lock data
    if (!item.semverPath && !this._pkgSrcMgr.hasMeta(item) && !this._fyn.depLocker.hasLock(item)) {
      this._pkgSrcMgr.fetchMeta(item).catch((err: Error) => {
        logger.warn(`failed prefetch meta for ${item.name}@${item.semver}`, err.message);
      });
    }
  }

  addDepResolving(deps: DepItem[]): void {
    deps.forEach(depItem => {
      const name = depItem.name;
      const depthData = this._depthResolving![depItem.depth];
      if (!depthData) {
        this._depthResolving![depItem.depth] = {
          [name]: { items: [depItem] }
        };
      } else if (!depthData[name]) {
        depthData[name] = { items: [depItem] };
      } else {
        //
        // ??? When can a dep pkg can have more than one resolving data item?
        //
        depthData[name].items.push(depItem);
      }
    });
  }

  addPkgDepItems(data: PkgDepItems): void {
    if (data.dep) {
      this.addDepResolving(data.dep);
    }
    if (data.dev) {
      this.addDepResolving(data.dev);
    }
    let opt = false;
    if (data.opt) {
      this.addDepResolving(data.opt);
      opt = true;
    }
    if (data.devOpt) {
      this.addDepResolving(data.devOpt);
      opt = true;
    }
    if (opt) {
      this._promiseQ.addItem(PromiseQueue.pauseItem, true);
    }
  }

  getAutoSemver(semver: string): string {
    const autoSemver = _.get(this._fyn._fynpo, "config.localDepAutoSemver") as
      | "patch"
      | "minor"
      | "major"
      | undefined;
    if (autoSemver) {
      const parsedSv = Semver.coerce(semver);
      if (parsedSv && parsedSv.raw) {
        switch (autoSemver) {
          case "patch":
            semver = `~${parsedSv.raw}`;
            break;
          case "minor":
            semver = `^${parsedSv.raw}`;
            break;
          case "major":
            semver = "*";
            break;
        }
      }
    }

    return semver;
  }

  /**
   * create the dep relation items for a package
   *
   * @param pkg - the package
   * @param depItem - the dep relation item for the package, this serves as the parent
   *                  of all the new dep items created
   * @param dev - whether to include dev dependencies
   * @param noPrefetch - whether to skip prefetching meta
   * @param deepResolve - whether to deep resolve
   * @returns PkgDepItems with dependency arrays
   */
  makePkgDepItems(
    pkg: DependencySource,
    depItem: DepItem,
    dev?: boolean,
    noPrefetch?: boolean,
    deepResolve?: boolean
  ): PkgDepItems {
    const bundled = pkg.bundleDependencies;

    const depPriorities = {
      devopt: 100000000,
      dev: 200000000,
      opt: 800000000,
      dep: 900000000
    };

    const makeDepItems = (deps: Record<string, string>, dsrc: string): DepItem[] => {
      const items: DepItem[] = [];
      const src = depItem.src || dsrc;
      const depNames = Object.keys(deps);
      for (let idx = 0; idx < depNames.length; idx++) {
        const name = depNames[idx];
        if (!_.includes(bundled, name)) {
          const opt = {
            name,
            priority: depItem.priority || depPriorities[dsrc as keyof typeof depPriorities] - idx,
            semver: deps[name],
            src,
            dsrc,
            deepResolve
          };
          const newItem = new DepItem(opt, depItem);

          if (noPrefetch !== true) this.prefetchMeta(newItem);
          items.push(newItem);
          // this._promiseQ.addItem(name, true);
        }
      }
      return items;
    };

    //
    // remove optional dependencies from dependencies
    //
    const filterOptional = (
      deps: Record<string, string>,
      optDep: Record<string, string> | undefined | false
    ): Record<string, string> => {
      if (_.isEmpty(optDep)) return deps;
      _.each(optDep, (v, n) => {
        if (deps[n]) {
          (optDep as Record<string, string>)[n] = deps[n]; // take semver from deps
          delete deps[n]; // and keep it as optional
        }
      });
      return deps;
    };

    const findFynpoPkgOfDep = (di: DepItem, steps: unknown[]): FynpoPackage | false => {
      const fynpoPath = di.fullPath
        ? Path.relative(this._fyn._fynpo!.dir, di.fullPath)
        : Path.relative(this._fyn._fynpo!.dir, this._fyn.cwd);
      const fynpoPkg = this._fyn._fynpo!.graph.packages.byPath[fynpoPath];
      if (fynpoPkg) {
        steps.push(makeDepStep(fynpoPkg.name, fynpoPkg.version, di.dsrc));
        return fynpoPkg;
      }
      if (di.parent) {
        // Note: di.version may be undefined at this point, makeDepStep handles that
        steps.push(makeDepStep(di.name, di.version || "", di.dsrc));
        return findFynpoPkgOfDep(di.parent, steps);
      }
      return false;
    };

    const joinFynDep = (depSec: string): Record<string, string> | false | undefined => {
      if (!this._fyn.fynlocal) return pkg[depSec] as Record<string, string> | undefined;

      const deps: Record<string, string> = Object.assign({}, pkg[depSec] as Record<string, string>);

      const fynDeps: Record<string, string> = _.get(pkg, ["fyn", depSec], {});
      let fromDir: string | undefined = pkg[PACKAGE_RAW_INFO] && pkg[PACKAGE_RAW_INFO].dir;

      // if in fynpo mode, gather deps that are actually local packages in the monorepo
      if (this._fyn.isFynpo) {
        const locals: FynpoPackage[] = [];
        const fynpo = this._fyn._fynpo!;
        if (!fromDir) {
          // this case means a downstream pkg has a dep on a monorepo package
          fromDir = this._fyn.cwd;
        }

        for (const name in deps) {
          if (
            this._fyn.checkNoFynLocal(name) ||
            !fynpo.graph.getPackageByName(name) ||
            semverUtil.checkUrl(deps[name])
          ) {
            continue;
          }

          //
          // Check if there is a fynpo package that match 'name@semver'?
          //
          const semver = this.getAutoSemver(deps[name]);
          const fynpoPkg = fynpo.graph.resolvePackage(name, semver, false);

          if (fynpoPkg) {
            locals.push(fynpoPkg);
            const fullPkgDir = Path.join(fynpo.dir, fynpoPkg.path);
            fynDeps[name] = relativePath(fromDir, fullPkgDir, true);
          } else {
            const msgKey = `nomatch:${name}@${semver}`;
            if (!this._fyn._shownMissingFiles.has(msgKey)) {
              this._fyn._shownMissingFiles.add(msgKey);
              const dispName = logFormat.pkgId(name);
              const versions = fynpo.graph.packages.byName[name].map(x => x.version).join(", ");
              logger.info(
                `You have local copy of ${dispName}, but no version matching semver ${semver}. Versions available: ${versions}`
              );
            }
          }
        }
        if (locals.length > 0 && !this._options.deDuping) {
          const revSteps: unknown[] = [];
          const fynpoPkg = findFynpoPkgOfDep(depItem, revSteps);
          if (fynpoPkg) {
            const steps = revSteps.reverse();
            locals.forEach(x => {
              const sec = getDepSection(depSec);
              if (fynpo.graph.addDep(fynpoPkg, x, sec, steps)) {
                fynpo.indirects.push({
                  fromPkg: _.pick(fynpoPkg, ["name", "version", "path"]),
                  onPkg: _.pick(x, ["name", "version", "path"]),
                  depSection: sec,
                  indirectSteps: steps
                });
              }
            });
          }
          const names = locals.map(x => x.name).join(", ");
          const msgKey = `localcopies:${pkg.name}:${depSec}:${names}`;
          if (!this._fyn._shownMissingFiles.has(msgKey)) {
            this._fyn._shownMissingFiles.add(msgKey);
            logger.info(
              `Using local copies from your monorepo for these packages in ${pkg.name}'s ${depSec}: ${names}`
            );
          }
        }
      }

      for (const name in fynDeps) {
        if (!fromDir) continue;
        const ownerName = chalk.magenta(depItem.name);
        const dispName = chalk.green(name);
        if (this._fyn.checkNoFynLocal(name)) {
          logger.info(`fyn local disabled for ${dispName} of ${ownerName}`);
          continue;
        }
        if (!deps[name]) {
          logger.warn(`You ONLY defined ${name} in fyn.${depSec}!`);
        }
        const dispSec = chalk.cyan(`fyn.${depSec}`);
        const dispSemver = chalk.blue(fynDeps[name]);
        try {
          Fs.statSync(Path.join(fromDir, fynDeps[name]));
          deps[name] = fynDeps[name];
          if (!this._options.deDuping) {
            logger.verbose(`${dispSec} ${dispName} of ${ownerName} will use`, dispSemver);
          }
        } catch (err: unknown) {
          const error = err as NodeJS.ErrnoException;
          logger.warn(
            `${dispSec} ${dispName} of ${ownerName} not found`,
            chalk.red(error.message),
            "pkg local dir",
            chalk.blue(fromDir),
            "dep name",
            dispSemver
          );
          if (error.code !== "ENOENT") {
            logger.error("checking local package failed", error.stack);
          }
        }
      }

      return !_.isEmpty(deps) && deps;
    };

    const dependencies = joinFynDep("dependencies");
    const devDep = dev && joinFynDep("devDependencies");
    const optDep = joinFynDep("optionalDependencies");
    const devOptDep = dev && joinFynDep("devOptDependencies");

    return {
      name: pkg.name,
      dep: dependencies && makeDepItems(filterOptional(dependencies, optDep), "dep"),
      dev: devDep && makeDepItems(devDep, "dev"),
      opt: optDep && makeDepItems(optDep, "opt"),
      devOpt: devOptDep && makeDepItems(devOptDep, "devopt")
    };
  }

  findVersionFromDistTag(meta: PackageMeta, semver: string): string | undefined {
    if (Semver.validRange(semver) === null) {
      const lockRsv = meta[LOCK_RSEMVERS];
      if (lockRsv && lockRsv[semver]) {
        return lockRsv[semver];
      }

      const dtags = meta["dist-tags"];
      if (dtags && dtags.hasOwnProperty(semver)) {
        return dtags[semver];
      }
    }
    return undefined;
  }

  _shouldDeepResolve(pkgDepInfo: PkgVersionInfo): boolean {
    // even if an item has a resolved pkg, we need to make sure the pkg is resolved
    // by more than optionals, since optionals could potentially be removed later.
    return Boolean(this._fyn.deepResolve || !pkgDepInfo._hasNonOpt);
  }

  /* eslint-disable max-statements, complexity */

  async addPackageResolution(
    item: DepItem,
    meta: PackageMeta,
    resolved: string
  ): Promise<null> {
    let firstKnown = true;
    item.resolve(resolved, meta);

    const pkgsData = this._data.getPkgsData(item.optFailed) as Record<string, KnownPackage>;
    let pkgV: PkgVersionInfo | undefined; // specific version of the known package
    let kpkg = pkgsData[item.name]; // known package

    if (kpkg) {
      kpkg[RESOLVE_ORDER].push(resolved);
      pkgV = kpkg.versions[resolved];

      firstKnown = this.addKnownRSemver(kpkg, item, resolved);
      const dr = this._fyn.deepResolve || item.deepResolve;

      // If doing deep resolve and package is already seen, then check parents
      // to make sure it's not one of them because that would be a circular dependencies
      const optChecked = item.optChecked;
      if (dr && pkgV && !optChecked && item.isCircular()) {
        // logger.log("circular dep detected", item.name, item.resolved);
        item.unref();
        return null;
      }
    }

    const metaJson = meta.versions[resolved];

    const platformCheck = (): string | true => {
      const sysCheck = checkPkgOsCpu(metaJson);
      if (sysCheck !== true) {
        return `package ${logFormat.pkgId(item)} platform check failed: ${sysCheck}`;
      }
      return true;
    };
    //
    // specified as optionalDependencies
    // add to opt resolver to resolve later
    //
    // Adding an optional package that failed:
    //
    // If a package from optional dependencies failed, then it won't be
    // installed, but we should remember it in lock file so we won't try
    // to download its tarball again to test.
    //
    // Optional checks may involve running a package's npm script.
    // - that should occur without blocking the dep resolution process
    // - but need to queue them up so when dep resolve queue is drained, need to
    //   wait for them to complete, and then resolve the next dep tree level
    //
    if (item.dsrc && item.dsrc.includes("opt") && !item.optChecked) {
      const sysCheck = platformCheck();

      if (sysCheck !== true) {
        logger.verbose(`optional dependencies ${sysCheck}`);
      } else {
        logger.verbose("adding package to opt check:", item.name, item.semver, item.resolved);

        this._optResolver.add({ item, meta });
      }

      return null;
    }

    const sysCheck = platformCheck();
    if (sysCheck !== true) {
      logger.error(sysCheck);
      throw new Error(sysCheck);
    }

    if (!kpkg) {
      kpkg = pkgsData[item.name] = {
        versions: {},
        [LATEST_TAG_VERSION]:
          (meta && meta[LATEST_TAG_VERSION]) || _.get(meta, ["dist-tags", "latest"]),
        [RSEMVERS]: {},
        [RESOLVE_ORDER]: [resolved]
      };

      if (meta[LOCK_RSEMVERS]) kpkg[LOCK_RSEMVERS] = meta[LOCK_RSEMVERS];

      firstKnown = this.addKnownRSemver(kpkg, item, resolved);
    }

    let firstSeenVersion = false;

    if (!pkgV) {
      firstSeenVersion = true;
      const newPkgV: PkgVersionInfo = {
        requests: [],
        src: item.src,
        dsrc: item.dsrc,
        dist: metaJson.dist!,
        name: item.name,
        version: resolved,
        [SEMVER]: item.semver,
        [DEP_ITEM]: item,
        res: {},
        priority: item.priority!
      };
      pkgV = kpkg.versions[resolved] = newPkgV;
      if (meta[LOCK_RSEMVERS]) pkgV.fromLock = true;
      const scripts = metaJson.scripts || {};
      if (metaJson.hasPI || scripts.preinstall || (scripts as Record<string, string>).preInstall) {
        pkgV.hasPI = 1;
      }
      if (metaJson.hasI || scripts.install || scripts.postinstall || (scripts as Record<string, string>).postInstall) {
        pkgV.hasI = 1;
      }
    }

    const localFromMeta = meta.local || metaJson.local;
    if (localFromMeta) {
      if (!item.localType) {
        item.localType = localFromMeta;
      }
      pkgV.local = item.localType;
      item.fullPath = pkgV.dir = pkgV.dist.fullPath;
      pkgV.str = meta.jsonStr;
      pkgV.json = metaJson;
    }

    if (!item.parent!.depth) {
      pkgV.top = true;
    }

    const optFailed = item.optFailed;
    if (item.dsrc && item.dsrc.includes("opt")) {
      pkgV.preInstalled = true;
      if (optFailed) pkgV.optFailed = optFailed;
    }

    // TODO: remove support for local sym linked packages
    if (
      !pkgV.extracted &&
      pkgV.local !== "sym" &&
      (this._fyn.alwaysFetchDist ||
        (metaJson._hasShrinkwrap && !metaJson._shrinkwrap) ||
        metaJson.bundleDependencies ||
        metaJson.bundledDependencies)
    ) {
      if (metaJson._hasShrinkwrap) pkgV._hasShrinkwrap = metaJson._hasShrinkwrap;
      await this._fyn._distFetcher.putPkgInNodeModules(pkgV, true);
      if (metaJson._hasShrinkwrap) await item.loadShrinkwrap(pkgV.extracted);
      if (metaJson.bundleDependencies || metaJson.bundledDependencies) {
        const found = await xaa.try(async () => {
          const stat = await Fs.stat(Path.join(pkgV.extracted, "node_modules"));
          return stat.isDirectory();
        });
        if (!found) {
          delete metaJson.bundleDependencies;
          delete metaJson.bundledDependencies;
        }
      }
    }

    if (!optFailed) {
      if (metaJson.deprecated) pkgV.deprecated = metaJson.deprecated;
      let deepRes = false;
      if (firstSeenVersion || (deepRes = this._shouldDeepResolve(pkgV as PkgVersionInfo))) {
        const pkgDepth = this._depthResolving![item.depth][item.name];
        if (firstSeenVersion) {
          if (!pkgDepth.versions) pkgDepth.versions = [resolved];
          else pkgDepth.versions.push(resolved);
        }
        if (!pkgDepth.depItems) pkgDepth.depItems = [];
        if (deepRes) {
          logger.debug("Auto deep resolving", logFormat.pkgId(item));
        }
        // Alice, do not go down the rabbit hole, it will never end.
        if (!item.isCircular()) {
          pkgDepth.depItems.push(
            this.makePkgDepItems(meta.versions[resolved], item, false, deepRes)
          );
        }
      }
      item.addRequestToPkg(pkgV as PkgVersion, firstSeenVersion);
      item.addResolutionToParent(this._data, firstKnown);
    }

    return null;
  }

  addKnownRSemver(kpkg: KnownPackage, item: DepItem, resolved: string): boolean {
    const lockRsv = kpkg[LOCK_RSEMVERS];
    const rsv = kpkg[RSEMVERS];

    const missingVersion = (res: string | string[] | undefined, version: string): boolean => {
      if (res) {
        return Array.isArray(res) ? res.indexOf(version) < 0 : res !== version;
      }
      return true;
    };

    const firstKnown = _.isEmpty(rsv);
    const semver = item.semver;

    if (missingVersion(rsv[semver], resolved)) {
      // are we updating locked info? => log info
      if (lockRsv && lockRsv[semver] && missingVersion(lockRsv[semver], resolved)) {
        logger.info(
          `locked version ${lockRsv[semver]} for ${logFormat.pkgId(item)}` +
            ` doesn't match resolved version ${resolved} - updating.`
        );
      }

      if (rsv[semver]) {
        if (Array.isArray(rsv[semver])) {
          (rsv[semver] as string[]).push(resolved);
        } else {
          rsv[semver] = [rsv[semver] as string, resolved];
        }
      } else {
        rsv[semver] = resolved;
      }
    }

    return firstKnown;
  }

  resolvePackage({
    item,
    meta,
    noLocal,
    lockOnly
  }: {
    item: DepItem;
    meta: PackageMeta;
    noLocal?: boolean;
    lockOnly?: boolean;
  }): string | false | undefined {
    const latest = meta[LATEST_TAG_VERSION] || _.get(meta, ["dist-tags", "latest"]) as string | undefined;
    let latestSatisfied: boolean | undefined;

    const satisfies = (v: string, sv: string): boolean => {
      if (noLocal && semverUtil.isLocal(v)) return false;
      return semverUtil.satisfies(v, sv);
    };

    const checkLatestSatisfy = (): boolean => {
      if (latestSatisfied === undefined) {
        // since satisfy means resolve must limit to versions to before latest,
        // if latest is not defined, then consider not satisfy to allow resolving
        // with all available versions
        latestSatisfied = latest ? satisfies(latest, item.semver) : false;
      }
      return latestSatisfied;
    };

    const kpkg = this._data.getPkg(item) as KnownPackage | undefined; // known package
    let foundInKnown: boolean | undefined;

    const tryYarnLock = (): string | undefined => {
      // is there yarn lock data that we should use?
      if (this._options.yarnLock) {
        const key = `${item.name}@${item.semver}`;
        const fromYarn = this._options.yarnLock[key];
        if (fromYarn) {
          logger.debug(`Resolved ${key} to ${fromYarn.version} from yarn.lock`);
          return fromYarn.version;
        }
      }

      return undefined;
    };

    // check if the same semver has been resolved before
    const getKnownSemver = (): string | false | undefined => {
      const find = (rsv: Record<string, string | string[]> | undefined): string | false | undefined => {
        let x: string | string[] | undefined = rsv && rsv[item.semver];
        if (!x) return x;
        if (Array.isArray(x)) x = x[0];
        if (noLocal && semverUtil.isLocal(x)) return false;
        return x;
      };

      const resolved =
        (kpkg && (find(kpkg[LOCK_RSEMVERS]) || find(kpkg[RSEMVERS]))) || find(meta[LOCK_RSEMVERS]);

      foundInKnown = Boolean(resolved);
      return resolved;
    };

    const searchKnown = (): string | false => {
      //
      // Search already known versions from top dep
      //
      if (!kpkg) return false;
      const rversions = kpkg[RESOLVE_ORDER];
      let resolved: string | undefined;
      if (rversions.length > 0) {
        resolved = _.find(rversions, v => satisfies(v, item.semver));
      }

      if (resolved) {
        logger.debug("found known version", resolved, "that satisfied", item.name, item.semver);
      }

      foundInKnown = Boolean(resolved);

      return resolved || false;
    };

    const searchMeta = (): string | undefined => {
      //
      // This sorting and semver searching is the most expensive part of the
      // resolve process, so caching them is very important for performance.
      //
      if (!meta[SORTED_VERSIONS]) {
        if (!meta.versions) {
          const msg = `Meta for package ${item.name} doesn't have versions`;
          logger.error(msg);
          throw new Error(msg);
        }

        // sort versions in descending order
        const sorted = Object.keys(meta.versions).sort(simpleSemverCompare);
        // make sure all versions newer than the tagged latest version are not considered
        if (latest && sorted[0] !== latest) {
          if (meta.time && meta.time[latest]) {
            // just need to lock to latest time
            meta[LATEST_VERSION_TIME] = new Date(meta.time[latest]).getTime();
          } else {
            // unfortunately, must filter out all versions newer than latest
            meta[LATEST_SORTED_VERSIONS] = sorted.filter(
              v => !semverUtil.isVersionNewer(v, latest)
            );
          }
        }

        meta[SORTED_VERSIONS] = sorted;
      }

      let lockTime: Date | undefined = this._fyn.lockTime;
      let sortedVersions = meta[SORTED_VERSIONS];

      // can't consider any versions newer or later than latest if it satisfies the semver
      if (checkLatestSatisfy()) {
        if (meta[LATEST_VERSION_TIME] && (!lockTime || lockTime > meta[LATEST_VERSION_TIME])) {
          // lockTime can't be greater than latest time
          lockTime = meta[LATEST_VERSION_TIME];
        } else if (meta[LATEST_SORTED_VERSIONS]) {
          sortedVersions = meta[LATEST_SORTED_VERSIONS];
        }
      }

      const find = (
        versions: string[] | undefined,
        times: Record<string, string>,
        mustUseRealMeta?: boolean
      ): string | undefined => {
        if (!versions) return undefined;
        const countVer = versions.length;

        return _.find(versions, v => {
          if (!satisfies(v, item.semver)) {
            return false;
          }

          if ((!lockTime || !times[v] || countVer < 2) && !mustUseRealMeta) {
            return true;
          }

          if (!times[v]) {
            return false;
          }

          const time = new Date(times[v]);
          if (time > lockTime!) {
            // logger.debug("times", times);
            logger.verbose(
              item.name,
              v,
              "time",
              time.toString(),
              "is newer than lock/latest time",
              lockTime!.toString()
            );
            return false;
          }

          return true;
        });
      };

      // simply use latest if it satisfies, before searching through all versions
      let resolved: string | undefined = (checkLatestSatisfy() && latest) || find(meta[LOCK_SORTED_VERSIONS], {});
      // if not able to resolve from locked data or it's newer than latest which
      // satisfies the semver, then must resolve again with latest info.
      // must resolve with original real meta
      const mustUseRealMeta =
        checkLatestSatisfy() && resolved && semverUtil.isVersionNewer(resolved, latest!);
      if (!resolved || mustUseRealMeta) {
        resolved = find(sortedVersions, meta.time || {}, mustUseRealMeta);
      }

      // logger.log("found meta version", resolved, "that satisfied", item.name, item.semver);

      return resolved;
    };

    const getLocalVersion = (): string | false => {
      if (Object.prototype.hasOwnProperty.call(meta, LOCAL_VERSION_MAPS)) {
        logger.debug(
          `meta LOCAL_VERSION_MAPS for ${item.semver} - ${JSON.stringify(meta[LOCAL_VERSION_MAPS])}`
        );
        return meta[LOCAL_VERSION_MAPS]![item.semver] || false;
      }
      return false;
    };

    const getUrlVersion = (): string | false => {
      if (!meta.urlVersions || !item.urlType) {
        return false;
      }
      const urlVersion = meta.urlVersions[item.semver];
      return (urlVersion && urlVersion.version) || false;
    };

    let resolved =
      (!noLocal && getLocalVersion()) ||
      getUrlVersion() ||
      getKnownSemver() ||
      searchKnown() ||
      tryYarnLock();

    if (!resolved) {
      resolved = this.findVersionFromDistTag(meta, item.semver);
    } else if (
      !foundInKnown &&
      checkLatestSatisfy() &&
      semverUtil.isVersionNewer(resolved, latest)
    ) {
      // version was not resolved by a higher level dep (known)
      // and resolution from local or URL is newer than latest, so can't use it
      resolved = false;
    }

    if (!resolved && meta.versions && !lockOnly) {
      resolved = searchMeta();
    }

    // logger.debug("resolved to", resolved, "for", item.name, item.semver);

    // if resolving according to a meta, then make sure it contains the resolved version
    return meta.versions ? meta.versions[resolved] && resolved : resolved;
  }

  _failUnsatisfySemver(item: DepItem): never {
    throw new Error(
      `Unable to find a version from lock data that satisfied semver ${item.name}@${item.semver}
${item.depPath.join(" > ")}`
    );
  }

  _resolveWithMeta({
    item,
    meta,
    force,
    noLocal,
    lockOnly
  }: {
    item: DepItem;
    meta: PackageMeta;
    force?: boolean;
    noLocal?: boolean;
    lockOnly?: boolean;
  }): ResolveResult | false {
    let resolved: string | false | undefined = item.nestedResolve(item.name, item.semver);

    if (resolved) {
      if (!Object.prototype.hasOwnProperty.call(meta.versions, resolved)) {
        resolved = false;
      }
    } else {
      resolved = this.resolvePackage({ item, meta, noLocal, lockOnly });
    }

    if (!resolved) {
      if (!force) return false;
      this._failUnsatisfySemver(item);
    }

    if (semverUtil.isLocal(resolved)) {
      if (noLocal) {
        // logger.debug("noLocal:", item.name, item.semver, "resolved to local", resolved);
        return false;
      }
      //
      // The item was ealier resolved to a local package, which also satifies
      // the semver currently being searched, so switch to use meta generated
      // for the local package
      //
      if (!meta.local) {
        const x = this._pkgSrcMgr.getLocalPackageMeta(item, resolved);
        if (x) meta = x;
      }
    }

    // this.addPackageResolution(item, meta, resolved);

    return { meta, resolved };
  }

  /**
   * Match a nested dep to user's resolutions data, or nested and direct dep for packages
   * inside a fynpo monorepo.
   *
   * spec: https://github.com/yarnpkg/rfcs/blob/master/implemented/0000-selective-versions-resolutions.md
   *
   * @param item - The dependency item
   * @returns undefined
   */
  _replaceWithResolutionsData(item: DepItem & { _semver: SemverAnalysis }): undefined {
    if (!this._fyn._resolutions || item._semver.$$) {
      return undefined;
    }

    //
    // this item represent a direct dependency
    //
    if (item.depth < 2) {
      //
      // if we have a package within a fynpo monorepo, then we replace its direct
      // dependencies with resolutions data, vs only its nested dependencies
      // according to yarn's resolutions spec, because if local package A pull in
      // another local package B, then B's dependencies would end up being
      // subjected to resolutions data, so for consistency, we check resolutions
      // for all fynpo's local packages' direct dependencies.
      //
      if (!this._fyn.isFynpo) {
        // not a fynpo, avoid checking resolutions for direct dependencies
        return undefined;
      }
    }

    let nameDepPath: string;

    if (this._fyn.isFynpo) {
      nameDepPath = `${this._fyn._pkg.name}/${item.nameDepPath}`;
    } else {
      nameDepPath = item.nameDepPath;
    }

    const unslashed = unSlashNpmScope(nameDepPath);

    const found = this._fyn._resolutionsMatchers!.find(r => r.mm.match(unslashed));

    if (found && found.res && found.res !== "--no-change" && found.res !== item.semver) {
      const { res } = found;
      const msg = `${nameDepPath} changed to ${res} from ${item.semver} by resolutions data`;
      if (item.depth < 2) {
        logger.info(`fynpo: ${msg}`);
      } else {
        logger.debug(msg);
      }
      semverUtil.replace(item._semver, res);
    }

    return undefined;
  }

  /**
   * Apply npm-style overrides to a dependency item
   *
   * npm overrides differ from yarn resolutions:
   * - They apply to ALL instances of a package by default (not path-based)
   * - They can be scoped to specific parent packages
   * - They support version constraints on the source package
   *
   * @param item - The dependency item to check for overrides
   * @returns undefined
   */
  _applyOverrides(item: DepItem & { _semver: SemverAnalysis }): undefined {
    if (!this._fyn._overridesMatchers || item._semver.$$) {
      return undefined;
    }

    const matchers = this._fyn._overridesMatchers;

    for (const matcher of matchers) {
      const { pkgName, versionConstraint, parentPath, replacement } = matcher;

      // Check if package name matches
      if (pkgName !== item.name) {
        continue;
      }

      // Check version constraint if specified (e.g., "lodash@^4.0.0")
      if (versionConstraint) {
        // Check if the original semver satisfies the constraint
        // This handles cases like "lodash@^4.0.0": "4.17.21"
        // where we only override lodash if it's requested as ^4.0.0 range
        if (!this._matchesVersionConstraint(item.semver, versionConstraint)) {
          continue;
        }
      }

      // Check parent path constraint if specified
      if (parentPath) {
        if (!this._matchesParentPath(item, parentPath)) {
          continue;
        }
      }

      // Apply the override
      if (replacement !== item.semver) {
        const parentInfo = parentPath ? ` (under ${parentPath})` : "";
        const constraintInfo = versionConstraint ? `@${versionConstraint}` : "";
        logger.info(
          `Override: ${item.name}${constraintInfo}${parentInfo} changed from ${item.semver} to ${replacement}`
        );
        semverUtil.replace(item._semver, replacement);
        return undefined;
      }
    }

    return undefined;
  }

  /**
   * Check if the item's semver matches the version constraint specified in the override key
   *
   * @param itemSemver - The semver from the dependency
   * @param constraint - The version constraint from override key (e.g., "^4.0.0", ">=1.0.0")
   * @returns boolean
   */
  _matchesVersionConstraint(itemSemver: string, constraint: string): boolean {
    // If the constraint is a specific version, check exact match or if itemSemver could resolve to it
    if (Semver.valid(constraint)) {
      // Exact version constraint - the item's semver should potentially resolve to this version
      return Semver.satisfies(constraint, itemSemver);
    }

    // For range constraints, check if the item's semver intersects with the constraint
    // This is a bit tricky - npm checks if the requested semver would match the constraint
    // For example, if override is "lodash@^4.0.0" and item.semver is "^4.17.0",
    // they overlap so the override applies

    // Check if they intersect by seeing if the constraint range overlaps with item's range
    try {
      return Semver.intersects(itemSemver, constraint);
    } catch {
      // If semver parsing fails, fall back to string comparison
      return itemSemver === constraint;
    }
  }

  /**
   * Check if the item's parent path matches the override's parent path constraint
   *
   * For example, if override is { "foo": { "bar": "1.0.0" } },
   * parentPath would be "foo" and we check if item's parent chain includes "foo"
   *
   * @param item - The dependency item
   * @param parentPath - The parent path from the override (e.g., "foo" or "foo/baz")
   * @returns boolean
   */
  _matchesParentPath(item: DepItem, parentPath: string): boolean {
    if (!item.parent || item.parent.depth === 0) {
      return false;
    }

    // Build the parent chain
    const parentChain: string[] = [];
    let current: DepItem | undefined = item.parent;
    while (current && current.depth > 0) {
      parentChain.unshift(current.name);
      current = current.parent;
    }

    // Convert parentPath to array (handles scoped packages)
    const pathParts = parentPath.split("/").filter(p => p);

    // Handle scoped packages in path - rejoin @scope/name
    const normalizedParts: string[] = [];
    for (let i = 0; i < pathParts.length; i++) {
      if (pathParts[i].startsWith("@") && i + 1 < pathParts.length) {
        normalizedParts.push(`${pathParts[i]}/${pathParts[i + 1]}`);
        i++;
      } else {
        normalizedParts.push(pathParts[i]);
      }
    }

    // Check if the parent chain ends with the required path
    // e.g., if parentPath is "foo/bar", parent chain should be [..., "foo", "bar"]
    if (normalizedParts.length > parentChain.length) {
      return false;
    }

    // Check from the end of the chain
    const startIdx = parentChain.length - normalizedParts.length;
    for (let i = 0; i < normalizedParts.length; i++) {
      if (parentChain[startIdx + i] !== normalizedParts[i]) {
        return false;
      }
    }

    return true;
  }

  _resolveWithLockData(item: DepItem): ResolveResult | false {
    //
    // Force resolve from lock data in regen mode if item was not a direct
    // optional dependency.
    //
    const isOpt = item.dsrc && item.dsrc.includes("opt");

    // if refresh optionals then can't use lock data for optionalDependencies
    if (isOpt && this._fyn.refreshOptionals) {
      return false;
    }

    const force = this._lockOnly && !isOpt;

    // check if an already resolved local package satisfies item
    // before trying to resolve with lock data
    if (!this._fyn.preferLock) {
      const localMeta = this._pkgSrcMgr.getAllLocalMetaOfPackage(item.name);

      if (localMeta) {
        for (const v in localMeta) {
          const localResolve = this._resolveWithMeta({ item, meta: localMeta[v] });
          if (localResolve) {
            return localResolve;
          }
        }
      }
    }

    const locked = this._fyn.depLocker.convert(item);

    if (locked) {
      const resolved = this._resolveWithMeta({
        item,
        meta: locked,
        force,
        noLocal: !this._fyn.preferLock,
        lockOnly: true
      });
      // if (!item.semverPath ) {
      //   logger.warn(
      //     item.name,
      //     item.semver,
      //     "is locked to a locally linked version at",
      //     item.fullPath
      //   );
      // }
      // logger.debug(item.name, item.semver, "resolved from lock data", resolved);

      return resolved;
    }

    if (force) {
      this._failUnsatisfySemver(item);
    }

    // unable to resolve with lock data
    return false;
  }

  processItem(name: string | QueueDepthItem | PromiseItem): Promise<unknown> | void {
    if (name && (name as PromiseItem).promise) {
      const p = (name as PromiseItem).promise;
      (name as PromiseItem).promise = null;
      return p as Promise<unknown>;
    }

    if (name && (name as QueueDepthItem).queueDepth) {
      return this.queueDepth((name as QueueDepthItem).depth);
    }

    const depthData = this._depthResolving![this._depthResolving!.current!];
    // logger.info("resolving item", name, this._depthResolving.current, di);
    const items = depthData[name as string].items;
    if (items && items.length > 0) {
      return this.resolveItem(items.shift()!);
    }
    return undefined;
  }

  resolveItem(item: DepItem & { _semver: SemverAnalysis; _resolveByLock?: boolean }): Promise<void> {
    const tryLocal = (): Promise<ResolveResult | false> => {
      return xaa
        .wrap(() => this._pkgSrcMgr.fetchLocalItem(item))
        .then((meta: PackageMeta | undefined) => {
          if (meta) {
            const updated = this._fyn.depLocker.update(item, meta);
            return this._resolveWithMeta({ item, meta: updated, force: true });
          }
          return false;
        });
    };

    const tryLock = (): Promise<ResolveResult | false> => {
      return xaa.wrap(() => {
        const r = this._resolveWithLockData(item);

        if (r) {
          item._resolveByLock = true;
        }

        return r;
      });
    };

    // Apply overrides first (npm style), then resolutions (yarn style)
    // Overrides take precedence as they are more specific
    this._applyOverrides(item);
    this._replaceWithResolutionsData(item);

    const promise: Promise<ResolveResult | false> =
      !item.semverPath || this._fyn.preferLock
        ? tryLock().then(r => r || (item.semverPath && tryLocal()) || false)
        : tryLocal().then(r => r || tryLock());

    return promise
      .then((r: ResolveResult | false | undefined) => {
        if (r && !_.get(r, ["meta", "versions", (r as ResolveResult).resolved, "_missingJson"])) {
          return r;
        }

        if (this._lockOnly || item.localType) {
          return undefined;
        }
        // neither local nor lock was able to resolve for item
        // so try to fetch from registry for real meta to resolve
        // always fetch the item and let pkg src manager deal with caching
        return this._pkgSrcMgr
          .fetchMeta(item)
          .then((meta: PackageMeta) => {
            if (!meta) {
              throw new Error(failMetaMsg(item.name));
            }
            const updated = this._fyn.depLocker.update(item, meta);
            return this._resolveWithMeta({ item, meta: updated, force: true, noLocal: true });
          })
          .catch((err: Error) => {
            // item is not optional => fail
            if (item.dsrc !== "opt") {
              if (err.message.includes("Unable to retrieve meta")) {
                throw err;
              } else {
                throw new AggregateError([err], failMetaMsg(item.name));
              }
            } else {
              (item as DepItem).resolved = `metaFail_${item.semver}`;
              // add to opt resolver directly as failed package with a dummy meta
              this._optResolver.add({ item, err, meta: { versions: { [(item as DepItem).resolved!]: {} } } });
            }
            return undefined;
          });
      })
      .then(async (r: ResolveResult | false | undefined) => {
        if (!r) return;

        const { meta, resolved } = r as ResolveResult;

        if (item._semver.$$ && !Semver.satisfies(resolved, item._semver.$$)) {
          logger.warn(
            `${item.nameDepPath}@${resolved} resolved by resolutions data doesn't satisfy original semver ${item._semver.$$}`
          );
        }

        await this.addPackageResolution(item, meta, resolved);
      })
      .then(() => {
        const depthData = this._depthResolving![item.depth];
        const items = depthData[item.name].items;

        depthData[item.name].items = [];

        return xaa.each(items, (x: DepItem) => this.resolveItem(x as DepItem & { _semver: SemverAnalysis }));
      });
  }
}

export default PkgDepResolver;