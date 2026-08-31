import Fs from "fs";
const pFs = Fs.promises;
import Path from "path";
import { logger } from "./logger";
import _ from "lodash";
import { cosmiconfigSync } from "cosmiconfig";
import shell from "shelljs";
import { makeOptionalRequire } from "optional-require";
import {
  FynpoDepGraph,
  PackageBasicInfo,
  PackageInfo,
  PackageRef,
  resolvePackagesConfig,
  makeGitignoreMatcher,
} from "@fynpo/base";
import os from "os";
import { startMetaMemoizer } from "./meta-memoizer";

export const defaultTagTemplate = `fynpo-rel-{YYYY}{MM}{DD}-{COMMIT}`;

const xrequire = eval("require");

const optionalRequire = makeOptionalRequire(xrequire);

/**
 * Make a publish tag from template
 * - template is a string with special tokens in `{}`
 * - `{DD}` - two digit date
 * - `{MM}` - two digit month
 * - `{YYYY}` - four digit year
 * - `{COMMIT}` - first 8 chars from git commit hash
 * - `{hh}` - two digit hour in 24 format
 * - `{mm}` - two digit minute
 * - `{ss}` - two digit second
 *
 * @param tmpl publish tag template
 */
export function makePublishTag(tmpl: string, { date = undefined, gitHash = "" } = {}): string {
  const d = date || new Date();
  const replacers = {
    "{DD}": _.padStart(`${d.getDate()}`, 2, "0"),
    "{MM}": _.padStart(`${d.getMonth() + 1}`, 2, "0"),
    "{YYYY}": _.padStart(`${d.getFullYear()}`, 4, "0"),
    "{COMMIT}": gitHash.substr(0, 8),
    "{hh}": `${d.getHours()}`.padStart(2, "0"),
    "{mm}": `${d.getMinutes()}`.padStart(2, "0"),
    "{ss}": `${d.getSeconds()}`.padStart(2, "0"),
  };

  const newTag = (tmpl || defaultTagTemplate).replace(/{[^}]+}/g, (token) => {
    if (replacers[token]) {
      return replacers[token];
    }
    const valid = Object.keys(replacers).join(", ");
    throw new Error(
      `unknown token '${token}' in command.publish.gitTagTemplate - valid tokens are: ${valid}`
    );
  });

  return newTag;
}

/**
 * Make a git tag search term from the publish tag template
 *
 * @param tmpl
 * @returns
 */
export function makePublishTagSearchTerm(tmpl: string): string {
  return (tmpl || defaultTagTemplate).replace(/{[^}]+}/g, "*").replace(/\*+/g, "*");
}

/**
 * Subject of the git commit a selective (partial) publish creates.
 *
 * It must keep `startsWith("[Publish]")` true, because publish.ts identifies publish commits
 * that way and the commitlint config ignores commits starting with it.
 */
export const selectivePublishSubject = "[Publish][Selective]";

/** prefix that puts selective release tags in their own namespace */
export const selectiveTagPrefix = "selective-";

/**
 * Subject line for the publish commit.
 *
 * @param selective whether only a subset of packages is being released
 */
export function makePublishCommitSubject(selective: boolean): string {
  return selective ? selectivePublishSubject : "[Publish]";
}

/**
 * Normalize the `--only` selection and expand it across version lock groups.
 *
 * Publishing half of a version lock group would break the invariant the locks exist to
 * enforce, so selecting any member pulls in the whole group.
 *
 * @param only the names given to --only
 * @param versionLocks lock groups from fynpo.json
 * @returns the expanded set of names, or undefined when nothing was selected
 */
export function expandSelection(only: string[], versionLocks: string[][] = []): Set<string> {
  const selection = new Set([].concat(only || []).filter(Boolean));

  if (selection.size === 0) {
    return undefined;
  }

  for (const group of versionLocks || []) {
    if (group.some((name) => selection.has(name))) {
      group.forEach((name) => selection.add(name));
    }
  }

  return selection;
}

/**
 * Make the git tag template for a selective release.
 *
 * Selective releases must NOT be found by `getLatestTag`, whose `--match` term is derived from
 * the full-release template. `git describe --match` anchors the pattern against the whole tag
 * name, so prefixing is what keeps the two namespaces apart: `fynpo-rel-*` cannot match
 * `selective-fynpo-rel-...`. That is the whole mechanism by which a selective release leaves
 * the changelog boundary where it was, so the next run still sees every other package's commits.
 *
 * Suffixing would NOT work - `fynpo-rel-*` would happily match `fynpo-rel-...-selective`.
 *
 * @param tmpl the full-release tag template
 */
export function makeSelectiveTagTemplate(tmpl?: string): string {
  return `${selectiveTagPrefix}${tmpl || defaultTagTemplate}`;
}

/**
 * Parse the package names out of a `[Publish]` commit body.
 *
 * The body lists what was released, one per line:
 * ```
 *  - optional-import@1.0.0
 * ```
 *
 * @param body full commit message
 * @returns package names, without versions
 */
export function parsePublishedPackageNames(body: string): string[] {
  return body
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => x.startsWith(`- `) && x.lastIndexOf("@") > 2)
    .map((x) => x.substring(2, x.lastIndexOf("@")));
}

/**
 * Resolve which remote a release tag should be pushed to.
 *
 * A tag points at a commit, not a branch, so a branch with no upstream is a perfectly normal
 * place to release from - it must not fail the push, and it must never throw. The upstream is
 * consulted first only because it names the remote the user is already working against; after
 * that `origin` and then a lone configured remote are the only unambiguous answers.
 *
 * With several remotes and nothing pointing at one of them, guessing would push a release tag
 * somewhere the user did not ask for, so this gives up instead and the caller leaves the tag
 * local.
 *
 * @param gitStatus stdout of `git status -b --porcelain=v2`
 * @param gitRemotes stdout of `git remote`
 * @returns the remote name, or `""` when none can be determined
 */
export function resolveTagRemote(gitStatus: string, gitRemotes: string): string {
  const upstream = (gitStatus || "")
    .split("\n")
    .map((x) => x.trim())
    .find((x) => x.startsWith("# branch.upstream "));

  if (upstream) {
    // `# branch.upstream <remote>/<branch>` - a branch name may contain `/`, a remote may not,
    // so the remote is everything up to the first `/`
    const remote = upstream.split(/\s+/)[2];
    if (remote) {
      return remote.split("/")[0];
    }
  }

  const remotes = (gitRemotes || "")
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

  if (remotes.includes("origin")) {
    return "origin";
  }

  return remotes.length === 1 ? remotes[0] : "";
}

/**
 * Did an `npm publish` fail only because the registry already has that exact version?
 *
 * A release that resumes after an interrupted one re-publishes packages the earlier run already
 * shipped, and npm answers those with EPUBLISHCONFLICT. The desired end state already holds, so
 * that is no reason to skip the release tag - before FPO-56 one such conflict cost the tag for a
 * release whose 25 packages were all correctly on npm.
 *
 * Only the conflict is benign. EPUBLISHCONFLICT is a 403, but so is having no publish rights to
 * the scope, so the conflict itself has to be named in the output rather than the status code -
 * and when npm reports which version it conflicted with, that has to be the version being
 * published.
 *
 * @param output combined stdout/stderr of the failed `npm publish`
 * @param version the version that was being published
 * @returns true when the registry already has this version
 */
export function isAlreadyPublishedError(output: string, version: string): boolean {
  const text = output || "";

  if (
    !/EPUBLISHCONFLICT/.test(text) &&
    !/cannot publish over the previously published/i.test(text)
  ) {
    return false;
  }

  // `You cannot publish over the previously published versions: 2.0.0.` - the trailing period
  // ends the sentence, it is not part of the version
  const reported = text.match(/previously published versions?:\s*([^\s,]+)/i);
  if (reported) {
    return reported[1].replace(/\.+$/, "") === version;
  }

  // npm named the conflict but not the version. Each publish command uploads exactly one
  // tarball, so the conflict can only be about that tarball's version.
  return true;
}

export const locateGlobalNodeModules = async () => {
  //
  const nodeBinDir = Path.dirname(process.argv[0]);
  const nm = "node_modules";

  // 1. check ./node_modules (windows)
  // 2. check ../node_modules
  // 3. check ../lib/node_modules (unix)

  const checks = ["", "..", ["..", "lib"]];

  for (const chk of checks) {
    const dir = Path.join(...[nodeBinDir].concat(chk, nm));
    try {
      const stat = await pFs.stat(dir);
      if (stat.isDirectory()) {
        return dir;
      }
    } catch (e) {
      //
    }
  }

  return "";
};

export const locateGlobalFyn = async (globalNmDir = null) => {
  globalNmDir = globalNmDir || (await locateGlobalNodeModules());

  if (!globalNmDir) {
    logger.error("Unable to locate your global node_modules from", process.argv[0]);
    return {};
  }

  try {
    const dir = Path.join(globalNmDir, "fyn");
    const pkgJson = xrequire(Path.join(dir, "package.json"));
    return {
      dir,
      pkgJson,
    };
  } catch (e) {
    return {};
  }
};

export const loadFynpoConfig = (cwd: string = process.cwd(), configPath?: string) => {
  const explorer = cosmiconfigSync("fynpo", {
    searchPlaces: ["fynpo.config.js", "fynpo.json", "lerna.json"],
  });
  const explicitPath = configPath ? Path.resolve(cwd, configPath) : undefined;
  const explore = explicitPath ? explorer.load : explorer.search;
  const searchPath = explicitPath ? explicitPath : cwd;
  const config = explore(searchPath);

  return config ? config : null;
};

export const loadConfig = (cwd = process.cwd(), commitlint = false) => {
  let fynpoRc: any = {};
  let dir = cwd;
  let fileName = "";

  const data = loadFynpoConfig(cwd);

  if (data && !data.isEmpty) {
    fileName = data.filepath ? Path.basename(data.filepath) : "";
    dir = data.filepath ? Path.dirname(data.filepath) : cwd;
    if (fileName === "lerna.json" && !data.config.fynpo) {
      logger.info("found lerna.json at", dir, "adding fynpo signature");
      fynpoRc = { ...data.config, fynpo: true };
      Fs.writeFileSync(Path.join(dir, "lerna.json"), JSON.stringify(fynpoRc, null, 2) + "\n");
    } else {
      fynpoRc = data.config;
    }
  } else {
    fileName = commitlint ? "fynpo.config.js" : "fynpo.json";
    dir = cwd;

    logger.info(`creating ${fileName} at ${cwd}.`);
    const dest = Path.join(cwd, fileName);

    if (commitlint) {
      const srcTmplDir = Path.join(__dirname, "../templates");
      const src = Path.join(srcTmplDir, fileName);
      if (Fs.existsSync(src)) {
        shell.cp(src, dest);
        fynpoRc = optionalRequire(src) || {};
      }
    } else {
      fynpoRc = {
        changeLogMarkers: ["## Packages", "## Commits"],
        command: { publish: { tags: {}, versionTagging: {} } },
      };
      Fs.writeFileSync(dest, `${JSON.stringify(fynpoRc, null, 2)}\n`);
    }
  }

  //
  // No `patterns` alias any more. `patterns` bypasses auto-search and scans by glob directly,
  // but `include` is meant to FILTER what auto-search found, not replace the search. Aliasing
  // it would silently turn auto-search off for every config that sets `include` - including
  // the historical array shape. The raw `packages` config is carried through instead, and
  // resolved by readFynpoPackages / FynpoDepGraph. See FPO-17.
  //

  return { fynpoRc, dir, fileName };
};

export const getRootScripts = (cwd = process.cwd()) => {
  const config = JSON.parse(Fs.readFileSync(Path.join(cwd, "package.json")).toString());
  return config.scripts || {};
};

export const generateLintConfig = () => {
  const config = {
    /*
     * Resolve and load @commitlint/config-conventional from node_modules.
     * Referenced packages must be installed
     */
    extends: ["@commitlint/config-conventional"],
    /*
     * Parser preset configuration
     */
    parserPreset: {
      parserOpts: {
        headerPattern: /^\[([^\]]+)\] ?(\[[^\]]+\])? +(.+)$/,
        headerCorrespondence: ["type", "scope", "subject"],
      },
    },
    /*
     * Any rules defined here will override rules from @commitlint/config-conventional
     */
    rules: {
      "type-enum": [2, "always", ["patch", "minor", "major", "chore"]],
    },
    /*
     * Functions that return true if commitlint should ignore the given message.
     */
    ignores: [(commit) => commit.startsWith("[Publish]") || commit.includes("Update changelog")],
    /*
     * Whether commitlint uses the default ignore rules.
     */
    defaultIgnores: true,
    /*
     * Custom URL to show upon failure
     */
    helpUrl: "https://github.com/conventional-changelog/commitlint/#what-is-commitlint",
  };

  return { ...config };
};

export const timer = () => {
  const startTime = Date.now();
  return () => Date.now() - startTime;
};

const mergeOpts = (options) => {
  options = _.extend(
    {
      headerPattern: /^\[([^\]]+)\] ?(\[[^\]]+\])? +(.+)$/,
      headerCorrespondence: ["type", "scope", "subject"],
    },
    options
  );

  if (typeof options.headerPattern === "string") {
    options.headerPattern = new RegExp(options.headerPattern);
  }

  if (typeof options.headerCorrespondence === "string") {
    options.headerCorrespondence = options.headerCorrespondence.split(",");
  }

  return options;
};

export const lintParser = (commit, options) => {
  options = mergeOpts(options);

  if (!commit || !commit.trim()) {
    logger.error("Commit message empty");
    return {};
  }
  const headerCorrespondence = _.map(options.headerCorrespondence, (part) => part.trim());
  const headerMatch = commit.match(options.headerPattern);
  const header = {};

  if (headerMatch) {
    _.forEach(headerCorrespondence, (partName, index) => {
      const partValue = headerMatch[index + 1] || null;
      header[partName] = partValue;
    });
  } else {
    _.forEach(headerCorrespondence, function (partName) {
      header[partName] = null;
    });
  }

  return header;
};

/**
 * Make a detector for packages that live in a *different* git repo nested inside
 * the monorepo - a plain nested clone, a submodule, or a linked worktree.
 *
 * Such a package cannot be released by this repo: every git operation in the
 * release path (change detection, commit collation, the publish commit's changed
 * file list, staging bumped versions) runs against the outer repo, which has no
 * commits and no tracked files for those paths. Left alone they silently appear
 * in a release before the first tag exists, then silently vanish from every
 * release after it.
 *
 * Detection walks up from the package dir to - but not including - the monorepo
 * root, looking for a `.git` entry. It tests for existence rather than a
 * directory because a submodule or worktree records `.git` as a *file*.
 *
 * @param cwd - monorepo root
 *
 * @returns function taking a package path relative to the root, returning the
 *   dir of the foreign repo that owns it, or `undefined` if this repo owns it
 */
export function makeForeignRepoDetector(cwd: string): (pkgPath: string) => string | undefined {
  const cache = new Map<string, string | undefined>();

  const findRoot = (dir: string): string | undefined => {
    if (!dir || dir === "." || dir === Path.sep) {
      return undefined;
    }
    if (cache.has(dir)) {
      return cache.get(dir);
    }
    // `.git` may be a dir (clone) or a file (submodule / worktree)
    const found = Fs.existsSync(Path.join(cwd, dir, ".git")) ? dir : findRoot(Path.dirname(dir));
    cache.set(dir, found);
    return found;
  };

  return (pkgPath: string) => (pkgPath ? findRoot(pkgPath) : undefined);
}

/**
 * Make a predicate that decides if a package is eligible to be published.
 *
 * Driven by the `packages` config (see `PackageRef` - supports `name:`, `id:`,
 * `path:`, `/regex/` and globs):
 *
 * - `publishInclude` - allow list. When non-empty, only packages matching it
 *   are eligible. Absent or empty means every package is eligible.
 * - `publishExclude` - deny list, applied after the allow list and always wins.
 *
 * `packages` given as an array is the historical shape and means `publishInclude`.
 *
 * The allow list is checked first so the config fails closed: a newly added
 * package under an unlisted path is not publishable until someone says so.
 *
 * A gitignored package is NEVER publishable, and this veto outranks everything -
 * `publishInclude` naming it does not lift it. Such a package is almost always a
 * nested clone of some other repo that lives here for local linking; releasing it
 * from this repo is never right. The veto is independent of
 * `autoSearch.respectGitignore`, which only governs discovery. See FPO-17.
 *
 * This is only about publishing. Discovery, bootstrap and build never consult it.
 * A package's own `"private": true` is a separate, independent veto.
 *
 * @param fynpoRc - fynpo config
 * @param cwd - repo root, used to read gitignore rules
 *
 * @returns predicate taking a package's info, `true` if it may be published
 */
export function makePublishFilter(
  fynpoRc: any,
  cwd: string = process.cwd()
  // PackageBasicInfo, not PackageInfo: this only ever reads name / id / path, and demanding
  // the full shape made every FynpoPackageInfo caller a type error (FPO-41)
): (pkgInfo: PackageBasicInfo) => boolean {
  const config = resolvePackagesConfig(_.get(fynpoRc, "packages"));
  const toRefs = (list: string[]) => list.map((ref: string) => new PackageRef(ref));

  const include = toRefs(config.publishInclude);
  const exclude = toRefs(config.publishExclude);
  const gitignore = makeGitignoreMatcher(cwd);

  return (pkgInfo: PackageBasicInfo): boolean => {
    if (!pkgInfo) {
      return false;
    }
    if (gitignore.hasRules && gitignore.ignores(pkgInfo.path)) {
      return false;
    }
    if (include.length > 0 && !include.find((ref) => ref.match(pkgInfo))) {
      return false;
    }
    return !exclude.find((ref) => ref.match(pkgInfo));
  };
}

/**
 * match versionLocks config to packages and generate the
 * mapping of locked packages.
 *
 * @param versionLocks - version locks config
 * @param graph - packages dep graph
 * @param byField - generate lock mapping by field, `name`, `id`, or `path`
 *
 * @returns version lock map
 */
export function makeVersionLockMap(
  versionLocks: string[][],
  graph: FynpoDepGraph,
  byField = "name"
): Record<string, string[]> {
  return versionLocks.reduce((mapping, locks) => {
    const lockRef = locks.map((ref: string) => new PackageRef(ref));

    const foundLocks = [];
    _.each(graph.packages.byId, (pkgInfo: PackageInfo, _id: string) => {
      const matched = lockRef.find((pkgRef) => pkgRef.match(pkgInfo));
      if (matched) {
        if (mapping[pkgInfo.path]) {
          logger.error(`package ${pkgInfo.name} at ${pkgInfo.path} version is already locked`);
        } else {
          mapping[pkgInfo[byField]] = foundLocks;
          foundLocks.push(pkgInfo[byField]);
        }
      }
    });
    return mapping;
  }, {});
}

let fynExecutable: string;

/**
 * Get path to fyn's executable file
 *
 * @returns
 */
export function getFynExecutable() {
  if (fynExecutable) {
    return fynExecutable;
  }
  fynExecutable = xrequire.resolve("fyn");

  const nodeDir = process.argv[0].replace(os.homedir(), "~");
  const fynDir = `.${Path.sep}${Path.relative(process.cwd(), fynExecutable)}`;

  logger.info(`Executing fyn with '${nodeDir} ${fynDir}'`);

  return fynExecutable;
}

let warnGlobalFynVersion = false;

/**
 * Check and warn if global fyn's version is different from fynpo's fyn version.
 */
export async function checkGlobalFynVersion() {
  if (warnGlobalFynVersion) {
    return;
  }
  warnGlobalFynVersion = true;
  getFynExecutable();

  const fynPkgJson = xrequire("fyn/package.json");

  const globalFynInfo = await locateGlobalFyn();
  if (globalFynInfo.dir) {
    if (globalFynInfo.pkgJson.version !== fynPkgJson.version) {
      logger.warn(
        `You have fyn installed globally but its version ${globalFynInfo.pkgJson.version} \
is different from fynpo's internal version ${fynPkgJson.version}`
      );
    }
  }
}

let metaMemoizerOpts: string;

/**
 * Start the server for multiple fyn process to memoize and share package meta info
 * during the same fynpo bootstrap session.
 *
 * @returns
 */
export async function startFynMetaMemoizer() {
  if (metaMemoizerOpts !== undefined) {
    return metaMemoizerOpts;
  }
  metaMemoizerOpts = "";

  try {
    const metaMemoizer = await startMetaMemoizer();
    metaMemoizerOpts = `--meta-mem=http://localhost:${metaMemoizer.info.port}`;
  } catch (err) {
    //
  }

  return metaMemoizerOpts;
}
