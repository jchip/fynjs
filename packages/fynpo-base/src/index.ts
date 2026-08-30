import Path from "path";
import { promises as Fs } from "fs";
import { filterScanDir } from "filter-scan-dir";
import mm from "minimatch";
import _ from "lodash";
import { groupMM, MMGroups } from "./minimatch-group.js";
import { resolvePackagesConfig, discoveryPatterns } from "./packages-config.js";
import { makeGitignoreMatcher } from "./gitignore.js";

export * from "./fynpo-dep-graph.js";

export * from "./fynpo-config.js";

export * from "./packages-config.js";

export * from "./gitignore.js";

export * from "./util.js";

export * as caching from "./caching.js";

/**
 * Information about a package within the mono-repo
 */
export type PackageInfo = {
  /** name from package.json */
  name: string;
  /** version from package.json */
  version: string;
  /** dependencies from package.json */
  dependencies: Record<string, string>;
  /** devDependencies from package.json */
  devDependencies: Record<string, string>;
  /** optionalDependencies from package.json */
  optionalDependencies: Record<string, string>;
  /** peerDependencies from package.json */
  peerDependencies: Record<string, string>;
  /** local dependencies by type */
  localDepsByType: {
    dep: string[];
    dev: string[];
    opt: string[];
  };
  /** all local dependencies */
  localDeps: string[];
  /** all local dependents */
  dependents: string[];
  /** all indirect local dependencies */
  indirectDeps: string[];
  /**
   * path to package dir from mono-repo top dir
   * - not full path
   * - always uses / for path separator, even on windows
   */
  path: string;
  /**
   * package dir name only
   * - If npm scope is part of the dir name, it will be included. like `"@scope/name"`
   */
  pkgDir: string;
  /**
   * path to package's package.json file
   * - not full path
   * - always uses / for path separator, even on windows
   */
  pkgFile: string;
  /** raw string form of package.json */
  pkgStr: string;
  /** package.json object */
  pkgJson: any;
  /** TODO */
  installed: boolean;
};

/**
 * Take an array of packages and figure out their dependencies on each other
 *
 * @param packages - array of packages
 */
function processDirectDeps(packages) {
  const add = (name, deps, type) => {
    const depPkg = packages[name];

    _.each(deps, (semver, depName) => {
      if (!packages.hasOwnProperty(depName)) {
        return;
      }

      depPkg.localDeps.push(depName);
      packages[depName].dependents.push(name);
      depPkg.localDepsByType[type].push(depName);
    });
  };

  _.each(packages, (pkg, name) => {
    add(name, pkg.dependencies, "dep");
    add(name, pkg.devDependencies, "dev");
    add(name, pkg.optionalDependencies, "opt");
  });
}

/**
 * Take an array of packages and figure out their indirect dependencies through each other
 *
 * @param packages - array of packages
 * @param circulars - array of package pairs that depend on each other
 */
function processIndirectDeps(packages, circulars) {
  let change = 0;

  /**
   * @param info the package whose indirect deps we are accumulating
   * @param deps deps to walk
   * @param seen packages already expanded in THIS traversal
   */
  const add = (info, deps, seen: Set<string>) => {
    _.each(deps, (dep) => {
      const depPkg = packages[dep];
      if (info.localDeps.indexOf(dep) < 0 && info.indirectDeps.indexOf(dep) < 0) {
        change++;
        info.indirectDeps.push(dep);
        depPkg.dependents.push(info.name);
      }
      if (depPkg.localDeps.indexOf(info.name) >= 0) {
        const x = [info.name, depPkg.name].sort().join(",");
        if (circulars.indexOf(x) < 0) {
          circulars.push(x);
        }
        return;
      }
      // The check above only catches a cycle that comes straight back to `info`. A cycle
      // between two OTHER packages - e.g. aveazul devDepends on bluebird while bluebird
      // depends on aveazul - would otherwise bounce between them forever for every package
      // downstream of it, blowing the stack. Expanding each package once per traversal is
      // enough: this is a transitive closure, and the outer `change > 0` loop still runs to
      // a fixpoint.
      if (seen.has(dep)) {
        return;
      }
      seen.add(dep);
      add(info, depPkg.localDeps.concat(depPkg.indirectDeps), seen);
    });
  };

  _.each(packages, (pkg) => {
    add(pkg, pkg.localDeps.concat(pkg.indirectDeps), new Set<string>());
  });

  if (change > 0) {
    processIndirectDeps(packages, circulars);
  }
}

/**
 *
 * @param packages
 * @param level
 */
function includeDeps(packages, level) {
  const localDeps = _.uniq(
    Object.keys(packages).reduce((acc, p) => {
      if (packages[p] && !packages[p].ignore) {
        return acc.concat(packages[p].localDeps.filter((x) => packages[x] && packages[x].ignore));
      }
      return acc;
    }, [])
  );
  if (localDeps.length > 0) {
    localDeps.forEach((p) => {
      if (packages[p]) {
        packages[p].ignore = false;
      }
    });
    level--;
    if (level > 0) {
      includeDeps(packages, level);
    }
  }
}

/**
 * Read the packages of a fynpo mono-repo
 *
 * Honors the same `packages` config as {@link FynpoDepGraph}, so both discovery paths agree.
 * Passing `patterns` directly still works and takes precedence, for callers that already know
 * what they want.
 *
 * @param patterns - explicit minimatch patterns. Overrides whatever `packages` config says.
 * @param cwd - repo root
 * @param packages - raw `packages` config, resolved via {@link resolvePackagesConfig}
 * @returns - packages from the fynpo mono-repo
 */
export async function readFynpoPackages({
  patterns = undefined,
  cwd = process.cwd(),
  packages = undefined,
}: { patterns?: string[]; cwd?: string; packages?: unknown } = {}): Promise<
  Record<string, PackageInfo>
> {
  const config = resolvePackagesConfig(packages);
  const explicit = _.isEmpty(patterns) ? discoveryPatterns(config) : patterns;
  const gitignore = makeGitignoreMatcher(cwd);

  const excludeMms = config.exclude.map((p) => new mm.Minimatch(p));
  const isExcluded = (path: string) =>
    Boolean(path) && excludeMms.some((m) => m.match(path.split(Path.sep).join("/")));

  // null patterns means auto-search: scan from the root for every package.json
  const autoSearch = explicit === null;
  const groups: MMGroups = autoSearch
    ? { ".": null }
    : groupMM(
        explicit.map((p) => new mm.Minimatch(p)),
        {}
      );

  const skipForAutoSearch = (path: string) =>
    autoSearch && config.autoSearch.respectGitignore && gitignore.ignores(path);

  const files: string[][] = [];
  for (const prefix in groups) {
    files.push(
      await filterScanDir({
        cwd,
        prefix,
        concurrency: 500,
        filter: (f, path, extras: any) => {
          if (f !== "package.json") {
            return false;
          }
          if (autoSearch && (!path || path === ".")) {
            // the monorepo's own package.json is not a member
            return false;
          }
          if (autoSearch && extras?.files?.includes("fynpo.json")) {
            // a nested fynpo root is its own monorepo
            return false;
          }
          return !isExcluded(path) && !skipForAutoSearch(path);
        },
        filterDir: (dir, path, extras) => {
          if (dir === "node_modules" || isExcluded(path) || skipForAutoSearch(path)) {
            return false;
          }
          if (autoSearch) {
            return !dir.startsWith(".");
          }
          return Boolean(groups[prefix].find((save) => save.mm.match(extras.dirFile)));
        },
      })
    );
  }

  const allFiles = [].concat(...files).sort();

  const allPkgs = {};

  for (const pkgFile of allFiles) {
    const pkgStr = await Fs.readFile(Path.join(cwd, pkgFile), "utf-8");
    const pkgJson = JSON.parse(pkgStr);

    const path = Path.dirname(pkgFile);

    const pkgDir =
      pkgJson.name[0] === "@" && path.endsWith(pkgJson.name) ? pkgJson.name : Path.basename(path);

    allPkgs[pkgJson.name] = Object.assign(
      _.pick(pkgJson, [
        "name",
        "version",
        "dependencies",
        "devDependencies",
        "optionalDependencies",
        "peerDependencies",
      ]),
      {
        localDepsByType: {
          dep: [],
          dev: [],
          opt: [],
        },
        localDeps: [],
        dependents: [],
        indirectDeps: [],
        path,
        pkgDir,
        pkgFile,
        pkgStr,
        pkgJson,
        installed: false,
      }
    );
    Object.defineProperties(allPkgs[pkgJson.name], {
      pkgStr: { enumerable: false },
      pkgJson: { enumerable: false },
    });
  }

  return allPkgs;
}

/**
 * calculate dep graphs for packages under the mono-repo
 *
 * @param packages - packages from `readFynpoPackages`
 * @param opts - options
 * @returns
 */
export function makePkgDeps(packages, opts) {
  const cwd = opts.cwd || process.cwd();
  let circulars = [];
  let ignores = opts.ignore || [];
  const warnings = [];

  processDirectDeps(packages);
  processIndirectDeps(packages, circulars);

  let focusPkgPath;

  // If CWD is in a package, then mark the applying scope to that package only
  for (const p in packages) {
    const pkg = packages[p];
    if (cwd === pkg.path) {
      focusPkgPath = pkg.path;
      opts.only = [p];
      break;
    }
  }

  // If options.scope is defined, then ignore packages not in it
  if (opts.scope && opts.scope.length > 0) {
    Object.keys(packages).forEach((p) => {
      const scope = p[0] === "@" ? p.slice(0, p.indexOf("/")) : undefined;
      if ((!scope || !opts.scope.includes(scope)) && !ignores[p]) {
        ignores.push(p);
      }
    });
  }

  if (opts.only && opts.only.length > 0) {
    opts.only.forEach((x) => {
      if (!packages[x]) {
        warnings.push(`package ${x} of your '--only' option does not exist`);
      }
    });
    Object.keys(packages).forEach((p) => {
      if (!opts.only.includes(p) && !ignores[p]) {
        ignores.push(p);
      }
    });
  }

  const depMap = _.mapValues(packages, (pkg) => {
    return _.pick(pkg, ["name", "localDeps", "indirectDeps", "dependents"]);
  });

  circulars = _.uniq(circulars).map((x) => x.split(","));
  ignores = ignores.concat(
    _.map(circulars, (pair) => {
      const depA = packages[pair[0]].dependents.length;
      const depB = packages[pair[1]].dependents.length;
      if (depA === depB) return undefined;
      return depA > depB ? pair[1] : pair[0];
    }).filter((x) => x)
  );

  ignores.forEach((x) => {
    if (packages[x]) {
      packages[x].ignore = true;
    } else {
      warnings.push(`Ignore package ${x} does not exist`);
    }
  });

  if (opts.deps > 0) {
    includeDeps(packages, opts.deps);
  }

  return {
    packages,
    depMap,
    circulars,
    warnings,
    only: opts.only,
    focusPkgPath,
  };
}
