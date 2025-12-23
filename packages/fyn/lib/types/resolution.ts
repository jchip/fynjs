/**
 * Resolution Types
 *
 * Type definitions for dependency resolution data structures.
 * These types are used during package resolution and installation.
 */

import type { PackageDist, PackageVersionMeta } from "./npm-registry";
import type { KnownPackageSymbols, PkgVersionInfoSymbols, PkgDataSymbols } from "./symbols";

/**
 * Resolution data for a dependency's nested dependencies
 */
export interface ResolutionEntry {
  /** Resolved version string */
  resolved: string;
}

/**
 * Resolution data for a package's dependencies
 *
 * Tracks how each dependency was resolved.
 */
export interface ResolutionData {
  /** Regular dependency resolutions */
  dep?: Record<string, ResolutionEntry>;
  /** Optional dependency resolutions */
  opt?: Record<string, ResolutionEntry>;
}

/**
 * Package version info stored in dep data
 *
 * Contains resolved package information including source,
 * dependencies, and installation state.
 */
export interface PkgVersionInfo extends PkgVersionInfoSymbols {
  /** Package name */
  name: string;
  /** Package version */
  version: string;
  /** Distribution info */
  dist: PackageDist;
  /** Source type (e.g., "npm", "git", "file") */
  src: string;
  /** Dependency source (dep, dev, opt, peer) */
  dsrc: string;
  /** Resolved nested dependencies */
  res: ResolutionData;
  /** Request paths that led to this package */
  requests: string[][];
  /** Package was promoted to top level */
  promoted?: boolean;
  /** Package is a direct dependency */
  top?: boolean;
  /** Tarball has been extracted */
  extracted?: boolean;
  /** Local package path */
  local?: string;
  /** Installation directory */
  dir?: string;
  /** Cached string representation */
  str?: string;
  /** Package.json contents */
  json?: PackageVersionMeta;
  /** Deprecation message */
  deprecated?: string;
  /** Pre-installed in node_modules */
  preInstalled?: boolean;
  /** Optional dependency failure code */
  optFailed?: number;
  /** Resolved from lock file */
  fromLock?: boolean;
  /** Has preinstall script (encoded) */
  hasPI?: number;
  /** Has install script (encoded) */
  hasI?: number;
  /** Priority for installation order */
  priority: number;
  /** Has npm-shrinkwrap.json */
  _hasShrinkwrap?: boolean;
  /** Has at least one non-optional dependent */
  _hasNonOpt?: boolean;
}

/**
 * Known package with resolved versions
 *
 * Tracks all resolved versions of a package during resolution.
 * Uses a Map-like structure for version lookups.
 */
export interface KnownPackage extends KnownPackageSymbols {
  /** Version info indexed by version string */
  versions: Map<string, PkgVersionInfo>;
}

/**
 * Legacy KnownPackage with index signature
 *
 * For backward compatibility with code using bracket notation.
 * @deprecated Use KnownPackage with versions Map instead
 */
export interface KnownPackageLegacy extends KnownPackageSymbols {
  [version: string]: PkgVersionInfo | string | string[] | Record<string, string | string[]> | undefined;
}

/**
 * Package data with symbol properties
 *
 * Used in pkg-installer for tracking package state.
 */
export interface PkgData extends PkgDataSymbols {
  /** Package was promoted */
  promoted?: boolean;
  /** Linked to node_modules */
  linked?: number;
}

/**
 * Depth info item for a package at a specific depth
 */
export interface DepthInfoItem {
  /** DepItem instances at this depth */
  items: unknown[]; // DepItem[] - avoid circular import
  /** Resolved versions */
  versions?: string[];
  /** Package dependency items */
  depItems?: unknown[]; // PkgDepItems[]
}

/**
 * Depth resolving data for a specific depth level
 */
export interface DepthData {
  [pkgName: string]: DepthInfoItem;
}

/**
 * Depth resolving state tracking
 *
 * Tracks resolution progress at each depth level.
 */
export interface DepthResolving {
  /** Current depth being resolved */
  current?: number;
  /** Depth data indexed by depth number */
  [depth: number]: DepthData;
}

/**
 * Nested resolution tracking for a package
 *
 * Used by DepItem to track nested dependency resolutions.
 */
export interface NestedResolution {
  /** All resolved versions */
  _: string[];
  /** Versions indexed by semver range */
  [semver: string]: string | string[];
}

/**
 * Queue item for depth-based resolution
 */
export interface QueueDepthItem {
  /** Package name */
  name: string;
  /** Semver range */
  semver: string;
  /** Depth level */
  depth: number;
}

/**
 * Promise tracking item for async resolution
 */
export interface PromiseItem {
  /** The promise */
  promise: Promise<unknown>;
  /** Package name */
  name: string;
  /** Optional extra data */
  extra?: unknown;
}

/**
 * Resolution result from resolver
 */
export interface ResolveResult {
  /** Resolved version */
  version: string;
  /** Whether it was resolved from cache/lock */
  fromLock?: boolean;
  /** Package metadata */
  meta?: PackageVersionMeta;
}
