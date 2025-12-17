// @ts-nocheck

/**
 * Provides programmatic access to package stat information.
 * Can be invoked multiple times within a single process.
 *
 * Returns structured data instead of logging, allowing consumers
 * to format the output as needed.
 */

import _ from "lodash";
import * as semverUtil from "./util/semver";
import PkgDepLinker from "./pkg-dep-linker";
import { SEMVER } from "./symbols";

const PACKAGE_JSON = "~package.json";

/**
 * Result from getPackageStat for a specific package version.
 */
interface PkgStatResult {
  /** Package name */
  name: string;
  /** Package version */
  version: string;
  /** Whether this version is promoted (hoisted to top) */
  promoted: boolean;
  /** List of dependents (packages that depend on this) */
  dependents: Array<{ name: string; version: string; promoted: boolean }>;
  /** All dependency paths from root to this package */
  allPaths: string[][];
  /** Filtered significant paths (reduced from allPaths) */
  significantPaths: string[][];
  /** Circular dependencies detected (path that leads back to a visited node) */
  circularDeps: string[][];
}

/**
 * Result from findMatchingVersions for a package.
 */
interface MatchingVersionsResult {
  /** The searched package ID (name or name@semver) */
  searchId: string;
  /** Matching installed versions */
  versions: Array<{ name: string; version: string; promoted: boolean }>;
}

class PkgStatProvider {
  private _fyn: any;
  private _fynRes: any;
  private _dependentsCache: Record<string, any[]>;
  private _allPaths: string[][];
  private _circularDeps: string[][];

  constructor({ fyn }) {
    this._fyn = fyn;
    this._fynRes = null;
    this._dependentsCache = {};
    this._allPaths = [];
    this._circularDeps = [];
  }

  /**
   * Find packages matching the given ID pattern.
   *
   * @param pkgId - Package ID (name or name@semver)
   * @returns Array of matching package info
   */
  findPkgsById(pkgId: string): Array<{ name: string; version: string; promoted: boolean; res: any }> {
    const pkgs = this._fyn._data?.pkgs;
    if (!pkgs) return [];

    const ix = pkgId.indexOf("@", 1);
    const sx = ix > 0 ? ix : pkgId.length;
    const name = pkgId.substr(0, sx);
    const semver = pkgId.substr(sx + 1);

    return _(pkgs[name])
      .map((vpkg, version) => {
        if (!semver || semverUtil.satisfies(version, semver)) {
          return vpkg;
        }
      })
      .filter(x => x)
      .value();
  }

  /**
   * Find all packages that depend on the given package.
   *
   * @param ask - Package info { name, version, local? }
   * @returns Array of dependent packages
   */
  findDependents(ask: { name: string; version: string; local?: boolean }): Array<{ name: string; version: string; promoted: boolean }> {
    const pkgs = this._fyn._data?.pkgs;
    if (!pkgs) return [];

    const dependents = [];

    if (!this._fynRes) {
      const depLinker = new PkgDepLinker({ fyn: this._fyn });
      this._fynRes = depLinker.makeAppFynRes(this._fyn._data.res, {});
    }

    const check = (res, vpkg) => {
      const semv = ask.local ? semverUtil.unlocalify(ask.version) : ask.version;
      if (res && semverUtil.satisfies(res.resolved, semv)) {
        dependents.push(vpkg);
      }
    };

    // Check indirect packages
    for (const name in pkgs) {
      const pkg = pkgs[name];
      for (const version in pkg) {
        const vpkg = pkg[version];
        // no dev because those aren't installed anyways
        ["dep", "opt", "per"].forEach(s => {
          const x = vpkg.res[s];
          check(x && x[ask.name], vpkg);
        });
      }
    }

    // Check app itself
    check(this._fynRes[ask.name], { name: PACKAGE_JSON, promoted: true });

    return dependents;
  }

  /**
   * Get the package ID string.
   */
  private _getPkgId(pkg: { name: string; version: string }): string {
    if (pkg.name === PACKAGE_JSON) {
      return pkg.name;
    }
    return `${pkg.name}@${pkg.version}`;
  }

  /**
   * Find dependency paths from root to the given package.
   *
   * @param pkgIds - Package IDs to trace
   * @param output - Current path being built
   * @param askName - Original package name being traced
   */
  private async _findDepPaths(pkgIds: string[], output: string[] = [], askName: string = ""): Promise<void> {
    const data = this._fyn._data;
    const pkgs = data?.pkgs;
    if (!pkgs) return;

    for (const pkgId of pkgIds) {
      const askPkgs = this.findPkgsById(pkgId).sort((a, b) =>
        semverUtil.simpleCompare(a.version, b.version)
      );

      if (askPkgs.length < 1) {
        if (pkgId === PACKAGE_JSON) {
          const newOutput = [].concat(output);
          ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"].find(s => {
            const semver = _.get(this._fyn, ["_pkg", s, askName]);
            if (semver) {
              newOutput[SEMVER] = semver;
            }
            return semver;
          });
          this._allPaths.push(newOutput);
        } else {
          this._allPaths.push([pkgId]);
        }
        continue;
      }

      for (const pkg of askPkgs) {
        const id = this._getPkgId(pkg);

        if (output.indexOf(id) >= 0) {
          // Circular dependency detected - record the path
          this._circularDeps.push([id].concat(output));
          continue;
        }

        let dependents = this._dependentsCache[id];
        if (!dependents) {
          this._dependentsCache[id] = dependents = this.findDependents(pkg).sort((a, b) => {
            if (a.name === b.name) {
              return semverUtil.simpleCompare(a.version, b.version);
            }
            return a.name > b.name ? 1 : -1;
          });
        }

        const followIds = dependents
          .filter(x => x.name !== PACKAGE_JSON)
          .map(x => `${x.name}@${x.version.replace("-fynlocal_h", "")}`);

        if (dependents.length > 0) {
          const newOutput = [id].concat(output);
          if (output.length === 1) {
            ["dep", "opt", "per", "dev"].find(s => {
              const sv = _.get(pkg, ["res", s, askName]);
              if (sv) {
                newOutput[SEMVER] = sv.semver;
              }
              return sv;
            });
          } else {
            newOutput[SEMVER] = output[SEMVER];
          }

          if (followIds.length > 0) {
            await this._findDepPaths(followIds, newOutput, askName);
          } else if (output) {
            this._allPaths.push(newOutput);
          }
        }
      }
    }
  }

  /**
   * Filter paths to show only the most significant ones.
   *
   * @param paths - All dependency paths
   * @param maxPaths - Maximum number of paths to return
   * @returns Filtered significant paths
   */
  private _filterSignificantPaths(paths: string[][], maxPaths: number = 5): string[][] {
    const cmpDepPath = (a, b) => {
      for (let ixA = 0; ixA < a.length; ixA++) {
        if (b.length <= ixA) return 1;
        const aId = a[ixA];
        const bId = b[ixA];
        if (aId !== bId) return aId > bId ? 1 : -1;
      }
      return 0;
    };

    paths = paths.sort((a, b) => a.length - b.length);
    let minDetails = 5;
    let briefPaths = paths;

    while (briefPaths.length > maxPaths && minDetails > 0) {
      const occurLevels = {};
      briefPaths = paths.filter(dp => {
        const last = dp.length - 1;
        for (let ix = 0; ix < last; ix++) {
          const pkgId = dp[ix];
          const occur = occurLevels[pkgId];
          if (occur && occur.level < ix && occur.leaf === dp[last] && dp.length - ix > minDetails) {
            return false;
          }
          occurLevels[pkgId] = { level: ix, leaf: dp[last] };
        }
        return true;
      });
      minDetails--;
    }

    return briefPaths.sort(cmpDepPath);
  }

  /**
   * Get detailed stat information for a specific package version.
   *
   * @param name - Package name
   * @param version - Package version
   * @returns Stat result with dependents and paths
   */
  async getPackageStat(name: string, version: string): Promise<PkgStatResult | null> {
    const pkgs = this._fyn._data?.pkgs;
    if (!pkgs || !pkgs[name] || !pkgs[name][version]) {
      return null;
    }

    const pkg = pkgs[name][version];
    const pkgId = `${name}@${version}`;

    // Find dependents
    const dependents = this.findDependents({ name, version, local: pkg.local }).sort((a, b) => {
      if (a.name === b.name) {
        return semverUtil.simpleCompare(a.version, b.version);
      }
      return a.name > b.name ? 1 : -1;
    });

    // Find dependency paths
    this._allPaths = [];
    this._circularDeps = [];
    const depIds = dependents.map(d => this._getPkgId(d));
    await this._findDepPaths(depIds, [pkgId], name);

    // Get paths for this specific package
    const paths = this._allPaths.filter(p => p[0] === pkgId || p.includes(pkgId));

    return {
      name,
      version,
      promoted: pkg.promoted || false,
      dependents: dependents.map(d => ({
        name: d.name,
        version: d.version,
        promoted: d.promoted || false
      })),
      allPaths: paths,
      significantPaths: this._filterSignificantPaths(paths),
      circularDeps: this._circularDeps
    };
  }

  /**
   * Find all installed versions matching a package ID pattern.
   *
   * @param pkgId - Package ID (name or name@semver)
   * @returns Matching versions result
   */
  findMatchingVersions(pkgId: string): MatchingVersionsResult {
    const matches = this.findPkgsById(pkgId).sort((a, b) =>
      semverUtil.simpleCompare(a.version, b.version)
    );

    return {
      searchId: pkgId,
      versions: matches.map(m => ({
        name: m.name,
        version: m.version,
        promoted: m.promoted || false
      }))
    };
  }

  /**
   * Get stat for all versions of a package.
   * This is the main entry point for the audit formatter.
   *
   * @param name - Package name
   * @param version - Optional specific version
   * @returns Array of stat results for all matching versions
   */
  async getPackageStats(name: string, version?: string): Promise<PkgStatResult[]> {
    const pkgId = version ? `${name}@${version}` : name;
    const matches = this.findMatchingVersions(pkgId);
    const results: PkgStatResult[] = [];

    for (const match of matches.versions) {
      const stat = await this.getPackageStat(match.name, match.version);
      if (stat) {
        results.push(stat);
      }
    }

    return results;
  }

  /**
   * Format dependency paths with semver info.
   *
   * @param paths - Array of paths
   * @returns Formatted path strings
   */
  formatPaths(paths: string[][]): string[] {
    return paths.map(p => {
      const semver = p[SEMVER];
      const pathStr = p.join(" > ");
      return semver ? `${pathStr} (${semver})` : pathStr;
    });
  }

  /**
   * Reset caches. Call this if fyn data changes.
   */
  reset(): void {
    this._fynRes = null;
    this._dependentsCache = {};
    this._allPaths = [];
    this._circularDeps = [];
  }
}

export default PkgStatProvider;
// CommonJS compatibility
module.exports = PkgStatProvider;
