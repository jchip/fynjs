import Path from "path";
import util from "util";
import assert from "assert";
import semver from "semver";
import _ from "lodash";
import logger from "./logger";
import PkgDepResolver from "./pkg-dep-resolver";
import PkgDistFetcher from "./pkg-dist-fetcher";
import PkgSrcManager from "./pkg-src-manager";
import PkgDepLocker from "./pkg-dep-locker";
import DepData from "./dep-data";
import fynConfig from "./fyn-config";
import * as semverUtil from "./util/semver";
import Fs from "./util/file-ops";
import fynTil from "./util/fyntil";
import FynCentral from "./fyn-central";
import xaa from "./util/xaa";
import { checkPkgNeedInstall } from "./util/check-pkg-need-install";
import lockfile from "lockfile";
import ck from "chalker";
import { PACKAGE_RAW_INFO, DEP_ITEM } from "./types";
import { FYN_LOCK_FILE, FYN_INSTALL_CONFIG_FILE, FV_DIR, PACKAGE_FYN_JSON } from "./constants";
import { parseYarnLock } from "../yarn";
import mm from "minimatch";
import npmConfigEnv from "./util/npm-config-env";
import PkgOptResolver from "./pkg-opt-resolver";
import { LocalPkgBuilder } from "./local-pkg-builder";
import pathUpEach from "./util/path-up-each";
import type { IMinimatch } from "minimatch";
import type { PkgVersion } from "./dep-data";

/** CLI source tracking for options */
interface CliSource {
  flattenTop?: string;
  layout?: string;
  production?: string;
  [key: string]: string | undefined;
}

/** Fyn options from configuration */
interface FynOptions {
  cwd?: string;
  initCwd?: string;
  lockTime?: string;
  flattenTop?: boolean;
  layout?: string;
  production?: boolean;
  pkgFile?: string;
  pkgData?: PackageJson;
  fynDir: string;
  fynCacheDir: string;
  targetDir: string;
  registry?: string;
  lockfile?: boolean;
  copy?: string[];
  centralStore?: boolean;
  forceCache?: boolean;
  offline?: boolean;
  fynlocal?: boolean;
  lockOnly?: boolean;
  showDeprecated?: boolean;
  refreshOptionals?: boolean;
  ignoreDist?: boolean;
  concurrency?: number;
  deepResolve?: boolean;
  preferLock?: boolean;
  alwaysFetchDist?: boolean;
  runNpm?: string[];
  buildLocal?: boolean;
  npmLock?: boolean;
  pkgSrcMgr?: PkgSrcManager;
  data?: DepData;
  refreshMeta?: boolean;
  metaMemoize?: string;
  [key: string]: unknown;
}

/** Package.json structure */
interface PackageJson {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  bundleDependencies?: string[];
  scripts?: Record<string, string>;
  resolutions?: Record<string, string>;
  overrides?: Record<string, string | Record<string, string>>;
  fyn?: {
    dependencies?: Record<string, string | boolean>;
    devDependencies?: Record<string, string | boolean>;
    optionalDependencies?: Record<string, string | boolean>;
    [key: string]: unknown;
  };
  publishUtil?: Record<string, unknown>;
  gypfile?: boolean;
  [PACKAGE_RAW_INFO]?: {
    dir: string;
    str: string;
  };
  [key: string]: unknown;
}

/** Package info with metadata */
interface PkgInfo extends PackageJson {
  promoted?: boolean;
  dir?: string;
  str?: string;
  json?: PackageJson;
  _id?: string;
  _invalid?: boolean;
  _origVersion?: string;
  _hasShrinkwrap?: boolean;
  dist?: {
    integrity?: string;
    tarball?: string;
    localPath?: string;
    fullPath?: string;
  };
  [DEP_ITEM]?: DepItemRef;
}

/** Dependency item reference */
interface DepItemRef {
  name: string;
  version: string;
  _resolveByLock?: boolean;
  [key: string]: unknown;
}

/** Install configuration saved to node_modules */
interface InstallConfig {
  time: number;
  centralDir?: string | false;
  production?: boolean;
  layout?: string;
  localPkgLinks?: Record<string, LocalPkgLink>;
  localsByDepth?: string[][];
  [key: string]: unknown;
}

/** Local package link info */
interface LocalPkgLink {
  srcDir: string;
  [key: string]: unknown;
}

/** Fynpo configuration */
interface FynpoConfig {
  centralDir?: string;
  resolutions?: Record<string, string>;
  overrides?: Record<string, string | Record<string, string>>;
  command?: {
    bootstrap?: {
      npmRunScripts?: string | string[] | (string | string[])[];
    };
  };
  [key: string]: unknown;
}

/** Fynpo data */
interface FynpoData {
  config?: FynpoConfig;
  dir?: string;
  fyn?: {
    options?: Partial<FynOptions>;
  };
  graph?: {
    getPackageAtDir(dir: string): unknown;
  };
  indirects?: unknown[];
  [key: string]: unknown;
}

/** Resolution matcher */
interface ResolutionMatcher {
  mm: IMinimatch;
  res: string;
}

/** Override matcher */
interface OverrideMatcher {
  pkgName: string;
  versionConstraint: string | null;
  parentPath: string;
  replacement: string;
}

/** npm lock data structure */
interface NpmLockData {
  name?: string;
  version?: string;
  lockfileVersion?: number;
  packages?: Record<string, unknown>;
  dependencies?: Record<string, unknown>;
  [key: string]: unknown;
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

/** Constructor options for Fyn */
interface FynConstructorOptions {
  opts?: Partial<FynOptions>;
  _cliSource?: CliSource;
  _fynpo?: boolean;
}

/** Local package install check result */
interface LocalPkgInstallResult {
  changed: boolean;
  [key: string]: unknown;
}

/** Dependency info for local packages */
interface LocalDepInfo {
  fullPath: string;
  [key: string]: unknown;
}

const createLock = util.promisify(lockfile.lock);
const unlock = util.promisify(lockfile.unlock);
const { posixify } = fynTil;

/* eslint-disable no-magic-numbers, max-statements, no-empty, complexity, no-eval */

class Fyn {
  // Class properties with type annotations
  private _cliSource: CliSource;
  private _shownMissingFiles: Set<string>;
  private _options: FynOptions;
  private _cwd: string;
  private _initCwd: string;
  private _lockTime?: Date;
  private _installConfig: InstallConfig;
  private _noPkgDirMatchName: boolean;
  private _fynpo?: FynpoData;
  private _pkg!: PackageJson;
  private _pkgFile!: string;
  private _pkgFyn?: Record<string, unknown>;
  private _pkgSrcMgr!: PkgSrcManager;
  private _depLocker!: PkgDepLocker;
  private _distFetcher?: PkgDistFetcher;
  private _depResolver?: PkgDepResolver;
  private _optResolver?: PkgOptResolver;
  private _data?: DepData;
  private _central?: FynCentral | false;
  private _npmLockData?: NpmLockData | null;
  private _yarnLock?: YarnLockData;
  private _runNpm?: string[];
  private _resolutions?: Record<string, string>;
  private _resolutionsMatchers?: ResolutionMatcher[];
  private _overrides?: Record<string, string | Record<string, string>>;
  private _overridesMatchers?: OverrideMatcher[];
  private _changeProdMode?: string;
  private _layout?: string;
  private _localPkgInstall?: Record<string, LocalPkgInstallResult>;
  private _localPkgBuilder?: LocalPkgBuilder;
  private _npmConfigEnv?: Record<string, string>;

  /** Local packages with nested dependencies */
  localPkgWithNestedDep: LocalDepInfo[];

  constructor({ opts = {}, _cliSource = {}, _fynpo = true }: FynConstructorOptions) {
    this._cliSource = { ..._cliSource };
    // Track shown "not found" messages to avoid duplicates
    this._shownMissingFiles = new Set();
    const options = (this._options = fynConfig(opts) as FynOptions);

    this._cwd = options.cwd || process.cwd();
    // initCwd is where fyn was originally invoked from (used for INIT_CWD in lifecycle scripts)
    // This may differ from _cwd for global installs where _cwd is a temp directory
    this._initCwd = options.initCwd || this._cwd;
    logger.debug(`fyn options`, JSON.stringify(fynTil.removeAuthInfo(options)));
    this.localPkgWithNestedDep = [];
    if (options.lockTime) {
      this._lockTime = new Date(options.lockTime);
      logger.info("dep lock time set to", this._lockTime.toString());
    }
    this._installConfig = { time: 0 };
    // set this env for more learning and research on ensuring
    // package dir name matches package name.
    this._noPkgDirMatchName = Boolean(process.env.FYN_NO_PKG_DIR_MATCH_NAME);
    if (!_fynpo) {
      this._fynpo = {};
    }
  }

  checkLayoutOption(): void {
    const { _options, _cliSource } = this;

    if (_options.flattenTop === false && _cliSource.flattenTop !== "default") {
      //
      if (_options.layout !== "detail") {
        if (_cliSource.layout === "default") {
          logger.info(
            `flatten-top option turned off by ${_cliSource.flattenTop}, so switching node_modules layout to detail`
          );
          _options.layout = "detail";
          _cliSource.layout = _cliSource.flattenTop;
        } else {
          logger.warn(
            `you try to turn off flatten-top but set node_modules layout to ${_options.layout} and they are not compatible`
          );
        }
      }
    }
  }

  checkFynLockExist(): boolean {
    const fname = Path.join(this._cwd, FYN_LOCK_FILE);
    return Fs.existsSync(fname);
  }

  updateConfigInLockfile(name: string, newValue: unknown): void {
    const valueInLock = this._depLocker.getConfig(name);
    if (valueInLock !== undefined && valueInLock !== newValue) {
      if (this._cliSource[name] === "cli") {
        logger.info(`You are changing ${name} in your lockfile from ${valueInLock} to ${newValue}`);
        this._depLocker.setConfig(name, newValue);
      } else {
        logger.info(`Setting ${name} to ${valueInLock} from your lockfile`);
        (this._options as Record<string, unknown>)[name] = valueInLock;
        this._cliSource[name] = "lock";
      }
    } else {
      this._depLocker.setConfig(name, newValue);
    }
  }

  async readLockFiles(): Promise<boolean | null> {
    if (this._depLocker) {
      return null;
    }

    this._npmLockData = null;

    this._depLocker = new PkgDepLocker(this.lockOnly, this._options.lockfile, this);

    const foundLock = await this._depLocker.read(Path.join(this._cwd, FYN_LOCK_FILE));
    this.updateConfigInLockfile("layout", this._options.layout);
    this.updateConfigInLockfile("flattenTop", this._options.flattenTop);
    this.checkLayoutOption();
    if (this._options.npmLock === true) {
      // force load npm lock data
    } else if (foundLock || this._options.npmLock === false) {
      return Boolean(foundLock);
    }

    // try to read and consume npm's lockfile
    // https://docs.npmjs.com/files/shrinkwrap.json.html
    for (const npmLockFile of ["npm-shrinkwrap.json", "package-lock.json"]) {
      this._npmLockData = await Fs.readFile(Path.join(this._cwd, npmLockFile))
        .then((data: Buffer | string) => JSON.parse(data.toString()) as NpmLockData)
        .catch(() => null);
      if (this._npmLockData) {
        logger.info(`using lock data from ${npmLockFile}.`);
        return true;
      }
    }

    // try to read and consume yarn's lockfile
    const yarnLockName = Path.join(this._cwd, "yarn.lock");
    if (Fs.existsSync(yarnLockName)) {
      logger.info("Reading yarn.lock");
      const yarnLockData = await Fs.readFile(yarnLockName, "utf-8");
      this._yarnLock = parseYarnLock(yarnLockData) as YarnLockData;
    }

    return false;
  }

  get isFynpo(): boolean {
    return Boolean(this._fynpo && this._fynpo.config);
  }

  get isNormalLayout(): boolean {
    return this._options.layout === "normal";
  }

  async _initCentralStore(): Promise<FynCentral | false> {
    const options = this._options;
    let centralDir: string | undefined;

    if (this._installConfig.centralDir) {
      centralDir = this._installConfig.centralDir as string;
      logger.debug(`Enabling central store using dir from install config ${centralDir}`);
    } else if ((centralDir = process.env.FYN_CENTRAL_DIR)) {
      // env wins
      if (fynTil.strToBool(centralDir) === false) {
        logger.debug(`Disabling central store by env FYN_CENTRAL_DIR set to ${centralDir}`);
        return (this._central = false);
      }
      if (fynTil.isTrueStr(centralDir)) {
        centralDir = Path.join(this.fynDir, "_central-storage");
      }
      logger.debug(`Enabling central store by env FYN_CENTRAL_DIR using dir ${centralDir}`);
    } else if (options.centralStore) {
      centralDir = Path.join(this.fynDir, "_central-storage");
      logger.debug(`Enabling central store by CLI flag using dir ${centralDir}`);
    } else if (!this._fynpo?.config) {
      return (this._central = false);
    } else {
      centralDir = this._fynpo.config.centralDir;
      if (!centralDir) {
        centralDir = Path.join(this._fynpo.dir!, ".fynpo", "_store");
      }
      logger.info(`Enabling central store by fynpo monorepo using dir ${centralDir}`);
    }

    return (this._central = new FynCentral({ centralDir }));
  }

  async _initialize({ noLock = false }: { noLock?: boolean } = {}): Promise<void> {
    await this._initializePkg();
    if (!noLock) {
      await this.readLockFiles();
    }
    await this._startInstall();
  }

  /**
   * Check user production mode option against saved install config in node_modules
   * @remarks - this._installConfig must've been initialized
   * @returns nothing
   */
  checkProductionMode(): void {
    if (this._installConfig.production) {
      if (this.production) {
        // user still want production mode, do nothing
      } else if (this._cliSource.production === "default") {
        // user didn't specify any thing about production mode, assume no change
        logger.info(
          ck`<orange>Setting production mode</> because existing node_modules is production mode.
  To force no production mode, pass --no-production flag.`
        );
        this._options.production = true;
      } else {
        logger.info(`Changing existing node_modules to NO production mode`);
        this._changeProdMode = this._cliSource.production;
      }
    } else if (this.production) {
      if (!this._installConfig.production) {
        logger.info(`Changing existing node_modules to production mode`);
        this._changeProdMode = this._cliSource.production;
      }
    }
  }

  checkNoFynLocal(name: string): boolean {
    const noFynLocal = ["dependencies", "devDependencies", "optionalDependencies"].find(sec => {
      const semv = _.get(this._pkg, ["fyn", sec, name]) as string | boolean | undefined;
      return semv === false || (typeof semv === "string" && semv.includes("no-fyn-local"));
    });

    return Boolean(noFynLocal);
  }

  // are we installing modules for the top level fynpo dir
  isTopLevelFynpoInstall(): boolean {
    if (this._fynpo?.config) {
      return this._fynpo.dir === this._cwd;
    }
    return false;
  }

  async _initializePkg(): Promise<void> {
    if (!this._fynpo) {
      this._fynpo = (await fynTil.loadFynpo(this._cwd)) as FynpoData;
      // TODO: options from CLI should not be override by fynpo config options
      // Preserve cwd from CLI/config, don't let fynpo config override it
      const savedCwd = this._options.cwd;
      _.merge(this._options, _.get(this, "_fynpo.fyn.options"));
      if (savedCwd) {
        this._options.cwd = savedCwd;
        this._cwd = savedCwd;
      }
    }

    this.checkLayoutOption();

    if (!this._pkg) {
      const options = this._options;

      await this.loadPkg(options);
      this._pkgSrcMgr =
        options.pkgSrcMgr || new PkgSrcManager(Object.assign({ fyn: this }, options));
      // this._data = options.data || new DepData();

      // check if there's existing installed node_modules with a fyn config file
      // to get the central store config used.
      const filename = this.getInstallConfigFile();
      try {
        const fynInstallConfig = JSON.parse(await Fs.readFile(filename)) as InstallConfig;
        logger.debug("loaded fynInstallConfig", fynInstallConfig);
        const { layout } = fynInstallConfig;
        if (layout && layout !== this._layout) {
          if (this._cliSource.layout !== "default") {
            logger.warn(
              `Forcing layout to ${layout} from ${this._layout} because your existing node_modules uses that. To change it, please remove node_modules first.`
            );
          }
          this._layout = layout;
        }
        this._installConfig = { ...this._installConfig, ...fynInstallConfig, layout };
      } catch (err) {
        const msgKey = `fynInstallConfig:${filename}`;
        if (!this._shownMissingFiles.has(msgKey)) {
          this._shownMissingFiles.add(msgKey);
          logger.debug("failed loaded fynInstallConfig from", filename, err);
        }
      }

      this.checkProductionMode();

      let fynpoNpmRun: string | string[] | (string | string[])[] | false | undefined;

      if (this._fynpo?.config) {
        if (this._fynpo.graph?.getPackageAtDir(this._cwd)) {
          // the command.bootstrap.npmRunScripts can be
          // - a string
          // - an array of strings
          // - an array of strings and/or array of strings - each sub array indicates a list of
          //   script names and fyn will run only the first one that exist
          fynpoNpmRun = _.get(this, "_fynpo.config.command.bootstrap.npmRunScripts", undefined) as
            | string
            | string[]
            | (string | string[])[]
            | undefined;
          if (_.isArray(fynpoNpmRun) && !_.isEmpty(fynpoNpmRun)) {
            logger.verbose("fynpo monorepo: npm run scripts", fynpoNpmRun);
          } else if (fynpoNpmRun !== false) {
            fynpoNpmRun = ["build"];
            logger.verbose("fynpo monorepo: default to auto run npm scripts:", fynpoNpmRun);
          }
        } else if (this._cwd !== this._fynpo.dir) {
          logger.info(
            "package at",
            this._cwd,
            "is not part of fynpo's packages. fynpo top dir is",
            this._fynpo.dir
          );
        }
      }

      this._runNpm = _.uniq(
        ([] as unknown[]).concat(this._options.runNpm, fynpoNpmRun).filter(x => x) as string[]
      );

      const resData: Record<string, string> = {
        ...this._pkg.resolutions,
        ...(_.get(this._fynpo, ["config", "resolutions"]) as Record<string, string> | undefined)
      };

      if (!_.isEmpty(resData)) {
        this._resolutions = resData;
        this._resolutionsMatchers = Object.keys(resData).map(depPath => {
          const unslashedPath = fynTil.unSlashNpmScope(depPath);
          const pts = unslashedPath.split("/");
          // spec can only contain ** between slashes
          assert(
            !pts.find(x => !(!x.includes("*") || x === "**")),
            `resolution path '${depPath}' can only contain '**' for wildcard matching`
          );
          const finalPath = pts.length === 1 ? `**/${unslashedPath}` : unslashedPath;
          return { mm: new mm.Minimatch(finalPath), res: resData[depPath] };
        });
      }

      // Process npm-style overrides
      const overridesData: Record<string, string | Record<string, string>> = {
        ...this._pkg.overrides,
        ...(_.get(this._fynpo, ["config", "overrides"]) as
          | Record<string, string | Record<string, string>>
          | undefined)
      };

      if (!_.isEmpty(overridesData)) {
        this._overrides = overridesData;
        this._overridesMatchers = this._processOverrides(overridesData);
      }
    }
  }

  /**
   * Process npm-style overrides into matchers
   *
   * npm overrides support:
   * 1. Simple: "package-name": "version"
   * 2. Nested: "parent-pkg": { "child-pkg": "version" }
   * 3. Version-conditional: "package@^1.0.0": "1.0.5"
   * 4. Reference: "$package-name" to reference a direct dependency version
   *
   * @param overrides - The overrides object from package.json
   * @param parentPath - The parent path for nested overrides
   * @returns Array of override matcher objects
   */
  _processOverrides(
    overrides: Record<string, string | Record<string, string>>,
    parentPath = ""
  ): OverrideMatcher[] {
    const matchers: OverrideMatcher[] = [];

    for (const key of Object.keys(overrides)) {
      const value = overrides[key];

      // Parse the key which may be "package" or "package@version"
      let pkgName = key;
      let versionConstraint: string | null = null;

      const atIdx = key.lastIndexOf("@");
      // Handle scoped packages (@scope/pkg) - @ at position 0 is scope, not version
      if (atIdx > 0) {
        pkgName = key.substring(0, atIdx);
        versionConstraint = key.substring(atIdx + 1);
      }

      if (typeof value === "string") {
        // Simple override or reference ($)
        let resolvedValue = value;

        // Handle $ reference syntax - reference to direct dependency version
        if (value.startsWith("$")) {
          const refPkgName = value.substring(1);
          const directDepVersion = this._getDirectDependencyVersion(refPkgName);
          if (directDepVersion) {
            resolvedValue = directDepVersion;
          } else {
            logger.warn(
              `Override reference $${refPkgName} not found in direct dependencies, using as-is`
            );
            resolvedValue = value;
          }
        }

        matchers.push({
          pkgName,
          versionConstraint,
          parentPath,
          replacement: resolvedValue
        });
      } else if (typeof value === "object" && value !== null) {
        // Nested override - the key is the parent package
        const newParentPath = parentPath ? `${parentPath}/${pkgName}` : pkgName;
        const nestedMatchers = this._processOverrides(value as Record<string, string>, newParentPath);
        matchers.push(...nestedMatchers);
      }
    }

    return matchers;
  }

  /**
   * Get the version of a direct dependency from package.json
   * @param pkgName - Package name to look up
   * @returns The version or null if not found
   */
  _getDirectDependencyVersion(pkgName: string): string | null {
    const sections = ["dependencies", "devDependencies", "optionalDependencies"] as const;
    for (const section of sections) {
      const version = _.get(this._pkg, [section, pkgName]) as string | undefined;
      if (version) {
        return version;
      }
    }
    return null;
  }

  async _startInstall(): Promise<void> {
    if (!this._distFetcher) {
      await this._initCentralStore();
      this._distFetcher = new PkgDistFetcher({
        pkgSrcMgr: this._pkgSrcMgr,
        fyn: this
      });
    }
  }

  async saveFynpoIndirects(): Promise<void> {
    if (!this.isFynpo || this._fynpo?.dir === this.cwd || _.isEmpty(this._fynpo?.indirects)) {
      return;
    }

    const lockFile = Path.join(this._fynpo!.dir!, ".fynpo/fynpo-data.lock");
    const { indirects } = this._fynpo!;

    try {
      const dataFile = Path.join(this._fynpo!.dir!, ".fynpo-data.json");
      await Fs.$.mkdirp(Path.join(this._fynpo!.dir!, ".fynpo"));
      await Fs.$.acquireLock(lockFile, {
        wait: 5000,
        pollPeriod: 100,
        stale: 8000,
        retries: 10,
        retryWait: 500
      });
      const path = posixify(Path.relative(this._fynpo!.dir!, this.cwd));
      const fynpoData = (await fynTil.readJson(dataFile, { indirects: { [path]: [] } })) as {
        indirects: Record<string, unknown[]>;
        __timestamp?: number;
      };
      if (JSON.stringify(indirects) !== JSON.stringify(fynpoData.indirects[path])) {
        logger.info(
          `saving indirect dep to .fynpo-data.json. fyn recommends that you commit the file.`
        );
        fynpoData.indirects[path] = indirects!;
        fynpoData.__timestamp = Date.now();
        await Fs.writeFile(dataFile, `${JSON.stringify(fynpoData, null, 2)}\n`);
      }
    } finally {
      await Fs.$.releaseLock(lockFile);
    }
  }

  async getLocalPkgInstall(localFullPath: string): Promise<LocalPkgInstallResult> {
    if (!this._localPkgInstall) {
      this._localPkgInstall = {};
    }

    if (!this._localPkgInstall[localFullPath]) {
      this._localPkgInstall[localFullPath] = await checkPkgNeedInstall(
        localFullPath,
        this._installConfig.time
      );
    }

    return this._localPkgInstall[localFullPath];
  }

  async checkLocalPkgFromInstallConfigNeedInstall(): Promise<boolean> {
    const localPkgs = _.get(this._installConfig, "localPkgLinks", {}) as Record<
      string,
      LocalPkgLink
    >;
    for (const nmDir in localPkgs) {
      const localPkg = localPkgs[nmDir];
      const fullPath = Path.join(this._cwd, localPkg.srcDir);
      if ((await this.getLocalPkgInstall(fullPath)).changed) {
        return true;
      }
    }

    return false;
  }

  setLocalDeps(localsByDepth: LocalDepInfo[][]): void {
    const pathsOnly = localsByDepth.map(locals => {
      return locals.map(x => Path.relative(this._cwd, x.fullPath));
    });
    this._installConfig.localsByDepth = pathsOnly;
  }

  getInstallConfigFile(): string {
    return Path.join(this.getFvDir(FYN_INSTALL_CONFIG_FILE));
  }

  setLocalPkgLinks(localLinks: Record<string, LocalPkgLink>): void {
    this._installConfig.localPkgLinks = localLinks;
  }

  // save the config to outputDir
  async saveInstallConfig(): Promise<void> {
    const outputDir = this.getOutputDir();
    const centralDir = _.get(this, "_central._centralDir", false) as string | false;
    const filename = this.getInstallConfigFile();

    if (!(await Fs.exists(outputDir))) {
      return;
    }

    try {
      const outputConfig: InstallConfig = {
        ...this._installConfig,
        // add 5ms to ensure it's newer than fyn-lock.yaml, which was just saved
        // immediately before this
        time: Date.now() + 5,
        centralDir,
        production: this.production,
        layout: this._layout
        // not a good idea to save --run-npm options to install config because
        // future fyn install will automatically run them and would be unexpected.
        // if fynpo bootstrap should run certain npm scripts, user should set those
        // in fynpo config.  and fyn should look into those when detected a fynpo.
        // runNpm: this._runNpm
      };
      await Fs.writeFile(filename, `${JSON.stringify(outputConfig, null, 2)}\n`);
    } catch (err) {
      logger.debug(`saving install config file failed`, err);
    }
  }

  async loadPkgFyn(): Promise<Record<string, unknown> | undefined> {
    this._pkgFyn = await xaa.try(() =>
      fynTil.readJson(Path.resolve(this._cwd, PACKAGE_FYN_JSON))
    );
    return this._pkgFyn;
  }

  async savePkgFyn(pkg?: Record<string, unknown>): Promise<void> {
    pkg = !_.isEmpty(pkg) ? pkg : this._pkgFyn;
    if (!_.isEmpty(pkg)) {
      await xaa.try(() =>
        Fs.writeFile(
          Path.resolve(this._cwd, PACKAGE_FYN_JSON),
          `${JSON.stringify(pkg || this._pkgFyn, null, 2)}\n`
        )
      );
    }
  }

  async loadPkg(_options?: FynOptions): Promise<void> {
    const options = _options || this._options;

    if (options.pkgFile) {
      let pkgFile: string;

      // Search upward for package.json
      if (options.pkgFile === "package.json") {
        let foundDir: string | null = null;

        // pathUpEach stops when callback returns true, but doesn't include that path
        // So we need to check and capture the directory ourselves
        pathUpEach(this._cwd, (path: string) => {
          const testPath = Path.join(path, "package.json");
          if (Fs.existsSync(testPath)) {
            foundDir = path;
            return true; // Stop searching
          }
          return false; // Continue searching
        });

        if (foundDir) {
          // Found package.json - use it
          pkgFile = Path.join(foundDir, "package.json");
          // Update cwd to the directory containing package.json
          this._cwd = foundDir;
        } else {
          // Fallback to original behavior if not found
          pkgFile = Path.resolve(this._cwd, options.pkgFile);
        }
      } else {
        // If a custom pkgFile is specified, use it as-is
        pkgFile = Path.resolve(this._cwd, options.pkgFile);
      }

      logger.debug("package.json file", pkgFile);
      this._pkgFile = pkgFile;
      try {
        this._pkg = await fynTil.readPkgJson(pkgFile, true);
      } catch (err) {
        logger.error("failed to read package.json file", pkgFile);
        logger.error((err as Error).message);
        fynTil.exit(err);
      }
      const pkgFyn = await this.loadPkgFyn();
      if (pkgFyn) {
        logger.debug(`found ${PACKAGE_FYN_JSON}`, pkgFyn);
        _.merge(this._pkg, pkgFyn);
      }
    } else {
      this._pkg = options.pkgData!;
    }
  }

  savePkg(): void {
    Fs.writeFileSync(this._pkgFile, `${JSON.stringify(this._pkg, null, 2)}\n`);
  }

  get npmConfigEnv(): Record<string, string> {
    if (!this._npmConfigEnv) {
      const options = { ...this._options, cache: this._options.fynDir };
      this._npmConfigEnv = npmConfigEnv(this._pkg, options);
    }

    return this._npmConfigEnv;
  }

  get allrc(): FynOptions {
    return this._options;
  }

  get copy(): string[] {
    return this._options.copy || [];
  }

  get central(): FynCentral | false | undefined {
    return this._central;
  }

  get depLocker(): PkgDepLocker {
    return this._depLocker;
  }

  get cwd(): string {
    return this._cwd;
  }

  get initCwd(): string {
    return this._initCwd;
  }

  get forceCache(): string | false {
    return this._options.forceCache && "force-cache";
  }

  get registry(): string | undefined {
    return this._options.registry;
  }

  // offline will disable all remote retrieving
  get offline(): string | false {
    return this._options.offline && "offline";
  }

  get fynlocal(): boolean | undefined {
    return this._options.fynlocal;
  }

  // lock-only allows skip meta retrieval but still retrieve tgz
  get lockOnly(): string | false {
    return this._options.lockOnly && "lock-only";
  }

  get lockTime(): Date | undefined {
    return this._lockTime;
  }

  get showDeprecated(): string | false {
    return this._options.showDeprecated && "show-deprecated";
  }

  get refreshOptionals(): boolean | undefined {
    return this._options.refreshOptionals;
  }

  get ignoreDist(): boolean | undefined {
    return this._options.ignoreDist;
  }

  get production(): boolean | undefined {
    return this._options.production;
  }

  get concurrency(): number | undefined {
    return this._options.concurrency;
  }

  get deepResolve(): boolean | undefined {
    return this._options.deepResolve;
  }

  get preferLock(): boolean | undefined {
    return this._options.preferLock;
  }

  get remoteMetaDisabled(): string | false {
    // force-cache only force use cache when it exists but if it's
    // cache miss then we should retrieve from remote
    return this.lockOnly || this.offline || false;
  }

  get remoteTgzDisabled(): string | false {
    // force-cache only force use cache when it exists but if it's
    // cache miss then we should retrieve from remote
    return this.offline || false;
  }

  get pkgSrcMgr(): PkgSrcManager {
    return this._pkgSrcMgr;
  }

  get fynDir(): string {
    return this._options.fynDir;
  }

  get targetDir(): string {
    return this._options.targetDir;
  }

  get alwaysFetchDist(): boolean | undefined {
    return this._options.alwaysFetchDist;
  }

  get fynTmp(): string {
    return Path.join(this.fynDir, "tmp");
  }

  addLocalPkgWithNestedDep(depInfo: LocalDepInfo): void {
    this.localPkgWithNestedDep.push(depInfo);
  }

  deDupeLocks(): boolean {
    let deDupe = false;

    _.each(this._data!.pkgs, (pkg, pkgName) => {
      const versions = Object.keys(pkg);
      const byMaj = _.groupBy(versions, x => {
        const pts = x.split(".");
        // when major is 0, minor becomes major, ie: 0.x.y => x major
        if (pts[0] === "0") {
          if (pts[1] === "0") {
            return `${pts[0]}.${pts[1]}.${pts[2]}`;
          }
          return `${pts[0]}.${pts[1]}`;
        } else {
          return pts[0];
        }
      });
      const majVersions = Object.keys(byMaj);

      // if all major versions different, then no need to de-dupe anything
      if (majVersions.length === versions.length) {
        return;
      }

      majVersions.forEach(maj => {
        if (byMaj[maj].length > 1) {
          const removed = byMaj[maj].filter(ver => {
            const item = (pkg[ver] as PkgVersion)[DEP_ITEM] as DepItemRef | undefined;
            if (item?._resolveByLock || this._npmLockData) {
              deDupe = true;
              this._depLocker.remove(item!, true);
              return true;
            }
            return false;
          });
          if (removed.length > 0) {
            logger.debug("de-dupe locks by removing versions of", pkgName, removed);
          }
          // TODO: by removing all versions, it will update to the latest, which may be newer
          // than the newest version in lock data, so we should keep newest locked and update
          // all removed ones to it
        }
      });
    });

    return deDupe;
  }

  createLocalPkgBuilder(localsByDepth: LocalDepInfo[][]): LocalPkgBuilder {
    if (!this._localPkgBuilder) {
      this._localPkgBuilder = new LocalPkgBuilder({
        fyn: this,
        localsByDepth
      });
      this.setLocalDeps(localsByDepth);
    }

    return this._localPkgBuilder;
  }

  async resolveDependencies(): Promise<void> {
    await this._initialize();

    this._optResolver = new PkgOptResolver({ fyn: this });

    const doResolve = async ({
      shrinkwrap,
      yarnLock,
      buildLocal = true,
      deDuping = false
    }: {
      shrinkwrap?: NpmLockData | null;
      yarnLock?: YarnLockData;
      buildLocal?: boolean;
      deDuping?: boolean;
    }): Promise<void> => {
      this._data = this._options.data || new DepData();
      this._depResolver = new PkgDepResolver(this._pkg, {
        fyn: this,
        data: this._data,
        shrinkwrap,
        yarnLock,
        optResolver: this._optResolver,
        buildLocal,
        deDuping
      });
      this._depResolver.start();
      await this._depResolver.wait();
    };

    await doResolve({
      shrinkwrap: this._npmLockData,
      yarnLock: this._yarnLock,
      buildLocal: this._options.buildLocal
    });

    if (this._npmLockData) {
      this.depLocker.generate(this._data!);
    }

    if (
      (this._yarnLock || this._npmLockData || this.depLocker.pkgDepChanged) &&
      this.deDupeLocks()
    ) {
      logger.info("changed dependencies and duplicate versions detected => de-duping");
      await doResolve({ buildLocal: false, deDuping: true });
    }
  }

  async fetchPackages(data?: DepData): Promise<unknown> {
    await this._initialize();
    this._distFetcher!.start(data || this._data || this._depResolver!._data);
    return await this._distFetcher!.wait();
  }

  /**
   * Create a lock in FV dir during install, to prevent multiple install
   * being run at the same time.
   *
   * This would just cause second installs to fail instead of causing random
   * weird issues.
   *
   * - Rare but could occur if fyn is used for monorepo and user has script
   *   that run concurrent installs
   *
   * @returns if lock was acquired
   */
  async createInstallLock(): Promise<boolean> {
    await this.createDir(this.getFvDir());
    const fname = this.getFvDir(".installing.lock");
    await createLock(fname, {
      wait: 3000,
      // consider 30 minutes lockfile stale
      stale: 30 * 60 * 1000
    });
    return true;
  }

  /**
   * Remove lock during install
   *
   * @returns none
   */
  async removeInstallLock(): Promise<void> {
    const fname = this.getFvDir(".installing.lock");
    return await unlock(fname);
  }

  /**
   * Get the directory where a package should be installed/extracted into
   *
   * @param name - name of the package
   * @param version - version of the package
   * @param pkg - pkg data
   *
   * @returns dir for package
   */
  getInstalledPkgDir(name = "", version = "", pkg?: PkgInfo): string {
    // in normal layout, promoted package should go to top node_modules dir directly
    if (this.isNormalLayout && pkg && pkg.promoted) {
      return Path.join(this.getOutputDir(), name);
    }

    // it's important that each package is directly extracted to a directory
    // that has name exactly the same as the package because there are code
    // and tools that depend on that.
    // for example: webpack module de-duping seems to depend on that, otherwise
    // the bundle bloats.
    if (version) {
      if (this._noPkgDirMatchName) {
        return Path.join(this.getOutputDir(), FV_DIR, "_", name, version);
      } else {
        return Path.join(this.getOutputDir(), FV_DIR, "_", name, version, name);
      }
    }

    return Path.join(this.getOutputDir(), FV_DIR, "_", name);
  }

  getFvDir(x?: string): string {
    return Path.join(this._cwd, this._options.targetDir, FV_DIR, x || "");
  }

  getOutputDir(x?: string): string {
    return Path.join(this._cwd, this._options.targetDir, x || "");
  }

  getExtraDir(x?: string): string {
    return Path.join(this._cwd, this._options.targetDir, ".extra", x || "");
  }

  clearPkgOutDir(dir: string): Promise<void> {
    return Fs.readdir(dir).each((f: string) => Fs.$.rimraf(Path.join(dir, f)));
  }

  /**
   * Scan FV_DIR for modules saved in the ${name}/${version} format
   * @returns pkgs under fv dir with their versions
   */
  async loadFvVersions(): Promise<Record<string, string[]>> {
    const fvVersions: Record<string, string[]> = {};
    // get dir where all packages are extracted to
    const pkgStoreDir = this.getFvDir("_");
    try {
      for (const pkgName of await Fs.readdir(pkgStoreDir)) {
        if (pkgName === "node_modules" || pkgName.startsWith(".")) {
          continue; //
        }

        const readVersionsOfPkg = async (name: string): Promise<void> => {
          if (!fvVersions[name]) {
            fvVersions[name] = [];
          }

          for (const version of await Fs.readdir(Path.join(pkgStoreDir, name))) {
            fvVersions[name].push(version);
          }
        };

        if (pkgName.startsWith("@")) {
          // handle scoped package names
          for (const name2 of await Fs.readdir(Path.join(pkgStoreDir, pkgName))) {
            const pkgName2 = `${pkgName}/${name2}`;
            await readVersionsOfPkg(pkgName2);
          }
        } else {
          await readVersionsOfPkg(pkgName);
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.error("loadFvVersions failed", err);
      }
    }

    return fvVersions;
  }

  async createPkgOutDir(dir: string, keep?: boolean): Promise<void> {
    try {
      const r = await Fs.$.mkdirp(dir);
      // mkdirp returns null if directory already exist
      // clear directory to prepare it for installing package
      if (r === null && !keep && dir !== this.getOutputDir()) {
        await this.clearPkgOutDir(dir);
      }
    } catch (err) {
      // mkdirp fails with EEXIST if file exist and is not a directory
      if ((err as NodeJS.ErrnoException).code === "EEXIST") {
        // remove it and create as a directory
        await Fs.$.rimraf(dir);
        await Fs.$.mkdirp(dir);
      } else {
        throw err;
      }
    }
  }

  async createDir(dir: string): Promise<void> {
    try {
      await Fs.$.mkdirp(dir);
    } catch (err) {
      // mkdirp fails with EEXIST if file exist and is not a directory
      if ((err as NodeJS.ErrnoException).code === "EEXIST") {
        // remove it and create as a directory
        await Fs.$.rimraf(dir);
        await Fs.$.mkdirp(dir);
      } else {
        throw err;
      }
    }
  }

  // fyn's directory to store all local package linking file
  get linkDir(): string {
    return Path.join(this._options.fynDir, "links");
  }

  async readJson<T = Record<string, unknown>>(file: string, fallback?: T): Promise<T> {
    try {
      return JSON.parse(await Fs.readFile(file)) as T;
    } catch (e) {
      return (fallback !== undefined ? fallback : {}) as T;
    }
  }

  async moveToFv(dir: string, pkg: PkgInfo, pkgJson: PackageJson): Promise<void> {
    const toDir = this.getInstalledPkgDir(pkgJson.name, pkgJson.version, {});

    try {
      await Fs.access(toDir);
      // a copy already exist in FV dir, so remove it
      logger.warn(
        `Removing ${dir} because its version ${pkgJson.version} is different from ${pkg.version}`
      );
      await Fs.$.rimraf(dir);
    } catch (err) {
      logger.debug(`Moving ${dir} to ${toDir} to replace with version ${pkg.version}`);
      await Fs.$.mkdirp(Path.dirname(toDir));
      await Fs.rename(dir, toDir);
    }
  }

  async unlinkLocalPackage(dir: string, reason: string): Promise<void> {
    logger.warn(`Removing ${dir} because it's ${reason}`);
    return await Fs.$.rimraf(dir);
  }

  //
  // A pkg that's to be extracted must:
  //
  // - not have its target dir exist
  // - if exist then must be a dir and have a package.json
  //   with the right name and version
  //
  // If dir exist with proper package.json, then returns it,
  // else returns undefined.
  //
  async ensureProperPkgDir(pkg: PkgInfo, dir?: string): Promise<PkgInfo | null> {
    const fullOutDir = dir || this.getInstalledPkgDir(pkg.name, pkg.version, pkg);

    let ostat: Awaited<ReturnType<typeof Fs.lstat>>;

    try {
      ostat = await Fs.lstat(fullOutDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      return null;
    }

    if (ostat.isSymbolicLink()) {
      await this.unlinkLocalPackage(fullOutDir, "a symlink");
    } else if (!ostat.isDirectory()) {
      await this.unlinkLocalPackage(fullOutDir, "not a directory");
    } else {
      try {
        const pkgJson = await this.loadJsonForPkg(pkg, fullOutDir);
        if (!pkgJson._invalid) {
          return pkgJson;
        }
        await this.moveToFv(fullOutDir, pkg, pkgJson);
      } catch (err) {
        logger.warn(`ensureProperPkgdir:`, err);
      }
    }

    return null;
  }

  async loadJsonForPkg(pkg: PkgInfo, dir?: string): Promise<PkgInfo> {
    const fullOutDir = dir || this.getInstalledPkgDir(pkg.name, pkg.version, pkg);
    const json = (await fynTil.readPkgJson(fullOutDir, true)) as PkgInfo;

    const pkgId = `${pkg.name}@${pkg.version}`;
    const id = `${json.name}@${json.version}`;
    if (json.version !== pkg.version) {
      const cleanVersion = semver.valid(json.version) || semverUtil.clean(json.version);

      if (cleanVersion !== json.version) {
        assert(
          semver.valid(cleanVersion),
          `Pkg ${id} version is not valid semver and fyn was unable to fix it.`
        );
        json._origVersion = json.version;
        json.version = cleanVersion!;
      }
    }

    if (pkg._hasShrinkwrap) json._hasShrinkwrap = true;

    // if _id exist then it should match
    if (json._id && json._id !== pkgId) {
      logger.debug(`readPkgJson - json._id ${json._id} not matched pkg ${pkgId}`);
      json._invalid = true;
      return json;
    }

    // TODO: check npm:pkg-alias in semver
    // assert(
    //   json && json.name === pkg.name && semverUtil.equal(json.version, pkg.version),
    //   `Pkg in ${fullOutDir} ${id} doesn't match ${pkg.name}@${pkg.version}`
    // );

    pkg.dir = json[PACKAGE_RAW_INFO]!.dir;
    pkg.str = json[PACKAGE_RAW_INFO]!.str;

    try {
      const gypFile = Path.join(fullOutDir, "binding.gyp");
      await Fs.lstat(gypFile);

      json.gypfile = true;
      const scr = json.scripts;
      if (_.isEmpty(scr) || (!scr!.install && !scr!.postinstall && !(scr as Record<string, string>).postInstall)) {
        _.set(json, "scripts.install", "node-gyp rebuild");
      }
    } catch (err) {}

    pkg.json = json;

    return json;
  }

  async createSubNodeModulesDir(dir: string): Promise<string> {
    const nmDir = Path.join(dir, "node_modules");
    // const fynIgnoreFile = Path.join(nmDir, FYN_IGNORE_FILE);

    // let ignoreExist = false;

    if (!(await Fs.exists(nmDir))) {
      await Fs.$.mkdirp(nmDir);
    } else {
      // ignoreExist = await Fs.exists(fynIgnoreFile);
    }

    // if (ignoreExist && !this.flatMeta) {
    //   await Fs.unlink(fynIgnoreFile);
    // } else if (!ignoreExist && this.flatMeta) {
    //   await Fs.writeFile(fynIgnoreFile, "");
    // }

    return nmDir;
  }
}

export default Fyn;
export type {
  FynOptions,
  FynConstructorOptions,
  PackageJson,
  PkgInfo,
  InstallConfig,
  LocalPkgLink,
  FynpoData,
  FynpoConfig,
  CliSource,
  LocalDepInfo,
  LocalPkgInstallResult
};