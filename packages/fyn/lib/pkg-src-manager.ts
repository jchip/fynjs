//
// Manages all sources that package data could come from.
// - local cache
// - git repo
// - local dir
// - npm registry
//

/* eslint-disable no-magic-numbers, prefer-template, max-statements, no-param-reassign, no-sequences */

import Promise from "aveazul";
import cacache from "cacache";
import { refreshCacheEntry, getCacheInfoWithRefreshTime } from "./cacache-util";
import os from "os";
import pacote from "pacote";
import _ from "lodash";
import chalk from "chalk";
import { PassThrough, Readable } from "stream";
import Fs from "./util/file-ops";
import logger from "./logger";
import fs from "fs";
import Path from "path";
import PromiseQueue from "./util/promise-queue";
import Inflight from "./util/inflight";
import logFormat from "./util/log-format";
import * as semverUtil from "./util/semver";
import longPending from "./long-pending";
import { LOCAL_VERSION_MAPS, PACKAGE_RAW_INFO, DEP_ITEM } from "./types";
import { LONG_WAIT_META, FETCH_META, FETCH_PACKAGE } from "./log-items";
import PkgPreper from "pkg-preper";
import { VisualExec } from "visual-exec";
import fyntil from "./util/fyntil";
import { MARK_URL_SPEC } from "./constants";
import nodeFetch from "node-fetch-npm";
import { AggregateError } from "@jchip/error";
import { prePackObj } from "publish-util";
import { PackageRef } from "@fynpo/base";
import Arborist from "@npmcli/arborist";
import { execSync } from "child_process";
import type { DepItem } from "./dep-item";
import type { Inflight as InflightType } from "item-queue/dist/inflight";
import type { ItemQueue } from "item-queue/dist/item-queue";

/** Options for PkgSrcManager constructor */
interface PkgSrcManagerOptions {
  registry?: string;
  fynCacheDir?: string;
  fyn: FynInstance;
  email?: string;
  "always-auth"?: boolean;
  username?: string;
  password?: string;
  [key: string]: unknown;
}

/** Fyn instance interface - subset of Fyn class used by PkgSrcManager */
interface FynInstance {
  concurrency: number;
  cwd?: string;
  _fynCacheDir: string;
  _options: {
    refreshMeta?: boolean;
    metaMemoize?: string;
  };
  _fynpo?: {
    config?: {
      publishUtil?: Record<string, unknown>;
    };
    graph?: {
      getPackageAtDir(path: string): unknown;
    };
  };
  isFynpo: boolean;
  forceCache: boolean | string;
  remoteMetaDisabled: boolean | string;
  remoteTgzDisabled: boolean | string;
  central?: FynCentralInstance;
  copy: string[];
}

/** FynCentral instance interface */
interface FynCentralInstance {
  allow(integrity: string): Promise<boolean>;
  has(integrity: string): Promise<boolean>;
  validate(integrity: string): Promise<boolean>;
  getContentPath(integrity: string): Promise<string>;
  delete(integrity: string): Promise<void>;
  storeTarStream(
    tarId: string,
    integrity: string,
    tarStream: () => Promise<Readable>
  ): Promise<void>;
}

/** Fetch item representing a dependency to fetch */
interface FetchItem {
  name: string;
  semver: string;
  semverPath?: string;
  localType?: string;
  urlType?: string;
  fullPath?: string;
  parent?: FetchItem & { localType?: string; fullPath?: string };
  [DEP_ITEM]?: DepItem;
}

/** Package distribution info */
interface PkgDist {
  integrity?: string;
  shasum?: string;
  tarball?: string;
  localPath?: string;
  fullPath?: string;
}

/** Package info/manifest */
interface PkgInfo {
  name: string;
  version: string;
  dist?: PkgDist;
  _resolved?: string;
  _integrity?: string;
  _shasum?: string;
  _id?: string;
  _shrinkwrap?: Record<string, unknown>;
  [DEP_ITEM]?: DepItem & { urlType?: string; semver?: string };
  [key: string]: unknown;
}

/** npm packument (package document) */
interface Packument {
  name: string;
  versions: Record<string, PkgInfo>;
  "dist-tags": Record<string, string>;
  readme?: string;
  _contentLength?: number;
  _cached?: boolean;
  urlVersions?: Record<string, PkgInfo>;
  [key: string]: unknown;
}

/** Local package meta */
interface LocalMeta {
  local: string;
  localId: string;
  name: string;
  json: PkgInfo;
  jsonStr: string;
  versions: Record<string, PkgInfo>;
  "dist-tags": Record<string, string>;
  [LOCAL_VERSION_MAPS]: Record<string, string>;
}

/** Deferred promise interface */
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

/** Queue item for meta fetching */
interface MetaQueueItem {
  type: "meta";
  cacheKey: string;
  item: FetchItem;
  packumentUrl: string;
  defer: Deferred<Packument>;
}

/** Meta fetch statistics */
interface MetaStat {
  wait: number;
  inTx: number;
  done: number;
}

/** Registry data mapping */
interface RegistryData {
  registry?: string;
  [key: string]: string | undefined;
}

/** Pacote options */
interface PacoteOptions {
  cache: string;
  email?: string;
  alwaysAuth?: boolean;
  username?: string;
  password?: string;
  Arborist: typeof Arborist;
  [key: string]: unknown;
}

/** Tarball fetch result */
interface TarballFetchResult {
  then: <TResult1 = Readable | string, TResult2 = never>(
    onfulfilled?: ((value: Readable | string) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) => Promise<TResult1 | TResult2>;
  catch: <TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
  ) => Promise<Readable | string | TResult>;
  tap: (f: (x: Readable | string) => void) => Promise<Readable | string>;
  promise: Promise<Readable | string>;
  startTime: number;
}

/** Cache info with refresh time */
interface CacheInfoWithRefreshTime {
  metadata?: PkgInfo & { _resolved?: string; dist?: PkgDist };
  integrity?: string;
  refreshTime?: number;
}

/** Publish util config */
interface PublishUtilConfig {
  fynIgnore?: boolean;
  silent?: boolean;
  [key: string]: unknown;
}

const { readPkgJson, missPipe } = fyntil;

const WATCH_TIME = 5000;

// consider meta cache stale after this much time (24 hours)
// This is a fallback - git ls-remote checks for new commits more frequently
const META_CACHE_STALE_TIME = 24 * 60 * 60 * 1000;

// Helper to check if git repo has new commits using fast git ls-remote or git rev-parse
async function checkGitRepoHasNewCommits(
  gitUrl: string,
  ref: string | undefined,
  cachedCommitHash: string | null
): Promise<boolean | null> {
  if (!cachedCommitHash) return true; // No cache, assume new commits
  
  try {
    // Handle file:// URLs for local git repos - use git rev-parse instead of ls-remote
    let actualGitUrl = gitUrl;
    let isLocalRepo = false;
    let localRepoPath = null;
    
    if (gitUrl.startsWith("file://")) {
      // Extract the local path from file:// URL
      isLocalRepo = true;
      localRepoPath = gitUrl.replace(/^file:\/\//, "").replace(/^\/+/, "/");
      if (process.platform === "win32" && localRepoPath.startsWith("/")) {
        // Windows: file:///C:/path -> C:/path
        localRepoPath = localRepoPath.substring(1);
      }
    } else if (!gitUrl.includes("://")) {
      // For local paths without file:// prefix, treat as local
      isLocalRepo = true;
      localRepoPath = Path.resolve(gitUrl);
    }
    
    if (isLocalRepo && localRepoPath) {
      // For local repos, use git rev-parse to get the current HEAD commit
      // This is more reliable than ls-remote for local repos
      const output = execSync(`git rev-parse ${ref || "HEAD"}`, {
        cwd: localRepoPath,
        stdio: "pipe",
        encoding: "utf8",
        timeout: 10000 // 10 second timeout
      });
      
      const latestCommit = output.trim();
      if (!latestCommit.match(/^[a-f0-9]{40}$/)) {
        logger.debug(`git rev-parse returned invalid commit hash: ${latestCommit}`);
        return null; // Can't determine
      }
      
      return latestCommit !== cachedCommitHash;
    } else {
      // For remote repos, use git ls-remote
      // Normalize git URL format
      if (gitUrl.startsWith("github:")) {
        actualGitUrl = `https://github.com/${gitUrl.replace("github:", "")}.git`;
      } else if (gitUrl.startsWith("git+")) {
        actualGitUrl = gitUrl.replace(/^git\+/, "");
      } else if (!gitUrl.includes("://")) {
        actualGitUrl = `https://github.com/${gitUrl}.git`;
      } else {
        actualGitUrl = gitUrl;
      }
      
      // Use git ls-remote to get the latest commit for the ref without cloning
      const output = execSync(`git ls-remote ${actualGitUrl} ${ref || "HEAD"}`, {
        stdio: "pipe",
        encoding: "utf8",
        timeout: 10000 // 10 second timeout
      });
      
      const match = output.match(/^([a-f0-9]{40})\s+/m);
      if (!match) return true; // Can't determine, assume new commits
      
      const latestCommit = match[1];
      return latestCommit !== cachedCommitHash;
    }
  } catch (err) {
    // If check fails, fall back to time-based staleness check
    logger.debug(`git commit check failed for ${gitUrl}#${ref}: ${err.message}`);
    return null; // Indicates we couldn't check
  }
}

class PkgSrcManager {
  private _options: PkgSrcManagerOptions;
  private _meta: Record<string, Packument>;
  private _cacheDir: string;
  private _inflights: { meta: InflightType<Promise<Packument>> };
  private _fyn: FynInstance;
  private _localMeta: Record<string, { byPath: Record<string, LocalMeta>; byVersion: Record<string, LocalMeta> }>;
  private _netQ: ItemQueue<MetaQueueItem>;
  private _pacoteOpts: PacoteOptions;
  private _regData: RegistryData;
  private _metaStat: MetaStat;
  private _lastMetaStatus: string;
  private _fetching?: string[];
  private _fetchingMsg?: string;

  constructor(options: PkgSrcManagerOptions) {
    this._options = _.defaults({}, options, {
      registry: "",
      fynCacheDir: ""
    });
    this._meta = {};
    this._cacheDir = this._options.fynCacheDir!;
    fs.mkdirSync(this._cacheDir, { recursive: true });
    this._inflights = {
      meta: new Inflight()
    };
    this._fyn = options.fyn;

    this._localMeta = {};
    this._netQ = new PromiseQueue({
      concurrency: this._fyn.concurrency,
      stopOnError: true,
      processItem: (x: MetaQueueItem) => this.processItem(x),
      watchTime: WATCH_TIME
    });

    this._netQ.on("fail", (data: unknown) => logger.error(data));
    this._netQ.on("watch", (items: unknown) => {
      longPending.onWatch(items, {
        name: LONG_WAIT_META,
        filter: (x: { item: MetaQueueItem }) => x.item.type === "meta",
        makeId: (x: { item: MetaQueueItem }) => logFormat.pkgId(x.item),
        _save: false
      });
    });

    const registryData = _.pickBy(
      this._options,
      (v, key) => key === "registry" || key.endsWith(":registry")
    ) as RegistryData;

    const authTokens = _.pickBy(this._options, (v, key) => key.endsWith(":_authToken"));

    logger.debug("pkg src manager registry", JSON.stringify(registryData));

    this._pacoteOpts = Object.assign(
      {
        cache: this._cacheDir,
        email: this._options.email,
        alwaysAuth: this._options["always-auth"],
        username: this._options.username,
        password: this._options.password
      },
      authTokens,
      registryData
    ) as PacoteOptions;

    // Add Arborist to pacote options for git dependencies (required by pacote v21+)
    this._pacoteOpts.Arborist = Arborist;

    this._regData = registryData;
    this.normalizeRegUrlSlash();

    this._metaStat = {
      wait: 0,
      inTx: 0,
      done: 0
    };
    this._lastMetaStatus = "waiting...";
  }

  normalizeRegUrlSlash(): void {
    _.each(this._regData, (v, k) => {
      this._regData[k] = v!.endsWith("/") ? v : `${v}/`;
    });
  }

  getRegistryUrl(pkgName: string): string | undefined {
    let regUrl = this._regData.registry;
    if (pkgName.startsWith("@")) {
      const scope = pkgName.split("/")[0];
      const k = `${scope}:registry`;
      if (this._regData[k]) {
        regUrl = this._regData[k];
      }
    }

    return regUrl;
  }

  makePackumentUrl(pkgName: string): string {
    const escapedName = pkgName.replace("/", "%2f");
    const regUrl = this.getRegistryUrl(pkgName);
    return `${regUrl}${escapedName}`;
  }

  processItem(x: MetaQueueItem): Promise<void> | undefined {
    if (x.type === "meta") {
      return this.netRetrieveMeta(x);
    }
    return undefined;
  }

  makePkgCacheDir(pkgName: string): string {
    const pkgCacheDir = Path.join(this._cacheDir, pkgName);
    fs.mkdirSync(pkgCacheDir, { recursive: true });
    return pkgCacheDir;
  }

  getSemverAsFilepath(semver: string): string | false {
    if (semver.startsWith("file:")) {
      return semver.substr(5);
    } else if (semver.startsWith("/") || semver.startsWith("./") || semver.startsWith("../")) {
      return semver;
    } else if (semver.startsWith("~/")) {
      return Path.join(os.homedir(), semver.substr(1));
    }
    return false;
  }

  getLocalPackageMeta(item: FetchItem, resolved: string): LocalMeta | undefined {
    return _.get(this._localMeta, [item.name, "byVersion", resolved]);
  }

  getAllLocalMetaOfPackage(name: string): Record<string, LocalMeta> | undefined {
    return _.get(this._localMeta, [name, "byVersion"]);
  }

  getPacoteOpts(extra?: Record<string, unknown>): PacoteOptions {
    return Object.assign({}, extra, this._pacoteOpts);
  }

  getPublishUtil(json: PkgInfo, fullPath: string): PublishUtilConfig | undefined {
    let config: PublishUtilConfig | undefined;
    let pkgInfo: unknown;
    let configFromFynpo: PublishUtilConfig | undefined;

    if (this._fyn.isFynpo && (pkgInfo = this._fyn._fynpo!.graph!.getPackageAtDir(fullPath))) {
      const fynpoPublishUtil = _.get(this._fyn, "_fynpo.config.publishUtil", {}) as Record<string, PublishUtilConfig>;

      for (const ref in fynpoPublishUtil) {
        const pkgRef = new PackageRef(ref);
        if (pkgRef.match(pkgInfo)) {
          configFromFynpo = fynpoPublishUtil[ref];
          break;
        }
      }
    }

    if (
      json.publishUtil ||
      _.get(json, ["dependencies", "publish-util"]) ||
      _.get(json, ["devDependencies", "publish-util"])
    ) {
      config = json.publishUtil as PublishUtilConfig | undefined;
    }

    return configFromFynpo || config;
  }

  /* eslint-disable max-statements */
  fetchLocalItem(item: FetchItem): false | Promise<LocalMeta> {
    const localPath = item.semverPath;

    if (!localPath) {
      return false;
    }

    let fullPath: string;

    if (!Path.isAbsolute(localPath)) {
      const parent = item.parent;
      if (parent?.localType) {
        fullPath = Path.join(parent.fullPath!, localPath);
      } else {
        const baseDir = this._fyn.cwd || process.cwd();
        logger.debug("fetchLocalItem resolving", localPath, "relative to", baseDir);
        fullPath = Path.resolve(baseDir, localPath);
      }
    } else {
      fullPath = localPath;
    }

    item.fullPath = fullPath;

    logger.debug("fetchLocalItem localPath", localPath, "fullPath", fullPath, "cwd", this._fyn.cwd);

    const existLocalMeta = _.get(this._localMeta, [item.name, "byPath", fullPath]) as LocalMeta | undefined;

    if (existLocalMeta) {
      existLocalMeta[LOCAL_VERSION_MAPS][item.semver] = existLocalMeta.localId;
      return Promise.resolve(existLocalMeta);
    }

    return readPkgJson(fullPath, true, true).then((json: PkgInfo) => {
      const publishUtilConfig = this.getPublishUtil(json, fullPath);
      if (publishUtilConfig && !publishUtilConfig.fynIgnore) {
        logger.debug(
          `processing local package.json at ${fullPath} with https://www.npmjs.com/package/publish-util prePackObj`
        );
        prePackObj(json, { ...publishUtilConfig, silent: true });
      }

      const version = semverUtil.localify(json.version, item.localType!);
      const name = item.name || json.name;
      json.dist = {
        localPath,
        fullPath
      };
      const localMeta: LocalMeta = {
        local: item.localType!,
        localId: version,
        name,
        json,
        jsonStr: (json as any)[PACKAGE_RAW_INFO].str,
        versions: {
          [version]: json
        },
        "dist-tags": {
          latest: version
        },
        [LOCAL_VERSION_MAPS]: {
          [item.semver]: version
        }
      };

      logger.debug(
        "return local meta for",
        item.name,
        item.semver,
        "at",
        fullPath,
        "local version",
        version
      );

      _.set(this._localMeta, [name, "byPath", fullPath], localMeta);
      _.set(this._localMeta, [name, "byVersion", version], localMeta);

      return localMeta;
    });
  }

  updateFetchMetaStatus(_render?: boolean): void {
    const { wait, inTx, done } = this._metaStat;
    const statStr = `(${chalk.red(wait)}⇨ ${chalk.yellow(inTx)}⇨ ${chalk.green(done)})`;
    logger.updateItem(FETCH_META, {
      msg: `${statStr} ${this._lastMetaStatus}`,
      _render,
      _save: _render
    });
  }

  netRetrieveMeta(qItem: MetaQueueItem): Promise<void> {
    const pkgName = qItem.item.name;

    const startTime = Date.now();

    const updateItem = (status?: string | number): void => {
      if (status !== undefined) {
        const statusStr = chalk.cyan(`${status}`);
        const time = logFormat.time(Date.now() - startTime);
        const dispName = chalk.red.bgGreen(pkgName);
        this._lastMetaStatus = `${statusStr} ${time} ${dispName}`;
        this.updateFetchMetaStatus();
      }
    };

    //
    // where fetch will ultimately occur and cached
    // make-fetch-happen/index.js:106 (cachingFetch)
    //   - missing cache ==> remoteFetch
    //   - found cache   ==> conditionalFetch
    // make-fetch-happen/index.js:143 (isStale check)
    //
    // make-fetch-happen/index.js:229 (conditionalFetch) ==> remoteFetch
    // make-fetch-happen/index.js:256 (304 Not Modified handling) (just returncachedRes?)
    //
    // make-fetch-happen/index.js:309 (remoteFetch)
    // make-fetch-happen/index.js:352 (caching)
    //
    const pacoteRequest = () => {
      logger.debug(`pacote.packument ${qItem.packumentUrl}`);
      const promise = pacote.packument(
        pkgName,
        this.getPacoteOpts({
          "full-metadata": true,
          "fetch-retries": 3,
          "cache-policy": "ignore",
          "cache-key": qItem.cacheKey,
          memoize: false
        })
      );
      return promise
        .then(x => {
          this._metaStat.inTx--;
          // Handle case where pacote returns null/undefined for missing packages
          if (!x) {
            const msg = `pacote returned null/undefined for packument of ${pkgName}`;
            logger.error(chalk.yellow(msg));
            throw new AggregateError([new Error(msg)], msg);
          }
          // Handle different response formats from different pacote versions
          if (x.readme) delete x.readme; // don't need this
          if (x._contentLength) delete x._contentLength; // newer pacote adds this
          updateItem(x._cached ? "cached" : "200");
          return x;
        })
        .catch(err => {
          const msg = `pacote failed fetching packument of ${pkgName}`;
          logger.error(chalk.yellow(msg), chalk.red(err.message));
          throw new AggregateError([err], msg);
        });
    };

    this._metaStat.wait--;
    this._metaStat.inTx++;

    this.updateFetchMetaStatus(false);

    const promise = qItem.item.urlType ? this.fetchUrlSemverMeta(qItem.item) : pacoteRequest();

    return promise
      .then(x => {
        const time = Date.now() - startTime;
        if (time > 20 * 1000) {
          logger.info(
            chalk.red("Fetch meta of package"),
            logFormat.pkgId(qItem.item),
            `took ${logFormat.time(time)}!!!`
          );
        }
        // Handle case where pacote returns null/undefined for missing packages
        if (!x) {
          const msg = `packument fetch returned null/undefined for ${pkgName}`;
          logger.error(chalk.yellow(msg));
          qItem.defer.reject(new AggregateError([new Error(msg)], msg));
          return;
        }
        // Refresh cache timestamp after successful fetch
        refreshCacheEntry(this._fyn._fynCacheDir, qItem.cacheKey).catch(() => {});
        qItem.defer.resolve(x);
      })
      .catch(err => {
        qItem.defer.reject(err);
      });
  }

  hasMeta(item: FetchItem): boolean {
    return Boolean(this._meta[item.name]);
  }

  pkgPreperInstallDep(dir: string, displayTitle: string): Promise<void> {
    const node = process.env.NODE || process.execPath;
    const fyn = Path.join(__dirname, "../bin/fyn.js");
    return new VisualExec({
      displayTitle,
      cwd: dir,
      command: `${node} ${fyn} --pg simple -q v install --no-production`,
      visualLogger: logger
    }).execute();
  }

  _getPacoteDirPacker(): (manifest: PkgInfo, dir: string) => Readable {
    const pkgPrep = new PkgPreper({
      tmpDir: this._cacheDir,
      installDependencies: this.pkgPreperInstallDep
    });
    return pkgPrep.getDirPackerCb();
  }

  _packDir(manifest: PkgInfo, dir: string): Readable {
    return this._getPacoteDirPacker()(manifest, dir);
  }

  fetchUrlSemverMeta(item: FetchItem): Promise<Packument> {
    type DirPackerError = Error & { capDir?: string; manifest?: PkgInfo };
    let dirPacker: (manifest: PkgInfo, dir: string) => Promise<never> | Readable;

    if (item.urlType!.startsWith("git")) {
      //
      // NOTE: These comments are from 2018 (npm 6.4.0 era) and may be outdated.
      // Current pacote v21+ may have improvements, but fyn still uses this workaround.
      //
      // pacote's implementation clones the repo to get manifest/tarball.
      // To make this more efficient, fyn uses pacote only for cloning the package.
      // Then it moves the cloned dir away for its own use, and throws an
      // exception to make pacote bail out.
      //
      // We optimize further by:
      // 1. Using git ls-remote to check for new commits (fast, no clone needed)
      // 2. Only repacking if there are new commits OR cache is stale by time (24h fallback)
      // 3. Time-based staleness is a fallback when ls-remote fails or for commit hashes
      //
      dirPacker = (manifest: PkgInfo, dir: string): Promise<never> => {
        const err: DirPackerError = new Error("interrupt pacote");
        const capDir = `${dir}-fyn`;
        return Fs.rename(dir, capDir).then(() => {
          err.capDir = capDir;
          err.manifest = manifest;
          throw err;
        });
      };
    } else {
      dirPacker = this._getPacoteDirPacker();
    }

    // For git deps with branch/tag semvers (not commit hashes), check cache first
    // to see if we can avoid cloning by checking for new commits with git ls-remote
    const pacoteOpts: Record<string, unknown> = { dirPacker };
    if (item.urlType!.startsWith("git") && item.semver && !item.semver.match(/^[a-f0-9]{40}$/)) {
      // Try to find a cached version to get the commit hash
      // We'll construct a potential cache key from previous resolutions
      // This is a best-effort check - if we can't find cache, pacote will clone anyway
      const potentialCacheKeys = [
        // Try common cache key patterns based on semver
        `fyn-tarball-for-git+https://github.com/${item.semver.replace(/^github:/, "").split("#")[0]}.git#`,
        `fyn-tarball-for-git+ssh://git@github.com/${item.semver.replace(/^github:/, "").split("#")[0]}.git#`
      ];

      // Check if any cached entry exists and extract commit hash
      for (const baseKey of potentialCacheKeys) {
        try {
          // List cache entries that start with this base key
          // Note: This is approximate - we'd need to scan cache or maintain a mapping
          // For now, we'll do the check in _prepPkgDirForManifest after pacote resolves
        } catch (e) {
          // Ignore - will check in _prepPkgDirForManifest
        }
      }
    }

    return pacote
      .manifest(`${item.name}@${item.semver}`, this.getPacoteOpts(pacoteOpts))
      .then((manifest: PkgInfo) => {
        manifest = Object.assign({}, manifest);
        return {
          name: item.name,
          versions: {
            [manifest.version]: manifest
          },
          urlVersions: {
            [item.semver]: manifest
          },
          "dist-tags": {}
        } as Packument;
      })
      .catch((err: DirPackerError) => {
        if (!err.capDir) throw err;
        return this._prepPkgDirForManifest(item, err.manifest!, err.capDir);
      });
  }

  async _prepPkgDirForManifest(item: FetchItem, manifest: PkgInfo, dir: string): Promise<Packument> {
    //
    // The full git url with commit hash should be available in manifest._resolved
    // use that as cache key to lookup cached manifest
    //
    // Use semver (URL) for cache key instead of resolved commit hash
    // This allows cache sharing between different commits of the same git ref
    const tgzCacheKey = `fyn-tarball-for-${item.semver}`;
    const tgzCacheInfo = await getCacheInfoWithRefreshTime(this._cacheDir, tgzCacheKey) as CacheInfoWithRefreshTime | null;

    let pkg: PkgInfo | undefined;
    let integrity: string | undefined;
    let shouldRefresh = false;

    if (tgzCacheInfo) {
      // Extract cached commit hash from the cached resolved URL
      const cachedResolved = tgzCacheInfo.metadata?._resolved ||
                            (tgzCacheInfo.metadata?.dist?.tarball?.match(/MARK_URL_SPEC(.+)/)?.[1] ?
                              JSON.parse(tgzCacheInfo.metadata.dist.tarball.match(/MARK_URL_SPEC(.+)/)[1])._resolved : null);
      const cachedCommitHash = cachedResolved?.match(/#([a-f0-9]{40})$/)?.[1];

      // Primary check: Use git ls-remote or git rev-parse to check for new commits (fast, no clone needed)
      // This works for branch/tag refs, but not for explicit commit hashes
      if (!shouldRefresh && cachedCommitHash && item.semver && !item.semver.match(/^[a-f0-9]{40}$/)) {
        // Extract git URL and ref from semver
        // semver format: "github:user/repo#branch" or "git+https://github.com/user/repo.git#branch" or "git+file:///path#branch"
        let gitUrl = item.semver;
        let ref = "HEAD";
        
        if (gitUrl.includes("#")) {
          const parts = gitUrl.split("#");
          gitUrl = parts[0];
          ref = parts[1];
        }
        
        // Strip git+ prefix if present (checkGitRepoHasNewCommits will handle file:// URLs)
        if (gitUrl.startsWith("git+")) {
          gitUrl = gitUrl.replace(/^git\+/, "");
        }
        
        // Normalize git URL format for remote repos (but keep file:// URLs as-is)
        if (gitUrl.startsWith("file://")) {
          // Keep file:// URLs as-is - checkGitRepoHasNewCommits will handle them
        } else if (gitUrl.startsWith("github:")) {
          gitUrl = `https://github.com/${gitUrl.replace("github:", "")}.git`;
        } else if (!gitUrl.includes("://")) {
          gitUrl = `https://github.com/${gitUrl}.git`;
        }
        
        const hasNewCommits = await checkGitRepoHasNewCommits(gitUrl, ref, cachedCommitHash);
        if (hasNewCommits === true) {
          shouldRefresh = true;
          logger.debug(
            `git cache for '${item.name}' has new commits (cached: ${cachedCommitHash.substring(0, 8)}, checking ${ref}), forcing refresh`
          );
        } else {
          // No new commits OR ls-remote failed - check time-based staleness as fallback
          if (tgzCacheInfo.refreshTime) {
            const stale = Date.now() - tgzCacheInfo.refreshTime;
            const staleByTime = stale >= META_CACHE_STALE_TIME;
            if (staleByTime) {
              shouldRefresh = true;
              const reason = hasNewCommits === null ? "ls-remote failed" : "no new commits";
              logger.debug(
                `git cache for '${item.name}' (${reason}), cache is stale by time (${(stale / 1000 / 60 / 60).toFixed(1)}h old), forcing refresh`
              );
            }
          }
        }
      } else if (!shouldRefresh && tgzCacheInfo.refreshTime) {
        // For explicit commit hashes, fall back to time-based staleness check
        const stale = Date.now() - tgzCacheInfo.refreshTime;
        const staleByTime = stale >= META_CACHE_STALE_TIME;
        if (this._fyn._options.refreshMeta === true || staleByTime) {
          shouldRefresh = true;
          logger.debug(
            `git cache for '${item.name}' (commit hash) is stale by time (${(stale / 1000 / 60).toFixed(1)}min old), forcing refresh`
          );
        }
      }

      if (!shouldRefresh) {
        // Use cached version
        pkg = tgzCacheInfo.metadata;
        integrity = tgzCacheInfo.integrity;
        logger.debug("gitdep package", pkg.name, "using cache for", manifest._resolved);
      }
    }

    if (!tgzCacheInfo || shouldRefresh) {
      // Cache miss or stale - need to refresh
      // Note: The dir was already cloned by pacote in fetchUrlSemverMeta,
      // and manifest._resolved contains the resolved commit hash.
      // If the semver is a branch/tag (not a commit hash), pacote will have
      // resolved it to the latest commit. The dir should already contain the latest code.
      //
      // prepare and pack dir into tgz
      //
      const packStream = this._packDir(manifest, dir);
      await new Promise((resolve, reject) => {
        packStream.on("prepared", resolve);
        packStream.on("error", reject);
      });
      pkg = await readPkgJson(dir);
      logger.debug("gitdep package", pkg.name, "prepared", manifest._resolved);
      //
      // cache tgz (use manifest._resolved as cache key)
      //
      const cacheStream = cacache.put.stream(this._cacheDir, tgzCacheKey, { metadata: manifest });
      cacheStream.on("integrity", i => (integrity = i.sha512[0].source));
      await missPipe(packStream, cacheStream);
      logger.debug("gitdep package", pkg.name, "cached with integrity", integrity);
      
      // Update refresh time for the cache entry
      await refreshCacheEntry(this._cacheDir, tgzCacheKey);
    }

    // embed info into tarball URL as a JSON string
    const tarball = JSON.stringify(
      Object.assign(_.pick(item, ["urlType", "semver"]), _.pick(manifest, ["_resolved", "_id"]))
    );

    manifest = Object.assign(
      {},
      pkg,
      _.pick(manifest, ["_resolved", "_integrity", "_shasum", "_id"]),
      {
        dist: {
          integrity,
          tarball: `${MARK_URL_SPEC}${tarball}`
        }
      }
    );

    await Fs.$.rimraf(dir);

    return {
      name: item.name,
      versions: {
        [manifest.version]: manifest
      },
      urlVersions: {
        [item.semver]: manifest
      },
      "dist-tags": {}
    } as Packument;
  }

  fetchMeta(item: FetchItem): Promise<Packument> {
    const pkgName = item.name;
    const pkgKey = `${pkgName}@${item.urlType ? item.urlType : "semver"}`;

    if (this._meta[pkgKey]) {
      return Promise.resolve(this._meta[pkgKey]);
    }

    const inflight = this._inflights.meta.get<Promise<Packument>>(pkgKey);
    if (inflight) {
      return inflight;
    }

    const packumentUrl = this.makePackumentUrl(pkgName);
    const cacheKey = `make-fetch-happen:request-cache:full:${packumentUrl}`;

    const queueMetaFetchRequest = (cached?: Packument): Packument | Promise<Packument> => {
      const offline = this._fyn.remoteMetaDisabled;

      if (cached && this._fyn.forceCache) {
        this._metaStat.wait--;
        return cached;
      }

      if (offline) {
        this._metaStat.wait--;
        if (cached) return cached;
        const msg = `option ${offline} has disabled retrieving meta from remote`;
        logger.error(`fetch meta for ${chalk.magenta(pkgName)} error:`, chalk.red(msg));
        throw new Error(`${msg} for ${pkgName}`);
      }

      this.updateFetchMetaStatus(false);

      const netQItem: MetaQueueItem = {
        type: "meta",
        cacheKey,
        item,
        packumentUrl,
        defer: Promise.defer<Packument>()
      };

      this._netQ.addItem(netQItem);
      return netQItem.defer.promise;
    };

    this._metaStat.wait++;

    //
    // First check if cache has packument for the package
    //
    // TODO: Maybe pass in offline/prefer-offline/prefer-online flags to pacote so it can
    // handle these directly.
    //
    // Sample cache key created by make-fetch-happen
    // See https://github.com/zkat/make-fetch-happen/blob/508c0af20e02f86445fc9b278382abac811f0393/cache.js#L16
    //
    // "make-fetch-happen:request-cache:https://registry.npmjs.org/electrode-static-paths"
    // "make-fetch-happen:request-cache:https://registry.npmjs.org/@octokit%2frest"
    //

    //
    // Much slower way to get cache with pacote
    //
    // const promise = pacote
    //   .packument(
    //     pkgName,
    //     this.getPacoteOpts({
    //       offline: true,
    //       "full-metadata": true,
    //       "fetch-retries": 3
    //     })
    //   )

    let foundCache: { data?: Buffer; refreshTime?: number } | undefined;
    let cacheMemoized = false;
    const metaMemoizeUrl = this._fyn._options.metaMemoize;

    const promise: Promise<Packument> = (item.urlType
      ? // when the semver is a url then the meta is not from npm registry and
        // we can't use the cache for registry
        Promise.resolve()
      : cacache.get(this._cacheDir, cacheKey, { memoize: true })
          .then(async cached => {
            // Add refreshTime from bucket mtime
            if (cached) {
              const info = await getCacheInfoWithRefreshTime(this._cacheDir, cacheKey);
              if (info) {
                cached.refreshTime = info.refreshTime;
              }
            }
            return cached;
          })
    )
      .then(cached => {
        const packument = cached && cached.data && JSON.parse(cached.data);
        foundCache = cached;
        
        if (cached && cached.refreshTime) {
          const stale = Date.now() - cached.refreshTime;
          const since = (stale / 1000).toFixed(2);
          logger.debug(
            `found packument cache for '${pkgName}' - refreshed ${since}secs ago at ${cached.refreshTime}`
          );
          if (
            this._fyn._options.refreshMeta !== true &&
            stale < META_CACHE_STALE_TIME
          ) {
            cacheMemoized = true;
            this._metaStat.wait--;
            return packument;
          }
        }
        
        if (cached && metaMemoizeUrl) {
          const encKey = encodeURIComponent(cacheKey);
          return nodeFetch(`${metaMemoizeUrl}?key=${encKey}`).then(
            res => {
              if (res.status === 200) {
                logger.debug(`using memoized packument cache for '${pkgName}'`);
                cacheMemoized = true;
                this._metaStat.wait--;
                return packument;
              }
              return queueMetaFetchRequest(packument);
            },
            () => queueMetaFetchRequest(packument)
          );
        } else {
          return queueMetaFetchRequest(packument);
        }
      })
      .catch(err => {
        if (foundCache) {
          const data = foundCache.data && foundCache.data.toString();
          logger.debug(`fail to process packument cache - ${err.message}; data ${data}`);
          throw err;
        }
        return queueMetaFetchRequest();
      })
      .then(meta => {
        this._metaStat.done++;
        this._meta[pkgKey] = meta;
        if (!cacheMemoized && metaMemoizeUrl) {
          const encKey = encodeURIComponent(cacheKey);
          nodeFetch(`${metaMemoizeUrl}?key=${encKey}`, { method: "POST", body: "" }).then(
            _.noop,
            _.noop
          );
        }
        return meta;
      })
      .finally(() => {
        this._inflights.meta.remove(pkgKey);
      });

    return this._inflights.meta.add(pkgKey, promise);
  }

  pacotePrefetch(pkgId: string, pkgInfo: PkgInfo, integrity?: string): Promise<void> {
    const stream = this.pacoteTarballStream(pkgId, pkgInfo, integrity);

    const defer = Promise.defer<void>();
    // Handle different stream types from different pacote versions
    // Newer pacote returns a Promise, not a stream
    if (typeof (stream as any).then === "function") {
      // It's a Promise, resolve it directly
      (stream as unknown as Promise<void>).then(() => defer.resolve()).catch(defer.reject);
    } else if (typeof stream.once === "function") {
      // Legacy stream with .once()
      stream.once("end", () => {
        if (stream.destroy) stream.destroy();
        defer.resolve();
      });
      stream.once("error", defer.reject);
      stream.on("data", _.noop);
    } else {
      // Fallback - assume it's a stream-like object
      defer.reject(new Error("Unsupported stream type from pacote"));
    }

    return defer.promise;
  }

  cacacheTarballStream(integrity: string): Readable {
    return cacache.get.stream.byDigest(this._cacheDir, integrity);
  }

  pacoteTarballStream(pkgId: string, pkgInfo: PkgInfo, integrity?: string): PassThrough {
    const tarballUrl = _.get(pkgInfo, "dist.tarball") as string | undefined;

    // pacote >= 21 changed the API - use RemoteFetcher with tarball URL to avoid manifest lookup
    if (tarballUrl) {
      const opts = this.getPacoteOpts({
        integrity
      });
      // Create a fetcher for the tarball URL
      const fetcher = new (pacote as any).RemoteFetcher(tarballUrl, opts);
      // Create a passthrough stream that we can return
      const passthrough = new PassThrough();

      // Start the tarballStream operation and pipe to passthrough
      // We need to start this immediately so that when pacotePrefetch consumes
      // the passthrough stream, data will flow through
      const streamPromise = fetcher.tarballStream((stream: Readable) => {
        // Pipe the source stream to our passthrough stream
        stream.pipe(passthrough);
        // Return a promise that resolves when piping is complete
        return new Promise<void>((resolve, reject) => {
          stream.on("end", resolve);
          stream.on("error", reject);
          passthrough.on("error", reject);
        });
      });

      // If there's an error starting the stream, propagate it to the passthrough
      streamPromise.catch((err: Error) => passthrough.destroy(err));

      // Return the passthrough stream
      return passthrough;
    }

    // Fallback for packages without tarball URL
    const opts = this.getPacoteOpts({
      fullMeta: true,
      integrity,
      resolved: tarballUrl
    });

    const passthrough = new PassThrough();
    const streamPromise = pacote.tarball.stream(
      pkgId,
      (stream: Readable) => {
        stream.pipe(passthrough);
        return new Promise<void>((resolve, reject) => {
          stream.on("end", resolve);
          stream.on("error", reject);
          passthrough.on("error", reject);
        });
      },
      opts
    );

    // If there's an error starting the stream, propagate it to the passthrough
    streamPromise.catch(err => passthrough.destroy(err));

    return passthrough;
  }

  getIntegrity(item: PkgInfo): string | undefined {
    const integrity = _.get(item, "dist.integrity") as string | undefined;
    if (integrity) return integrity;

    const shasum = _.get(item, "dist.shasum") as string | undefined;

    if (shasum) {
      const b64 = Buffer.from(shasum, "hex").toString("base64");
      return `sha1-${b64}`;
    }

    return undefined;
  }

  tarballFetchId(pkgInfo: PkgInfo): string {
    const di = pkgInfo[DEP_ITEM];
    if (di && di.urlType) return `${di.name}@${di.semver}`;

    return `${pkgInfo.name}@${pkgInfo.version}`;
  }

  async getCentralPackage(integrity: string | undefined, pkgInfo: PkgInfo): Promise<string | Readable> {
    const { central, copy } = this._fyn;

    const tarId = this.tarballFetchId(pkgInfo);

    const tarStream = async (): Promise<Readable> => {
      return integrity && (await cacache.get.hasContent(this._cacheDir, integrity))
        ? this.cacacheTarballStream(integrity)
        : this.pacoteTarballStream(tarId, pkgInfo, integrity);
    };

    // TODO: probably don't want to do central for github/url/file tarballs
    // If a dep is pointing to a tgz file directly, then there is no integrity
    // and best to avoid doing central storage for it.
    if (integrity && central) {
      const verId = `${pkgInfo.name}@${pkgInfo.version}`;
      const dispId = logFormat.pkgId(verId);

      if (copy.indexOf(pkgInfo.name) >= 0 || copy.indexOf(verId) >= 0) {
        logger.info(`copying pkg ${dispId} in central store mode due to copy option`);
      } else if (!(await central.allow(integrity))) {
        logger.info(
          `copying pkg ${dispId} in central store mode because it mutates in postinstall step.`
        );
      } else {
        let hasCentral = await central.has(integrity);

        if (hasCentral) {
          const valid = await central.validate(integrity);
          if (!valid) {
            const contentPath = await central.getContentPath(integrity);
            logger.error(`Corrupted central store package detected
  -- CORRUPTED CENTRAL STORE PACKAGE DETECTED, removing --
  ID: ${verId}
  integrity: ${integrity}
  path: '${contentPath}'
`);
            await central.delete(integrity);
            hasCentral = false;
          }
        }

        if (!hasCentral) {
          await central.storeTarStream(tarId, integrity, tarStream);
        }

        return integrity;
      }
    }

    return tarStream();
  }

  fetchTarball(pkgInfo: PkgInfo): TarballFetchResult {
    const startTime = Date.now();
    const pkgId = this.tarballFetchId(pkgInfo);
    const integrity = this.getIntegrity(pkgInfo);

    const doFetch = (): Promise<string | Readable> => {
      const fetchStartTime = Date.now();

      if (!this._fetching) {
        this._fetching = [];
        this._fetchingMsg = "waiting...";
      }

      this._fetching.push(pkgId);

      logger.updateItem(FETCH_PACKAGE, `${this._fetching.length} ${this._fetchingMsg}`);

      return this.pacotePrefetch(pkgId, pkgInfo, integrity).then(() => {
        const status = chalk.cyan(`200`);
        const time = logFormat.time(Date.now() - fetchStartTime);
        const ix = this._fetching!.indexOf(pkgId);
        this._fetching!.splice(ix, 1);
        this._fetchingMsg = `${status} ${time} ${chalk.red.bgGreen(pkgInfo.name)}`;
        logger.updateItem(FETCH_PACKAGE, `${this._fetching!.length} ${this._fetchingMsg}`);
        return this.getCentralPackage(integrity, pkgInfo);
      });
    };

    // - check cached tarball with manifest._integrity
    // - use stream from cached tarball if exist
    // - else fetch from network

    const promise: Promise<string | Readable> = cacache.get
      .hasContent(this._cacheDir, integrity)
      .catch(() => false)
      .then((content: unknown) => {
        if (content) {
          return this.getCentralPackage(integrity, pkgInfo);
        }

        const rd = this._fyn.remoteTgzDisabled;
        if (rd) {
          throw new Error(`option ${rd} has disabled retrieving tarball from remote`);
        }
        return doFetch();
      });

    return {
      then: <TResult1 = Readable | string, TResult2 = never>(
        r?: ((value: Readable | string) => TResult1 | PromiseLike<TResult1>) | null,
        e?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ) => promise.then(r, e),
      catch: <TResult = never>(
        e?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
      ) => promise.catch(e),
      tap: (f: (x: Readable | string) => void) => promise.then(x => (f(x), x)),
      promise,
      startTime
    };
  }
}

export default PkgSrcManager;
export { META_CACHE_STALE_TIME };
export type {
  PkgSrcManagerOptions,
  FynInstance,
  FetchItem,
  PkgDist,
  PkgInfo,
  Packument,
  LocalMeta,
  TarballFetchResult
};