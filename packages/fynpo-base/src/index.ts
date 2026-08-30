import Path from "path";
import { promises as Fs } from "fs";
import { filterScanDir } from "filter-scan-dir";
import { Minimatch } from "minimatch";
import _ from "lodash";
import { groupMM, MMGroups } from "./minimatch-group.js";
import {
  resolvePackagesConfig,
  scanPatterns,
  includeFilter,
  outOfScopePackages,
} from "./packages-config.js";
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
  //
  // Membership used to be `Array.indexOf` over localDeps / indirectDeps / circulars, and
  // both the walk and the fixpoint were recursive. That is what made a cycle fatal before
  // FPO-19, and it stayed expensive afterwards: a 500-package chain took ~17s to resolve,
  // and a deep enough graph could still exhaust the stack through the walk alone, cycle or
  // no cycle. Sets for membership and explicit stacks for both loops (FPO-43).
  //
  // The arrays are still the output, appended in the same discovery order as before - the
  // Sets only answer "already have it?" without an O(n) scan.
  //
  const localDepsSet = new Map<string, Set<string>>();
  const indirectDepsSet = new Map<string, Set<string>>();
  const circularsSet = new Set<string>(circulars);

  _.each(packages, (pkg, name: string) => {
    localDepsSet.set(name, new Set(pkg.localDeps));
    indirectDepsSet.set(name, new Set(pkg.indirectDeps));
  });

  /**
   * Accumulate every package reachable from `info` into its indirectDeps.
   *
   * Depth-first over a snapshot of each package's deps, taken as it is reached - the same
   * order the recursive walk produced. `seen` expands each package once per traversal,
   * which is all a transitive closure needs and is what keeps a cycle from looping.
   *
   * @param info the package whose indirect deps we are accumulating
   * @returns how many indirect deps were added
   */
  const add = (info) => {
    const seen = new Set<string>();
    const infoIndirect = indirectDepsSet.get(info.name);
    const infoLocal = localDepsSet.get(info.name);
    let added = 0;

    // each frame is a dep list plus how far into it we have gone
    const stack: { deps: string[]; at: number }[] = [
      { deps: info.localDeps.concat(info.indirectDeps), at: 0 },
    ];

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];

      if (frame.at >= frame.deps.length) {
        stack.pop();
        continue;
      }

      const dep = frame.deps[frame.at++];
      const depPkg = packages[dep];

      if (!infoLocal.has(dep) && !infoIndirect.has(dep)) {
        added++;
        info.indirectDeps.push(dep);
        infoIndirect.add(dep);
        depPkg.dependents.push(info.name);
      }

      // a cycle that comes straight back to `info` - record the pair and stop descending
      if (localDepsSet.get(dep).has(info.name)) {
        const pair = [info.name, depPkg.name].sort().join(",");
        if (!circularsSet.has(pair)) {
          circularsSet.add(pair);
          circulars.push(pair);
        }
        continue;
      }

      if (seen.has(dep)) {
        continue;
      }

      seen.add(dep);
      stack.push({ deps: depPkg.localDeps.concat(depPkg.indirectDeps), at: 0 });
    }

    return added;
  };

  // run to a fixpoint: expanding one package can give another package more to reach through
  let change = 0;
  do {
    change = 0;
    _.each(packages, (pkg) => {
      change += add(pkg);
    });
  } while (change > 0);
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
  const explicit = _.isEmpty(patterns) ? scanPatterns(config) : patterns;
  const gitignore = makeGitignoreMatcher(cwd);

  const excludeMms = config.exclude.map((p) => new Minimatch(p));
  const isExcluded = (path: string) =>
    Boolean(path) && excludeMms.some((m) => m.match(path.split(Path.sep).join("/")));

  // `include` filters what the scan found - it does not replace the scan (FPO-17)
  const includeMms = (_.isEmpty(patterns) ? includeFilter(config) : []).map(
    (p) => new Minimatch(p)
  );
  const isIncluded = (path: string) =>
    includeMms.length === 0 || includeMms.some((m) => m.match(path.split(Path.sep).join("/")));

  // null patterns means auto-search: scan from the root for every package.json
  const autoSearch = explicit === null;
  const groups: MMGroups = autoSearch
    ? { ".": null }
    : groupMM(
        explicit.map((p) => new Minimatch(p)),
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

  const allFiles = [].concat(...files)
    .filter((f: string) => isIncluded(Path.dirname(f)))
    .sort();

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
  outOfScopePackages(opts.scope, Object.keys(packages)).forEach((p) => {
    if (!ignores[p]) {
      ignores.push(p);
    }
  });

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

  // Breaking a cycle costs a package: the less depended-on half of each pair is dropped from
  // the run. That used to happen in silence, so a repo with cycles quietly processed fewer
  // packages than it has and nothing said which ones or why (FPO-43).
  const circularIgnores = _.uniq(
    _.map(circulars, (pair) => {
      const depA = packages[pair[0]].dependents.length;
      const depB = packages[pair[1]].dependents.length;
      if (depA === depB) return undefined;
      return depA > depB ? pair[1] : pair[0];
    }).filter((x) => x)
  );

  if (circulars.length > 0) {
    warnings.push(
      `Circular local dependencies: ${circulars.map((pair) => pair.join(" <-> ")).join(", ")}`
    );

    if (circularIgnores.length > 0) {
      warnings.push(
        `Ignoring ${circularIgnores.join(", ")} to break the circular dependencies above - ` +
          `they are dropped from this run. Break the cycles to include them.`
      );
    }
  }

  ignores = ignores.concat(circularIgnores);

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
