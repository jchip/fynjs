/**
 * Structural views of the `Fyn` class.
 *
 * `Fyn` is large, and its collaborators each need only a slice of it. Rather than depend on
 * the concrete class - which would make every collaborator untestable in isolation and tie
 * them to a construction order - each declares the subset it actually calls, and `Fyn`
 * satisfies them structurally.
 *
 * The per-collaborator views stay next to their consumers, because most of them reference
 * types local to those modules. What lives here is what more than one of them needs, so the
 * shared members are declared once and cannot drift apart (FJM-22).
 */

import type { KnownPackage } from "./resolution";

/**
 * Read access to the resolved dependency data - `Fyn._data`, a {@link DepData}.
 *
 * Shared by the dep linker, the bin linker and the installer. The dep linker and the bin
 * linker used to declare this themselves with their own, different value types, which made
 * the two views structurally incompatible: the installer extends both, so it could not
 * satisfy either (FJM-154). Declaring it once against what `DepData` actually returns keeps
 * that from happening again.
 */
export interface FynPkgsData {
  _data: {
    getPkgsData(bad?: boolean): Record<string, KnownPackage>;
  };
}

/** One package in a fynpo monorepo's graph */
export interface FynpoPackage {
  name: string;
  version: string;
  path: string;
}

/**
 * The fynpo monorepo graph, as reached through `Fyn._fynpo.graph`.
 *
 * Declared once here because `Fyn` and the dep resolver had two different versions of it -
 * `Fyn` knew only `getPackageAtDir`, so `Fyn` did not satisfy the resolver's view, which
 * also reads `packages.byPath` (FJM-154).
 */
export interface FynpoGraph {
  packages: {
    byPath: Record<string, FynpoPackage>;
    byName: Record<string, FynpoPackage[]>;
  };
  getPackageByName(name: string): FynpoPackage | undefined;
  getPackageAtDir(dir: string): FynpoPackage | undefined;
  resolvePackage(name: string, semver: string, strict: boolean): FynpoPackage | undefined;
  addDep(fromPkg: FynpoPackage, toPkg: FynpoPackage, section: string, steps: unknown[]): boolean;
}

/**
 * Where a package's files live, and how a nested `node_modules` under one is made.
 *
 * Shared by the dep linker, the bin linker and the installer, which had three separate
 * declarations of these same two methods.
 *
 * Note the dist extractor deliberately keeps its own, narrower `getInstalledPkgDir` - it
 * documents the third argument as `{ promoted?: boolean }`, which is the only property it
 * reads, and that is more useful there than the widened `unknown` these three share.
 */
export interface FynPkgDirs {
  getInstalledPkgDir(name: string, version: string, info?: unknown): string;
  createSubNodeModulesDir(pkgDir: string): Promise<string>;
}

/** Fyn instance interface for dep locker */
export interface FynForDepLocker {
  _pkgSrcMgr?: {
    getRegistryUrl(name: string): string;
  };
  _options?: { ignoreLockUrl?: boolean };
  _shownMissingFiles: Set<string>;
}

/** Fyn instance interface for lifecycle scripts */
export interface FynForLifecycle {
  allrc?: Record<string, unknown>;
  isFynpo?: boolean;
  _fynpo?: { dir: string };
  initCwd?: string;
  cwd?: string;
}
