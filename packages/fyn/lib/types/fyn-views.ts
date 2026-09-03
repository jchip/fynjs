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
