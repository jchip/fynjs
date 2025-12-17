/**
 * Dependencies Data
 *
 * Class to contain all the packages needed after
 * fetching meta data and resolving each package's dependencies.
 */

const RESOLVED_PKGS = Symbol("resolved packages");

export interface DepDataInit {
  pkgs?: Record<string, Record<string, any>>;
  res?: Record<string, any>;
}

export interface DepItem {
  name: string;
  optFailed?: boolean;
}

export interface PkgVersion {
  linked?: number;
  [key: string]: any;
}

export class DepData {
  /** The dependency tree */
  pkgs: Record<string, Record<string, PkgVersion>>;
  /** Bad/failed packages */
  badPkgs: Record<string, Record<string, PkgVersion>>;
  /** The dependency resolution for top level */
  res: Record<string, any>;
  private [RESOLVED_PKGS]: any[];

  constructor(_data?: DepDataInit) {
    const data = _data || {};
    this.pkgs = data.pkgs || {};
    this.badPkgs = {};
    this.res = data.res || {};
    this[RESOLVED_PKGS] = [];
  }

  get resolvedPackages(): any[] {
    return this[RESOLVED_PKGS];
  }

  addResolved(info: any): void {
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
      pkg.linked = 0;
    });
  }

  getPkgsData(bad?: boolean): Record<string, Record<string, PkgVersion>> {
    return bad ? this.badPkgs : this.pkgs;
  }

  getPkg(item: DepItem): Record<string, PkgVersion> {
    return this.getPkgsData(item.optFailed)[item.name];
  }

  getPkgById(id: string): Record<string, PkgVersion> | PkgVersion {
    const splits = id.split("@");
    const x = this.getPkgsData()[splits[0]];
    return splits[1] ? x[splits[1]] : x;
  }

  eachVersion(cb: (pkg: PkgVersion, version: string, pkgVersions: Record<string, PkgVersion>) => void): void {
    const pkgs = this.pkgs;
    Object.keys(pkgs).forEach(x => {
      const pkg = pkgs[x];
      Object.keys(pkg).forEach(v => {
        cb(pkg[v], v, pkg);
      });
    });
  }
}

export default DepData;