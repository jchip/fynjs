/**
 * npm Registry Types
 *
 * Type definitions for npm package registry metadata (packument).
 * These types represent the data returned by npm registry endpoints.
 */

import type { PackageMetaSymbols } from "./symbols";
import type { PackageJson } from "./package-json";

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
 * This is the data stored in versions[x] of the packument: the published package.json, plus
 * the fields the registry and fyn add. Every package.json field is optional here, including
 * name and version, because the partial metas fyn synthesizes (lock entries keyed by version,
 * opt-failure placeholders) leave them out.
 */
export interface PackageVersionMeta extends Partial<PackageJson> {
  /** Distribution info */
  dist?: PackageDist;
  /** Deprecation message if deprecated */
  deprecated?: string;

  // fyn-specific extensions
  /** Local package link type ("hard", "sym", "sym1"); the path is in `dist.fullPath` */
  local?: string;
  /** Has preinstall script - encoded as `1`, and only ever read for truth */
  hasPI?: number;
  /** Has install script (encoded as number) */
  hasI?: number;
  /** Optional dependency failure code, written by the opt resolver and the lock */
  optFailed?: number;
  /** This version's meta came from the lockfile rather than the registry */
  fromLocked?: boolean;
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
  /** URL-based versions (git, http, etc.) - full manifests, as in `versions` */
  urlVersions?: Record<string, PackageVersionMeta>;
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
  /** npm registry alias target, while the dependency name remains the install name */
  alias?: {
    name: string;
    specifier: string;
  };
}
