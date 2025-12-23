/**
 * npm Registry Types
 *
 * Type definitions for npm package registry metadata (packument).
 * These types represent the data returned by npm registry endpoints.
 */

import type { PackageMetaSymbols } from "./symbols";

/**
 * Package distribution info from registry
 *
 * Contains integrity hash and tarball URL for a specific version.
 */
export interface PackageDist {
  /** Subresource Integrity hash (preferred over shasum) */
  integrity?: string;
  /** SHA-1 hash (legacy, use integrity when available) */
  shasum?: string;
  /** URL to download the tarball */
  tarball?: string;
  /** Local path for local packages */
  localPath?: string;
  /** Full resolved path */
  fullPath?: string;
}

/**
 * Package version metadata from registry
 *
 * Represents the metadata for a single version of a package.
 * This is the data stored in versions[x] of the packument.
 */
export interface PackageVersionMeta {
  /** Package name */
  name: string;
  /** Package version */
  version: string;
  /** Distribution info */
  dist?: PackageDist;
  /** npm scripts */
  scripts?: PackageScripts;
  /** Supported operating systems */
  os?: string[];
  /** Supported CPU architectures */
  cpu?: string[];
  /** Deprecation message if deprecated */
  deprecated?: string;
  /** Production dependencies */
  dependencies?: Record<string, string>;
  /** Development dependencies */
  devDependencies?: Record<string, string>;
  /** Optional dependencies */
  optionalDependencies?: Record<string, string>;
  /** Peer dependencies */
  peerDependencies?: Record<string, string>;
  /** Peer dependency metadata */
  peerDependenciesMeta?: Record<string, PeerDependencyMeta>;
  /** Bundle dependencies (legacy) */
  bundleDependencies?: string[];
  /** Bundle dependencies (alternate spelling) */
  bundledDependencies?: string[];

  // fyn-specific extensions
  /** Local package path */
  local?: string;
  /** Has preinstall script (encoded as number) */
  hasPI?: number;
  /** Has install script (encoded as number) */
  hasI?: number;
  /** Package has npm-shrinkwrap.json */
  _hasShrinkwrap?: boolean;
  /** Shrinkwrap data */
  _shrinkwrap?: ShrinkwrapData;
  /** Package.json was not found/valid */
  _missingJson?: boolean;
}

/**
 * Package scripts from package.json
 */
export interface PackageScripts {
  preinstall?: string;
  install?: string;
  postinstall?: string;
  postInstall?: string;
  prepublish?: string;
  prepublishOnly?: string;
  prepare?: string;
  prepack?: string;
  postpack?: string;
  [key: string]: string | undefined;
}

/**
 * Peer dependency metadata
 */
export interface PeerDependencyMeta {
  /** Whether the peer dependency is optional */
  optional?: boolean;
}

/**
 * npm-shrinkwrap.json data structure
 */
export interface ShrinkwrapData {
  name?: string;
  version?: string;
  lockfileVersion?: number;
  dependencies?: Record<string, ShrinkwrapDependency>;
}

/**
 * Shrinkwrap dependency entry
 */
export interface ShrinkwrapDependency {
  version?: string;
  resolved?: string;
  integrity?: string;
  requires?: Record<string, string>;
  dependencies?: Record<string, ShrinkwrapDependency>;
}

/**
 * Package metadata from registry (packument)
 *
 * This is the full document returned by the registry for a package.
 * Contains all versions and dist-tags.
 */
export interface PackageMeta extends PackageMetaSymbols {
  /** Package name */
  name?: string;
  /** All published versions */
  versions: Record<string, PackageVersionMeta>;
  /** Distribution tags (e.g., "latest", "next") */
  "dist-tags"?: Record<string, string>;
  /** Publication timestamps for each version */
  time?: Record<string, string>;
  /** Local package marker */
  local?: string;
  /** Cached JSON string representation */
  jsonStr?: string;
  /** URL-based versions (git, http, etc.) */
  urlVersions?: Record<string, { version: string }>;
}

/**
 * Semver analysis result from semverUtil.analyze()
 */
export interface SemverAnalysis {
  /** The semver or specifier */
  $: string;
  /** Secondary specifier */
  $$?: string;
  /** Path for file/local specifiers */
  path?: string;
  /** Type of local specifier (file, link, etc.) */
  localType?: string;
  /** Type of URL specifier (git, http, etc.) */
  urlType?: string;
}
