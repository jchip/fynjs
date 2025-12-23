/**
 * Symbol definitions for fyn internal metadata
 *
 * Re-exports symbols from the main symbols.ts file and adds
 * type-safe interfaces for accessing symbol-keyed properties.
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
