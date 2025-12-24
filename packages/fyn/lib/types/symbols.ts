/**
 * Symbol definitions and type-safe accessors for fyn internal metadata
 *
 * This module provides:
 * 1. Symbol re-exports from the main symbols.ts file
 * 2. Interface definitions for objects with symbol properties
 * 3. Type-safe accessor functions for reading/writing symbol properties
 *
 * ## Usage
 *
 * Prefer using accessor functions over direct symbol access for:
 * - Better IDE discoverability (autocomplete `getSemver`, `getDepItem`, etc.)
 * - Type safety without manual type assertions
 * - Searchable codebase (find all SEMVER reads by searching `getSemver`)
 *
 * @example Direct symbol access (legacy):
 * ```typescript
 * const semver = pkgVersion[SEMVER];
 * pkgVersion[SEMVER] = "1.0.0";
 * ```
 *
 * @example Accessor functions (preferred):
 * ```typescript
 * const semver = getSemver(pkgVersion);
 * setSemver(pkgVersion, "1.0.0");
 * ```
 */

// Re-export all symbols from the main symbols file
export {
  LOCK_RSEMVERS,
  SEMVER,
  RSEMVERS,
  LOCK_SORTED_VERSIONS,
  LATEST_TAG_VERSION,
  LATEST_VERSION_TIME,
  SORTED_VERSIONS,
  LATEST_SORTED_VERSIONS,
  LOCAL_VERSION_MAPS,
  RESOLVE_ORDER,
  PACKAGE_RAW_INFO,
  DEP_ITEM
} from "../symbols";

// Import symbols for use in interface definitions
import {
  LOCK_RSEMVERS,
  SEMVER,
  RSEMVERS,
  LOCK_SORTED_VERSIONS,
  LATEST_TAG_VERSION,
  LATEST_VERSION_TIME,
  SORTED_VERSIONS,
  LATEST_SORTED_VERSIONS,
  LOCAL_VERSION_MAPS,
  RESOLVE_ORDER,
  PACKAGE_RAW_INFO,
  DEP_ITEM
} from "../symbols";

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
  /** Timestamp (ms since epoch) of the latest version publication */
  [LATEST_VERSION_TIME]?: number;
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

/** Symbol properties for objects with PACKAGE_RAW_INFO */
export interface PackageRawInfoSymbols {
  [PACKAGE_RAW_INFO]?: { dir: string; str: string };
}

/** Symbol properties for objects with DEP_ITEM */
export interface DepItemSymbols {
  [DEP_ITEM]?: unknown; // DepItem - avoid circular import
}

/** Symbol properties for objects with SEMVER */
export interface SemverSymbols {
  [SEMVER]?: string;
}

// =============================================================================
// Type-Safe Accessor Functions
// =============================================================================
//
// These functions provide discoverable, type-safe access to symbol properties.
// Benefits over direct symbol access:
//
// 1. IDE Discoverability - Type `get` to see all available symbol readers
// 2. Type Inference - Return types are properly inferred from constraints
// 3. Searchability - Find all uses of a symbol by searching function names
// 4. Encapsulation - Hide the Symbol implementation detail from consumers
//
// Each symbol has a getter and setter. Some have additional helpers:
// - deleteRsemversKey, deleteLockRsemversKey for map entry deletion
//
// =============================================================================

// --- SEMVER Accessors ---

/** Get the semver value from an object */
export function getSemver<T extends { [SEMVER]: string }>(obj: T): string;
export function getSemver<T extends { [SEMVER]?: string }>(obj: T): string | undefined;
export function getSemver(obj: { [SEMVER]?: string }): string | undefined {
  return obj[SEMVER];
}

/** Set the semver value on an object */
export function setSemver<T extends { [SEMVER]?: string }>(obj: T, value: string): void {
  (obj as { [SEMVER]?: string })[SEMVER] = value;
}

// --- DEP_ITEM Accessors ---

/** Get the DepItem from an object */
export function getDepItem<T extends { [DEP_ITEM]?: unknown }>(obj: T): unknown {
  return obj[DEP_ITEM];
}

/** Set the DepItem on an object */
export function setDepItem<T extends { [DEP_ITEM]?: unknown }>(obj: T, value: unknown): void {
  (obj as { [DEP_ITEM]?: unknown })[DEP_ITEM] = value;
}

// --- RSEMVERS Accessors ---

/** Get the resolved semvers record from an object */
export function getRsemvers<T extends { [RSEMVERS]: Record<string, string | string[]> }>(
  obj: T
): Record<string, string | string[]>;
export function getRsemvers<T extends { [RSEMVERS]?: Record<string, string | string[]> }>(
  obj: T
): Record<string, string | string[]> | undefined;
export function getRsemvers(
  obj: { [RSEMVERS]?: Record<string, string | string[]> }
): Record<string, string | string[]> | undefined {
  return obj[RSEMVERS];
}

/** Set the resolved semvers record on an object */
export function setRsemvers<T extends { [RSEMVERS]?: Record<string, string | string[]> }>(
  obj: T,
  value: Record<string, string | string[]>
): void {
  (obj as { [RSEMVERS]?: Record<string, string | string[]> })[RSEMVERS] = value;
}

/** Delete a key from the resolved semvers record */
export function deleteRsemversKey<T extends { [RSEMVERS]?: Record<string, string | string[]> }>(
  obj: T,
  key: string
): void {
  const rsv = obj[RSEMVERS];
  if (rsv) delete rsv[key];
}

// --- LOCK_RSEMVERS Accessors ---

/** Get the lock resolved semvers record from an object */
export function getLockRsemvers<T extends { [LOCK_RSEMVERS]?: Record<string, string | string[]> }>(
  obj: T
): Record<string, string | string[]> | undefined {
  return obj[LOCK_RSEMVERS];
}

/** Set the lock resolved semvers record on an object */
export function setLockRsemvers<T extends { [LOCK_RSEMVERS]?: Record<string, string | string[]> }>(
  obj: T,
  value: Record<string, string | string[]>
): void {
  (obj as { [LOCK_RSEMVERS]?: Record<string, string | string[]> })[LOCK_RSEMVERS] = value;
}

/** Delete a key from the lock resolved semvers record */
export function deleteLockRsemversKey<
  T extends { [LOCK_RSEMVERS]?: Record<string, string | string[]> }
>(obj: T, key: string): void {
  const lockRsv = obj[LOCK_RSEMVERS];
  if (lockRsv) delete lockRsv[key];
}

// --- RESOLVE_ORDER Accessors ---

/** Get the resolve order array from an object */
export function getResolveOrder<T extends { [RESOLVE_ORDER]: string[] }>(obj: T): string[];
export function getResolveOrder<T extends { [RESOLVE_ORDER]?: string[] }>(
  obj: T
): string[] | undefined;
export function getResolveOrder(obj: { [RESOLVE_ORDER]?: string[] }): string[] | undefined {
  return obj[RESOLVE_ORDER];
}

/** Set the resolve order array on an object */
export function setResolveOrder<T extends { [RESOLVE_ORDER]?: string[] }>(
  obj: T,
  value: string[]
): void {
  (obj as { [RESOLVE_ORDER]?: string[] })[RESOLVE_ORDER] = value;
}

// --- SORTED_VERSIONS Accessors ---

/** Get the sorted versions array from an object */
export function getSortedVersions<T extends { [SORTED_VERSIONS]?: string[] }>(
  obj: T
): string[] | undefined {
  return obj[SORTED_VERSIONS];
}

/** Set the sorted versions array on an object */
export function setSortedVersions<T extends { [SORTED_VERSIONS]?: string[] }>(
  obj: T,
  value: string[] | undefined
): void {
  (obj as { [SORTED_VERSIONS]?: string[] })[SORTED_VERSIONS] = value;
}

// --- LOCK_SORTED_VERSIONS Accessors ---

/** Get the lock sorted versions array from an object */
export function getLockSortedVersions<T extends { [LOCK_SORTED_VERSIONS]?: string[] }>(
  obj: T
): string[] | undefined {
  return obj[LOCK_SORTED_VERSIONS];
}

/** Set the lock sorted versions array on an object */
export function setLockSortedVersions<T extends { [LOCK_SORTED_VERSIONS]?: string[] }>(
  obj: T,
  value: string[] | undefined
): void {
  (obj as { [LOCK_SORTED_VERSIONS]?: string[] })[LOCK_SORTED_VERSIONS] = value;
}

// --- LATEST_SORTED_VERSIONS Accessors ---

/** Get the latest sorted versions array from an object */
export function getLatestSortedVersions<T extends { [LATEST_SORTED_VERSIONS]?: string[] }>(
  obj: T
): string[] | undefined {
  return obj[LATEST_SORTED_VERSIONS];
}

/** Set the latest sorted versions array on an object */
export function setLatestSortedVersions<T extends { [LATEST_SORTED_VERSIONS]?: string[] }>(
  obj: T,
  value: string[]
): void {
  (obj as { [LATEST_SORTED_VERSIONS]?: string[] })[LATEST_SORTED_VERSIONS] = value;
}

// --- LATEST_TAG_VERSION Accessors ---

/** Get the latest tag version from an object */
export function getLatestTagVersion<T extends { [LATEST_TAG_VERSION]?: string }>(
  obj: T
): string | undefined {
  return obj[LATEST_TAG_VERSION];
}

/** Set the latest tag version on an object */
export function setLatestTagVersion<T extends { [LATEST_TAG_VERSION]?: string }>(
  obj: T,
  value: string | undefined
): void {
  (obj as { [LATEST_TAG_VERSION]?: string })[LATEST_TAG_VERSION] = value;
}

// --- LATEST_VERSION_TIME Accessors ---

/** Get the latest version time from an object */
export function getLatestVersionTime<T extends { [LATEST_VERSION_TIME]?: number }>(
  obj: T
): number | undefined {
  return obj[LATEST_VERSION_TIME];
}

/** Set the latest version time on an object */
export function setLatestVersionTime<T extends { [LATEST_VERSION_TIME]?: number }>(
  obj: T,
  value: number
): void {
  (obj as { [LATEST_VERSION_TIME]?: number })[LATEST_VERSION_TIME] = value;
}

// --- LOCAL_VERSION_MAPS Accessors ---

/** Get the local version maps from an object */
export function getLocalVersionMaps<T extends { [LOCAL_VERSION_MAPS]?: Record<string, string> }>(
  obj: T
): Record<string, string> | undefined {
  return obj[LOCAL_VERSION_MAPS];
}

/** Set the local version maps on an object */
export function setLocalVersionMaps<T extends { [LOCAL_VERSION_MAPS]?: Record<string, string> }>(
  obj: T,
  value: Record<string, string>
): void {
  (obj as { [LOCAL_VERSION_MAPS]?: Record<string, string> })[LOCAL_VERSION_MAPS] = value;
}

// --- PACKAGE_RAW_INFO Accessors ---

/** Get the package raw info from an object */
export function getPackageRawInfo<T extends { [PACKAGE_RAW_INFO]?: { dir: string; str: string } }>(
  obj: T
): { dir: string; str: string } | undefined {
  return obj[PACKAGE_RAW_INFO];
}

/** Set the package raw info on an object */
export function setPackageRawInfo<T extends { [PACKAGE_RAW_INFO]?: { dir: string; str: string } }>(
  obj: T,
  value: { dir: string; str: string }
): void {
  (obj as { [PACKAGE_RAW_INFO]?: { dir: string; str: string } })[PACKAGE_RAW_INFO] = value;
}
