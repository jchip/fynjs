import Fs from "./util/file-ops";
import Path from "path";
import * as semverUtil from "./util/semver";
import _ from "lodash";

/* eslint-disable no-magic-numbers, no-constant-condition, complexity */

/**
 * Dependency Item
 *
 * Contains info of a dependency and its dependencies.
 * Used to track fetching packages when resolving versions and dependencies.
 */

export interface DepItemOptions {
  name: string;
  semver: string;
  /** Original top level package.json dep section (dep, dev, per, opt) */
  src: string;
  /** Source from the direct parent package */
  dsrc: string;
  resolved?: string;
  shrinkwrap?: any;
  deepResolve?: boolean;
  depth?: number;
  priority?: number;
}

interface SemverAnalysis {
  $: string;
  path?: string;
  localType?: string;
  urlType?: string;
}

interface NestedResolution {
  _: string[];
  [semver: string]: string | string[];
}

interface Shrinkwrap {
  dependencies?: Record<string, { version: string }>;
}

interface PkgVersionData {
  requests: string[][];
  _hasNonOpt?: boolean;
  firstReqIdx?: number;
  dsrc: string;
  src: string;
  [key: string]: any;
}

export class DepItem {
  name: string;
  private _semver: SemverAnalysis;
  /** Original top level package.json dep section (dep, dev, per, opt) */
  src: string;
  /** Source from the direct parent package */
  dsrc: string;
  resolved: string | undefined;
  parent: DepItem | undefined;
  private _shrinkwrap: Shrinkwrap | undefined;
  private _deepRes: boolean | undefined;
  private _nested: Record<string, NestedResolution>;
  /** Was this item promoted to top level for flattening? */
  promoted: boolean | undefined;
  depth: number;
  nameDepPath: string;
  priority: number | undefined;
  private _fullPath: string | undefined;
  private _circular: boolean | undefined;

  constructor(options: DepItemOptions, parent?: DepItem) {
    this.name = options.name;
    this._semver = semverUtil.analyze(options.semver);
    this.src = options.src;
    this.dsrc = options.dsrc;
    this.resolved = options.resolved;
    this.parent = parent;
    this._addShrinkwrap(_.get(parent, ["_shrinkwrap", "dependencies", this.name]));
    this._addShrinkwrap(options.shrinkwrap);
    this._deepRes = options.deepResolve;
    this._nested = {};
    this.promoted = undefined;
    this.depth = (parent && parent.depth + 1) || options.depth || 0;
    this.nameDepPath = this.depth > 1 ? parent!.nameDepPath + "/" + this.name : this.name;
    this.priority = options.priority;
  }

  get fullPath(): string | undefined {
    return this._fullPath;
  }

  set fullPath(p: string | undefined) {
    this._fullPath = p;
  }

  get semver(): string {
    return this._semver.$;
  }

  get semverPath(): string | undefined {
    return this._semver.path;
  }

  set localType(type: string | undefined) {
    this._semver.localType = type;
  }

  get localType(): string | undefined {
    return this._semver.localType;
  }

  get urlType(): string | undefined {
    return this._semver.urlType;
  }

  get deepResolve(): boolean | undefined {
    return this._deepRes;
  }

  unref(): void {
    this.parent = undefined;
  }

  resolve(version: string, meta?: { versions?: Record<string, { _shrinkwrap?: any }> }): void {
    this.resolved = version;
    if (meta && meta.versions) {
      const pkg = meta.versions[version];
      this._addShrinkwrap(pkg._shrinkwrap);
    }
  }

  private _addShrinkwrap(sw: any): void {
    if (sw) {
      if (this._shrinkwrap) {
        this._shrinkwrap = Object.assign({}, this._shrinkwrap, sw);
      } else {
        this._shrinkwrap = sw;
      }
    }
  }

  async loadShrinkwrap(dir: string): Promise<void> {
    const str = await Fs.readFile(Path.join(dir, "npm-shrinkwrap.json"), "utf8");
    this._addShrinkwrap(JSON.parse(str));
  }

  get id(): string {
    return `${this.name}@${this.resolved || this.semver}`;
  }

  private _saveNestedRes(name: string, semver: string, version: string): void {
    if (!this._nested[name]) {
      this._nested[name] = { _: [] };
    }
    if (!this._nested[name][semver]) {
      this._nested[name][semver] = version;
      if (this._nested[name]._.indexOf(version) < 0) {
        this._nested[name]._.push(version);
      }
    }
  }

  nestedResolve(name: string, semver: string): string | undefined {
    if (this._nested.hasOwnProperty(name) && this._nested[name][semver]) {
      return this._nested[name][semver] as string;
    }

    if (this._shrinkwrap && this._shrinkwrap.dependencies) {
      const x = this._shrinkwrap.dependencies[name];

      if (x && x.version && (semver === "latest" || semverUtil.satisfies(x.version, semver))) {
        this._saveNestedRes(name, semver, x.version);
        return x.version;
      }
    }

    if (this._nested.hasOwnProperty(name)) {
      const found = this._nested[name]._.find(x => semverUtil.satisfies(x, semver));
      if (found) {
        this._saveNestedRes(name, semver, found);
        return found;
      }
    }

    if (this.parent) {
      return this.parent.nestedResolve(name, semver);
    }

    return undefined;
  }

  addResolutionToParent(data: any, firstKnown: boolean): void {
    let pkg: any;

    if (this.parent!.depth) {
      const x = this.parent!;
      const kpkg = data.getPkg(x);
      pkg = kpkg.versions[x.resolved!].res;
    } else {
      pkg = data.res;
    }

    let depSection = pkg[this.dsrc];

    if (!depSection) {
      depSection = pkg[this.dsrc] = {};
    }
    depSection[this.name] = { semver: this.semver, resolved: this.resolved };

    // parent is not top
    if (this.parent!.depth && !firstKnown) {
      this.parent!._saveNestedRes(this.name, this.semver, this.resolved!);
    }
  }

  get requestPath(): { opt: boolean; path: string[] } {
    let x: DepItem = this;
    const reqPath = [`${this.dsrc};${this.semver}`];
    let opt = false;

    while (true) {
      if (x.parent!.depth) {
        x = x.parent!;
        if (x.dsrc === "opt") opt = true;
        reqPath.push(`${x.dsrc};${x.semver};${x.id}`);
      } else {
        if (x.dsrc === "opt") opt = true;
        reqPath.push(`${x.dsrc}`);
        break;
      }
    }

    return { opt, path: reqPath.reverse() };
  }

  addRequestToPkg(pkgV: PkgVersionData, firstSeen: boolean): void {
    if (pkgV[this.src] === undefined) {
      pkgV[this.src] = 0;
    }
    pkgV[this.src]++;
    const reqPath = this.requestPath;
    pkgV.requests.push(reqPath.path);
    if (!pkgV._hasNonOpt) {
      pkgV._hasNonOpt = !reqPath.opt;
    }
    if (firstSeen) pkgV.firstReqIdx = pkgV.requests.length - 1;
    if (pkgV.dsrc.indexOf(this.dsrc) < 0) {
      pkgV.dsrc += `;${this.dsrc}`;
    }
    if (pkgV.src.indexOf(this.src) < 0) {
      pkgV.src += `;${this.src}`;
    }
  }

  isCircular(): boolean {
    if (this._circular !== undefined) {
      return this._circular;
    }

    let parent = this.parent;
    if (!parent) return false;

    while (parent.depth) {
      if (parent.id === this.id) {
        return (this._circular = true);
      }
      parent = parent.parent;
    }

    return (this._circular = false);
  }

  get depPath(): string[] {
    const deps: string[] = [];
    let cur: DepItem | undefined = this;
    while (cur) {
      deps.push(cur.id || cur.name);
      cur = cur.parent;
    }
    return deps.reverse();
  }
}

export default DepItem;
