/**
 * Dependencies Data
 *
 * Class to contain all the packages needed after
 * fetching meta data and resolving each package's dependencies.
 */

import type { KnownPackage, PkgVersionInfo } from "./types";

const RESOLVED_PKGS = Symbol("resolved packages");

export interface DepDataInit {
  pkgs?: Record<string, KnownPackage>;
  res?: Record<string, unknown>;
}

/**
 * Reference to a dependency item for package lookup
 *
 * Used by getPkg to locate packages in the data store.
 */
export interface DepItemRef {
  name: string;
  /** Optional dependency failure flag (truthy = failed, number for failure code) */
  optFailed?: boolean | number;
}

export interface PkgVersion {
  linked?: number;
  [key: string]: unknown;
}

export class DepData {
  /** The dependency tree - maps package name to KnownPackage */
  pkgs: Record<string, KnownPackage>;
  /** Bad/failed packages */
  badPkgs: Record<string, KnownPackage>;
  /** The dependency resolution for top level */
  res: Record<string, unknown>;
  private [RESOLVED_PKGS]: PkgVersionInfo[];

  constructor(_data?: DepDataInit) {
    const data = _data || {};
    this.pkgs = data.pkgs || {};
    this.badPkgs = {};
    this.res = data.res || {};
    this[RESOLVED_PKGS] = [];
  }

  get resolvedPackages(): PkgVersionInfo[] {
    return this[RESOLVED_PKGS];
  }

  addResolved(info: PkgVersionInfo): void {
    this[RESOLVED_PKGS].push(info);
  }

  sortPackagesByKeys(): void {
    const pkgs = this.pkgs;
    this.pkgs = {};
    Object.keys(pkgs)
      .sort()
      .forEach(x => (this.pkgs[x] = pkgs[x]));
  }

  cleanLinked(): void {
    this.eachVersion(pkg => {
      (pkg as PkgVersion).linked = 0;
    });
  }

  getPkgsData(bad?: boolean): Record<string, KnownPackage> {
    return bad ? this.badPkgs : this.pkgs;
  }

  getPkg(item: DepItemRef): KnownPackage {
    return this.getPkgsData(Boolean(item.optFailed))[item.name];
  }

  getPkgById(id: string): KnownPackage | PkgVersionInfo | undefined {
    // id is `name@version`; split at the LAST '@' so a scoped name's leading
    // '@' (e.g. "@scope/name@1.2.3") isn't mistaken for the version separator.
    const lastAt = id.lastIndexOf("@");
    const sep = lastAt > 0 ? lastAt : -1;
    const name = sep > 0 ? id.slice(0, sep) : id;
    const version = sep > 0 ? id.slice(sep + 1) : undefined;
    const kpkg = this.getPkgsData()[name];
    if (!kpkg) return undefined;
    return version ? kpkg.versions[version] : kpkg;
  }

  eachVersion(cb: (pkg: PkgVersionInfo, version: string, kpkg: KnownPackage) => void): void {
    const pkgs = this.pkgs;
    Object.keys(pkgs).forEach(name => {
      const kpkg = pkgs[name];
      Object.entries(kpkg.versions).forEach(([version, pkg]) => {
        cb(pkg, version, kpkg);
      });
    });
  }
}

export default DepData;
