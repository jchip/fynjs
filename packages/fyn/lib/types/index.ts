/**
 * fyn Type Definitions
 *
 * Centralized type definitions for fyn package manager.
 * Import from this module for all shared types.
 *
 * @example
 * ```typescript
 * import type { PackageMeta, PackageVersionMeta, PkgVersionInfo } from "./types";
 * ```
 */

// Symbol definitions and typed accessors
export {
  // Symbols
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
  DEP_ITEM,
  // Symbol interfaces
  type PackageMetaSymbols,
  type KnownPackageSymbols,
  type PkgVersionInfoSymbols,
  type PkgDataSymbols
} from "./symbols";

// npm Registry types
export type {
  PackageDist,
  PackageVersionMeta,
  PackageScripts,
  PeerDependencyMeta,
  ShrinkwrapData,
  ShrinkwrapDependency,
  PackageMeta,
  SemverAnalysis
} from "./npm-registry";

// Package.json types
export type {
  PackageJson,
  FynPackageJson,
  PersonInfo,
  PublishConfig,
  PackageExports,
  PackageExportsConditions,
  FynLocalConfig,
  FynConfig
} from "./package-json";

// Resolution types
export type {
  ResolutionEntry,
  ResolutionData,
  PkgVersionInfo,
  KnownPackage,
  KnownPackageLegacy,
  PkgData,
  DepthInfoItem,
  DepthData,
  DepthResolving,
  NestedResolution,
  QueueDepthItem,
  PromiseItem,
  ResolveResult
} from "./resolution";

// Installer types
export type { InstallPkgJson, InstallDistInfo, DepInfo } from "./installer";

// Lock file types
export type {
  LockVersionMeta,
  PkgLockData,
  LockDepItem,
  LockPkgDepItems,
  LockPkgDepItemsSerialized,
  LockFileData
} from "./lock-file";
