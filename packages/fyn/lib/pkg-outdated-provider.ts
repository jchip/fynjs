import Path from "path";
import semver from "semver";
import Fs from "./util/file-ops";
import DepItem, { type DepSource } from "./dep-item";
import fyntil from "./util/fyntil";
import type { PackageJson, PackageMeta } from "./types";

export type OutdatedDependencyType = "prod" | "dev" | "optional" | "devOptional";

export interface OutdatedRecord {
  name: string;
  resolvedName?: string;
  type: OutdatedDependencyType;
  requested: string;
  current: string | null;
  wanted: string;
  latest: string | null;
}

export interface OutdatedResult {
  records: OutdatedRecord[];
  skipped: string[];
}

interface OutdatedOptions {
  packages?: string[];
}

interface DeclaredDependency {
  name: string;
  requested: string;
  type: OutdatedDependencyType;
  src: DepSource;
  section: "dependencies" | "devDependencies" | "optionalDependencies" | "devOptDependencies";
}

export interface FynForOutdated {
  _pkg: PackageJson;
  _initializePkg(): Promise<void>;
  cwd?: string;
  fynlocal?: boolean;
  isFynpo?: boolean;
  lockTime?: Date;
  checkNoFynLocal?(name: string): boolean;
  _fynpo?: {
    config?: unknown;
    graph?: {
      getPackageByName(name: string): unknown;
      resolvePackage(name: string, semver: string, strict: boolean): unknown;
    };
  };
  getOutputDir(name?: string): string;
  pkgSrcMgr: {
    fetchMeta(item: DepItem): Promise<PackageMeta>;
  };
}

const addSection = (
  declarations: Map<string, DeclaredDependency>,
  deps: Record<string, string> | undefined,
  type: OutdatedDependencyType,
  src: DepSource,
  section: DeclaredDependency["section"],
): void => {
  for (const [name, requested] of Object.entries(deps || {})) {
    declarations.set(name, { name, requested, type, src, section });
  }
};

const collectDeclarations = (pkg: PackageJson): Map<string, DeclaredDependency> => {
  const declarations = new Map<string, DeclaredDependency>();

  addSection(declarations, pkg.devDependencies, "dev", "dev", "devDependencies");
  addSection(declarations, pkg.devOptDependencies, "devOptional", "devopt", "devOptDependencies");
  addSection(declarations, pkg.dependencies, "prod", "dep", "dependencies");

  for (const [name, requested] of Object.entries(pkg.optionalDependencies || {})) {
    declarations.set(name, {
      name,
      // Fyn gives an optional declaration precedence, but retains the range from dependencies.
      requested: pkg.dependencies?.[name] || requested,
      type: "optional",
      src: "opt",
      section: "optionalDependencies",
    });
  }

  return declarations;
};

const selectWanted = (
  name: string,
  requested: string,
  meta: PackageMeta,
  lockTime?: Date,
): string => {
  const tagged = meta["dist-tags"]?.[requested];
  if (tagged) {
    if (!meta.versions?.[tagged]) {
      throw new Error(
        `dependency "${name}" tag "${requested}" points to missing version "${tagged}"`,
      );
    }
    return tagged;
  }

  const range = semver.validRange(requested);
  if (!range) {
    throw new Error(`dependency "${name}" has unsupported registry spec "${requested}"`);
  }

  const latest = meta["dist-tags"]?.latest;
  if (latest && meta.versions?.[latest] && semver.satisfies(latest, range)) {
    return latest;
  }

  const versions = Object.keys(meta.versions || {}).sort(semver.rcompare);
  const wanted = versions.find((version) => {
    if (!semver.satisfies(version, range)) return false;
    if (!lockTime || versions.length < 2) return true;
    const published = meta.time?.[version];
    return Boolean(published && new Date(published).getTime() <= lockTime.getTime());
  });
  if (!wanted) {
    throw new Error(`dependency "${name}" has no published version matching "${requested}"`);
  }

  return wanted;
};

class PkgOutdatedProvider {
  private _fyn: FynForOutdated;

  constructor({ fyn }: { fyn: FynForOutdated }) {
    this._fyn = fyn;
  }

  private _isEffectiveLocal(declaration: DeclaredDependency, item: DepItem): boolean {
    if (!this._fyn.fynlocal) return false;

    const override = this._fyn._pkg.fyn?.[declaration.section]?.[declaration.name];
    if (typeof override === "string" && this._fyn.cwd) {
      try {
        Fs.statSync(Path.join(this._fyn.cwd, override));
        return true;
      } catch {
        // Installation also ignores a fyn local override whose target does not exist.
      }
    }

    const graph = this._fyn._fynpo?.graph;
    if (
      !this._fyn.isFynpo ||
      !graph ||
      item.resolutionName !== item.name ||
      this._fyn.checkNoFynLocal?.(declaration.name) ||
      !graph.getPackageByName(declaration.name)
    ) {
      return false;
    }

    let requested = item.semver;
    const autoSemver = (
      this._fyn._fynpo?.config as
        | { localDepAutoSemver?: "patch" | "minor" | "major" }
        | undefined
    )?.localDepAutoSemver;
    const coerced = autoSemver && semver.coerce(requested);
    if (coerced) {
      requested =
        autoSemver === "patch"
          ? `~${coerced.raw}`
          : autoSemver === "minor"
            ? `^${coerced.raw}`
            : "*";
    }
    return Boolean(graph.resolvePackage(declaration.name, requested, false));
  }

  private async _readCurrent(name: string): Promise<string | null> {
    const file = Path.join(this._fyn.getOutputDir(name), "package.json");
    try {
      const pkg = JSON.parse(await Fs.readFile(file, "utf8"));
      if (typeof pkg.version !== "string") {
        throw new Error("version is missing");
      }
      return pkg.version;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error(
        `failed to read installed dependency "${name}" at ${file}: ${(err as Error).message}`,
      );
    }
  }

  async getOutdated(options: OutdatedOptions = {}): Promise<OutdatedResult> {
    await this._fyn._initializePkg();

    const declarations = collectDeclarations(this._fyn._pkg);
    const filters = options.packages || [];
    for (const name of filters) {
      if (!declarations.has(name)) {
        throw new Error(`dependency "${name}" is not declared`);
      }
    }

    const selected = (
      filters.length > 0
        ? filters.map((name) => declarations.get(name)!)
        : Array.from(declarations.values())
    ).sort((a, b) => a.name.localeCompare(b.name));

    const skipped: string[] = [];
    const settled = await Promise.allSettled(
      selected.map(async (declaration) => {
        const item = new DepItem({
          name: declaration.name,
          semver: declaration.requested,
          src: declaration.src,
          dsrc: declaration.src,
        });

        if (item.localType || item.urlType || this._isEffectiveLocal(declaration, item)) {
          skipped.push(declaration.name);
          return undefined;
        }

        let meta: PackageMeta;
        try {
          meta = await this._fyn.pkgSrcMgr.fetchMeta(item);
        } catch (err) {
          throw new Error(
            `failed to retrieve registry metadata for "${declaration.name}": ${(err as Error).message}`,
          );
        }

        if (!meta?.versions) {
          throw new Error(`registry returned invalid metadata for "${declaration.name}"`);
        }

        const wanted = selectWanted(declaration.name, item.semver, meta, this._fyn.lockTime);
        const latest = meta["dist-tags"]?.latest || null;

        if (
          (declaration.type === "optional" || declaration.type === "devOptional") &&
          fyntil.checkPkgOsCpu(meta.versions[wanted]) !== true
        ) {
          skipped.push(declaration.name);
          return undefined;
        }

        const current = await this._readCurrent(declaration.name);

        if (current === wanted && (!latest || wanted === latest)) return undefined;

        const record: OutdatedRecord = {
          name: declaration.name,
          type: declaration.type,
          requested: declaration.requested,
          current,
          wanted,
          latest,
        };
        if (item.resolutionName !== item.name) {
          record.resolvedName = item.resolutionName;
        }
        return record;
      }),
    );
    const failed = settled.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failed) throw failed.reason;

    const records = settled
      .map((result) => (result.status === "fulfilled" ? result.value : undefined))
      .filter((record): record is OutdatedRecord => Boolean(record));

    return { records, skipped: skipped.sort() };
  }
}

export { collectDeclarations, selectWanted };
export default PkgOutdatedProvider;
