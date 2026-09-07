
import Fs from "./file-ops";
import * as _ from "lodash-es";
import Path from "path";
import logger from "../logger";
import type { NativePromise } from "../types/native-promise";
import { pipeline, type PipelineOptions } from "stream/promises";
import { PACKAGE_RAW_INFO } from "../symbols";
import { PACKAGE_FYN_JSON } from "../constants";
import { FynpoConfigManager, FynpoDepGraph, posixify } from "@fynpo/base";
import { isWin32, retry } from "./base-util";

export interface FynpoConfigData {
  config?: any;
  dir?: string;
  graph?: FynpoDepGraph;
  indirects?: any[];
  [key: string]: any;
}

export interface RawPkgInfo {
  dir: string;
  str: string;
}

export type PkgJsonData = Record<string, any> & {
  [PACKAGE_RAW_INFO]?: RawPkgInfo;
};

export interface DistInfo {
  integrity?: string;
  shasum?: string;
  [key: string]: any;
}

export interface PkgOsCpu {
  os?: string | readonly string[];
  cpu?: string | readonly string[];
  [key: string]: any;
}

/**
 * Pipe streams together and resolve when the pipeline fully completes.
 * Replaces mississippi.pipe with node:stream/promises pipeline.
 */
export const missPipe = (
  ...streams: [
    NodeJS.ReadableStream,
    NodeJS.WritableStream,
    ...(NodeJS.ReadWriteStream | NodeJS.WritableStream | PipelineOptions)[]
  ]
): NativePromise<void> => (pipeline as any)(...streams);

const DIR_SYMLINK_TYPE: "junction" | "dir" = isWin32 ? "junction" : "dir";

/**
 * Check if a value satisfies a list of rules.
 *
 * Mainly to check package.json os and cpu per https://docs.npmjs.com/cli/v6/configuring-npm/package-json#os
 *
 * @param inRules the rules (string, array of strings, or null/undefined)
 * @param userValue value to check
 *
 * @returns true|false
 */
export const checkValueSatisfyRules = (
  inRules?: string | readonly string[] | null,
  userValue?: string
): boolean => {
  const rules: string[] = inRules
    ? (Array.isArray(inRules) ? Array.from(inRules) : [inRules]).filter(Boolean)
    : [];

  // no rules means satisfied
  if (!rules || rules.length === 0) {
    return true;
  }

  // any rule starts with ! means deny the value
  const denies = rules.filter(x => x[0] === "!");

  // any value that's denied would fail immediately
  if (denies.indexOf(`!${userValue}`) >= 0) {
    return false;
  }

  // rules that accepts a value
  const accepts = rules.filter(x => x[0] !== "!");

  // if no explicitly spelled out values to accept then anything not denied
  // is accepted.
  if (accepts.length === 0) {
    return true;
  }

  // explicitly accept value immediately satisfies
  if (rules.indexOf(userValue as string) >= 0) {
    return true;
  }

  // finally not satisfies
  return false;
};

export interface Fyntil {
  isWin32: boolean;
  missPipe: typeof missPipe;
  retry: typeof retry;
  fynpoConfig: FynpoConfigData | Record<string, never> | undefined;
  resetFynpo(): void;
  loadFynpo(cwd?: string): Promise<FynpoConfigData | Record<string, never>>;
  resolveGitMainWorktreeDir(dir: string): Promise<string>;
  removeAuthInfo(rcObj: Record<string, any>): Record<string, any>;
  exit(err?: number | Error | string | boolean | null): never;
  readJson<T = any>(file: string, defaultData?: T): Promise<T>;
  relativePath(from: string, to: string, shouldPosixify?: boolean): string;
  readPkgJson(dirOrFile: string, keepRaw?: boolean, packageFyn?: boolean): Promise<PkgJsonData>;
  symlinkDir(linkName: string, targetName: string, relative?: boolean): Promise<void>;
  symlinkFile(linkName: string, targetName: string): Promise<void>;
  validateExistSymlink(linkName: string, targetPath: string, relative?: boolean): Promise<boolean>;
  checkValueSatisfyRules: typeof checkValueSatisfyRules;
  shaToIntegrity(ss?: string | number | null): string | undefined;
  distIntegrity(dist?: DistInfo): string | undefined;
  checkPkgOsCpu(pkg?: PkgOsCpu): true | string;
  strToBool(v: unknown): boolean;
  isTrueStr(v: unknown): boolean;
  posixify: typeof posixify;
  unSlashNpmScope(npmDepPath: string, replacer?: string): string;
  getGlobalNodeModules(): string;
  fynDir: string;
}

const fyntil: Fyntil = {
  isWin32,

  missPipe,

  retry,

  fynpoConfig: undefined,

  resetFynpo(): void {
    fyntil.fynpoConfig = undefined;
  },

  async loadFynpo(cwd: string = process.cwd()): Promise<FynpoConfigData | Record<string, never>> {
    if (fyntil.fynpoConfig) {
      return fyntil.fynpoConfig;
    }

    const fcm = new FynpoConfigManager({ cwd });
    const config = await fcm.load();

    if (config) {
      // Only log if not already detected by parent process
      if (!process.env.FYN_FYNPO_DIR) {
        logger.info(`Detected a ${fcm.repoType} at ${fcm.topDir}`);
        process.env.FYN_FYNPO_DIR = fcm.topDir;
      }
      const graph = new FynpoDepGraph({
        cwd: fcm.topDir,
        patterns: config.packages,
        noFynLocal: config.noFynLocal,
      });
      await graph.resolve();

      return (fyntil.fynpoConfig = {
        config,
        dir: fcm.topDir,
        graph,
        indirects: []
      });
    } else {
      return (fyntil.fynpoConfig = {});
    }
  },

  /**
   * Detect if `dir` lives inside a git linked worktree and, if so, resolve the
   * equivalent directory in the repo's main worktree.
   *
   * fynpo uses `<monorepo>/.fynpo/_store` as the central package store. When the
   * monorepo is checked out as a git linked worktree, each worktree would
   * otherwise get its own `.fynpo` store - wasteful and slow. Pointing them at
   * the main worktree's store lets all worktrees share one central store.
   *
   * @param dir directory to resolve (typically the fynpo monorepo top dir)
   * @returns the equivalent directory in the main worktree, or `dir` unchanged
   *          when it's not in a git repo or already in the main worktree.
   */
  async resolveGitMainWorktreeDir(dir: string): Promise<string> {
    const startDir = Path.resolve(dir);

    // walk up to locate the .git entry for the tree containing `dir`
    let treeTop = startDir;
    let gitPath: string | undefined;
    let gitStat: any;
    for (;;) {
      try {
        const p = Path.join(treeTop, ".git");
        gitStat = await Fs.stat(p);
        gitPath = p;
        break;
      } catch (err: any) {
        if (err.code !== "ENOENT") {
          throw err;
        }
      }
      const parent = Path.dirname(treeTop);
      if (parent === treeTop) {
        break;
      }
      treeTop = parent;
    }

    // not in a git repo, or .git is a real directory (main / normal worktree)
    if (!gitPath || gitStat.isDirectory()) {
      return dir;
    }

    try {
      // a linked worktree has a `.git` file: "gitdir: <repo>/.git/worktrees/<name>"
      const gitFile = await Fs.readFile(gitPath, "utf8");
      const m = gitFile.match(/^gitdir:\s*(.+)$/m);
      if (!m) {
        return dir;
      }

      let worktreeGitDir = m[1].trim();
      if (!Path.isAbsolute(worktreeGitDir)) {
        worktreeGitDir = Path.resolve(treeTop, worktreeGitDir);
      }

      // `commondir` points to the main repo's git dir (usually "../..")
      const commondir = (await Fs.readFile(Path.join(worktreeGitDir, "commondir"), "utf8")).trim();
      const commonGitDir = Path.isAbsolute(commondir)
        ? commondir
        : Path.resolve(worktreeGitDir, commondir);

      // only handle the standard `<mainTree>/.git` layout
      if (Path.basename(commonGitDir) !== ".git") {
        return dir;
      }

      const mainTreeTop = Path.dirname(commonGitDir);
      // preserve dir's position relative to its own worktree root
      const rel = Path.relative(treeTop, startDir);
      return Path.join(mainTreeTop, rel);
    } catch (err: any) {
      logger.debug(`resolveGitMainWorktreeDir failed for ${dir}: ${err.message}`);
      return dir;
    }
  },

  removeAuthInfo(rcObj: Record<string, any>): Record<string, any> {
    const rmObj: Record<string, any> = {};
    for (const key in rcObj) {
      const lower = key.toLowerCase();
      if (!lower.includes("auth") && !lower.includes("password") && !lower.includes("otp")) {
        rmObj[key] = rcObj[key];
      }
    }

    return rmObj;
  },

  exit(err?: number | Error | string | boolean | null): never {
    // a numeric arg is an explicit exit code (e.g. a script's exit code) and is
    // passed through as-is; otherwise treat a truthy arg as an error (exit 1).
    if (typeof err === "number") {
      return process.exit(err);
    }
    return process.exit(err ? 1 : 0);
  },

  async readJson<T = any>(file: string, defaultData?: T): Promise<T> {
    try {
      const data = await Fs.readFile(file, "utf8");
      return JSON.parse(data);
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        const msg = `Failed to read JSON file ${file} - ${err.message}`;
        logger.error(msg);
        throw new Error(msg);
      }

      if (defaultData !== undefined) {
        return defaultData;
      }

      throw err;
    }
  },

  relativePath(from: string, to: string, shouldPosixify: boolean = false): string {
    const rel = Path.relative(from, to);
    if (!Path.isAbsolute(rel) && !rel.startsWith(".")) {
      return `.${Path.sep}${rel}`;
    }
    return shouldPosixify ? posixify(rel) : rel;
  },

  async readPkgJson(dirOrFile: string, keepRaw: boolean = false, packageFyn: boolean = false): Promise<PkgJsonData> {
    const isDir = !dirOrFile.endsWith(".json");
    const dir = isDir ? dirOrFile : Path.dirname(dirOrFile);
    const files = ["package.json", packageFyn && PACKAGE_FYN_JSON].filter(Boolean) as string[];
    const finalJson: PkgJsonData = {};
    for (const fname of files) {
      const file = Path.join(dir, fname);
      try {
        const str = await Fs.readFile(file, "utf8");
        const json = JSON.parse(str.trim());
        _.merge(finalJson, json);
        if (keepRaw && fname !== PACKAGE_FYN_JSON) {
          finalJson[PACKAGE_RAW_INFO] = { dir, str };
        }
      } catch (err: any) {
        if (fname !== PACKAGE_FYN_JSON || err.code !== "ENOENT") {
          throw new Error(`Failed Reading ${file}: ${err.message}`);
        }
      }
    }
    return finalJson;
  },

  symlinkDir: async (linkName: string, targetName: string, relative: boolean = false): Promise<void> => {
    await Fs.symlink(
      relative && Path.isAbsolute(targetName)
        ? Path.relative(Path.dirname(linkName), targetName)
        : targetName,
      linkName,
      DIR_SYMLINK_TYPE
    );
  },

  symlinkFile: async (linkName: string, targetName: string): Promise<void> => {
    if (isWin32) {
      // Windows symlink require admin permission
      // And Junction is only for directories
      // Too bad, just make a hard link.
      await Fs.link(targetName, linkName);
    } else {
      await Fs.symlink(targetName, linkName);
    }
  },

  //
  // - check if symlink exist, if not, return false
  // - make sure a existing symlink points to targetPath
  // - if not, remove it, return false
  // - finally return true
  //
  validateExistSymlink: async (linkName: string, targetPath: string, relative: boolean = false): Promise<boolean> => {
    let actualTarget: string | undefined;
    let existTarget: boolean | string | undefined;
    //
    // Check if the dir already exist and try to read it as a symlink
    //
    try {
      existTarget = await Fs.readlink(linkName);
      const absoluteTarget = Path.isAbsolute(targetPath);
      if (DIR_SYMLINK_TYPE === "junction" && !absoluteTarget) {
        actualTarget = targetPath = Path.join(linkName, "..", targetPath) + "\\";
      } else {
        actualTarget =
          relative && absoluteTarget
            ? Path.relative(Path.dirname(linkName), targetPath)
            : targetPath;
      }
    } catch (e: any) {
      existTarget = e.code !== "ENOENT";
    }

    // If it exist but doesn't match targetDir
    if (existTarget && existTarget !== actualTarget) {
      logger.debug("local link exist", existTarget, "not match new one", actualTarget);
      // remove exist target so a new one can be created
      existTarget = false;
      try {
        // try to unlink it as a symlink/file first
        await Fs.unlink(linkName);
      } catch (e: any) {
        // else remove the directory
        await Fs.$.rimraf(linkName);
      }
    } else {
      logger.debug("local link existTarget", existTarget, "match new target", actualTarget);
    }

    return Boolean(existTarget);
  },

  checkValueSatisfyRules,

  shaToIntegrity(ss?: string | null): string | undefined {
    if (!ss) {
      return undefined;
    }
    if (ss.startsWith("sha")) {
      return ss;
    }
    return `sha1-${Buffer.from(ss, "hex").toString("base64")}`;
  },

  distIntegrity(dist: DistInfo = {}): string | undefined {
    if (dist.integrity) {
      return dist.integrity;
    }
    return fyntil.shaToIntegrity(dist.shasum);
  },

  checkPkgOsCpu: (pkg: PkgOsCpu = {}): true | string => {
    if (pkg.hasOwnProperty("os") && !checkValueSatisfyRules(pkg.os, process.platform)) {
      return `your platform ${process.platform} doesn't satisfy required os ${pkg.os}`;
    }

    if (pkg.hasOwnProperty("cpu") && !checkValueSatisfyRules(pkg.cpu, process.arch)) {
      return `your cpu/arch ${process.arch} doesn't satisfy required cpu ${pkg.cpu}`;
    }

    return true;
  },

  /**
   * Convert a string to a bool value. Considering 0, off, false, no to be `false`, else true.
   *
   * @param v value to check
   * @returns true or false
   */
  strToBool: (v: unknown): boolean => {
    if (!v) {
      return false;
    }

    const lv = String(v).toLowerCase();

    if (lv === "0" || lv === "off" || lv === "false" || lv === "no") {
      return false;
    }

    return true;
  },

  /**
   * Check if a string looks like a true bool value, considering 1, on, true, yes to be `true`, else `false`
   *
   * @param v value to check
   * @returns true or false
   */
  isTrueStr: (v: unknown): boolean => {
    if (!v) {
      return false;
    }

    const lv = String(v).toLowerCase();

    if (lv === "1" || lv === "on" || lv === "true" || lv === "yes") {
      return true;
    }

    return false;
  },

  posixify,

  /**
   * Take a npm dependency path separated by / and replace the / that's meant for a npm scope with '+'
   *
   * @param npmDepPath dep path
   * @param replacer string to replace the slash with
   * @returns dep path where npm scope's / replaced with '+'
   */
  unSlashNpmScope(npmDepPath: string, replacer: string = "+"): string {
    return npmDepPath.replace(/(\@[^\/]+)\//g, (_a, b) => `${b}${replacer}`);
  },

  getGlobalNodeModules(): string {
    const nodeDir = Path.dirname(process.execPath);
    if (process.platform === "win32") {
      // windows put node binary under <installed_dir>/node.exe
      // and node_modules under <installed_dir>/node_modules
      return Path.join(nodeDir, "node_modules");
    } else {
      // node install on unix put node binary under <installed_dir>/bin/node
      // and node_modules under <installed_dir>/lib/node_modules
      return Path.join(Path.dirname(nodeDir), "lib/node_modules");
    }
  },

  fynDir:
    Path.basename(__dirname) === "util" ? Path.join(__dirname, "../..") : Path.join(__dirname, ".."),
};

export { fyntil };
export default fyntil;
