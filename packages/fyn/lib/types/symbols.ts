/**
 * Symbol definitions for fyn internal metadata
 *
 * These symbols are used as object keys to store metadata without
 * polluting the regular property namespace. They enable type-safe
 * access to hidden properties on package metadata objects.
 */

/** Resolved semvers from lock file */
export const LOCK_RSEMVERS = Symbol("lock rsemvers");

/** DepInfo semver */
export const SEMVER = Symbol("semver");

/** Resolved semvers during resolution */
export const RSEMVERS = Symbol("rsemvers");

/** Sorted versions from lock file */
export const LOCK_SORTED_VERSIONS = Symbol("lock sorted versions");

/** Latest tag version (usually "latest" dist-tag) */
export const LATEST_TAG_VERSION = Symbol("latest tag version");

/** Timestamp of latest version */
export const LATEST_VERSION_TIME = Symbol("latest version time");

/** All versions sorted by semver */
export const SORTED_VERSIONS = Symbol("sorted versions");

/** Latest versions sorted (subset of sorted versions) */
export const LATEST_SORTED_VERSIONS = Symbol("latest sorted versions");

/** Local version mappings for fynlocal packages */
export const LOCAL_VERSION_MAPS = Symbol("local version maps");

/** Resolution order for versions */
export const RESOLVE_ORDER = Symbol("resolve order");

/** Raw package.json info cache */
export const PACKAGE_RAW_INFO = Symbol("package.json raw info");

/** Reference to DepItem instance */
export const DEP_ITEM = Symbol("dep item");

/**
 * Type-safe symbol property accessors
 *
 * These types enable proper typing when accessing symbol-keyed properties
 */

/** Symbol properties for PackageMeta */
export interface PackageMetaSymbols {
  [LOCK_RSEMVERS]?: Record<string, string>;
  [SORTED_VERSIONS]?: string[];
  [LATEST_SORTED_VERSIONS]?: string[];
  [LATEST_VERSION_TIME]?: Date;
  [LOCK_SORTED_VERSIONS]?: string[];
  [LATEST_TAG_VERSION]?: string;
  [LOCAL_VERSION_MAPS]?: Record<string, string>;
}

/** Symbol properties for KnownPackage */
export interface KnownPackageSymbols {
  [LATEST_TAG_VERSION]?: string;
  [RSEMVERS]: Record<string, string | string[]>;
  [LOCK_RSEMVERS]?: Record<string, string>;
  [RESOLVE_ORDER]: string[];
}

/** Symbol properties for PkgVersionInfo */
export interface PkgVersionInfoSymbols {
  [SEMVER]: string;
  [DEP_ITEM]: unknown; // DepItem - avoid circular import
}

/** Symbol properties for PkgData */
export interface PkgDataSymbols {
  [RSEMVERS]?: Record<string, string>;
  [LOCK_RSEMVERS]?: Record<string, string>;
  [RESOLVE_ORDER]?: string[];
}
