/**
 * Package.json Types
 *
 * Type definitions for package.json files, including both
 * standard npm fields and fyn-specific extensions.
 */

import type { PackageScripts, PackageDist } from "./npm-registry";

/**
 * Standard package.json structure
 *
 * Covers the common fields used by npm and fyn.
 */
export interface PackageJson {
  /** Package name (required) */
  name: string;
  /** Package version (required for publishing) */
  version: string;
  /** Package description */
  description?: string;
  /** Entry point */
  main?: string;
  /** ES module entry point */
  module?: string;
  /** TypeScript types entry */
  types?: string;
  /** Export map */
  exports?: PackageExports;
  /** npm scripts */
  scripts?: PackageScripts;
  /** Production dependencies */
  dependencies?: Record<string, string>;
  /** Development dependencies */
  devDependencies?: Record<string, string>;
  /** Optional dependencies */
  optionalDependencies?: Record<string, string>;
  /** Development optional dependencies (fyn-specific) */
  devOptDependencies?: Record<string, string>;
  /** Peer dependencies */
  peerDependencies?: Record<string, string>;
  /** Peer dependency metadata */
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  /** Bundle dependencies */
  bundleDependencies?: string[];
  /** Bundle dependencies (alternate) */
  bundledDependencies?: string[];
  /** Binary executables */
  bin?: string | Record<string, string>;
  /** Repository info */
  repository?: string | { type: string; url: string; directory?: string };
  /** Author info */
  author?: string | PersonInfo;
  /** Contributors */
  contributors?: Array<string | PersonInfo>;
  /** License */
  license?: string;
  /** Keywords for npm search */
  keywords?: string[];
  /** Homepage URL */
  homepage?: string;
  /** Bug tracker */
  bugs?: string | { url?: string; email?: string };
  /** Engines compatibility */
  engines?: Record<string, string>;
  /** OS compatibility */
  os?: string[];
  /** CPU compatibility */
  cpu?: string[];
  /** Private package flag */
  private?: boolean;
  /** Publish config */
  publishConfig?: PublishConfig;
  /** Workspaces for monorepos */
  workspaces?: string[] | { packages: string[] };
  /** Files to include in package */
  files?: string[];
  /** Package type (module or commonjs) */
  type?: "module" | "commonjs";
  /** npm config values (exposed via npm_package_config_* env vars) */
  config?: Record<string, unknown>;
  /** Yarn/npm resolution overrides for nested dependencies */
  resolutions?: Record<string, string>;
  /** npm overrides for nested dependencies */
  overrides?: Record<string, string | Record<string, string>>;
  /** Indicates package has native bindings (node-gyp) */
  gypfile?: boolean;
  /** fyn-specific configuration */
  fyn?: FynConfig;
  /** Publish utility configuration */
  publishUtil?: Record<string, unknown>;
}

/**
 * Package.json with fyn-specific extensions
 *
 * Extended fields added by fyn during installation.
 */
export interface FynPackageJson extends PackageJson {
  /** fyn tracking flags for scripts that have run */
  _fyn?: Record<string, boolean>;
  /** Origin of the package (for npm ls) */
  _from?: string;
  /** Package identifier (name@version) */
  _id?: string;
  /** Deprecation notice */
  _deprecated?: string;
  /** Has preinstall script marker */
  hasPI?: boolean;
  /** Distribution info */
  dist?: PackageDist;
}

/**
 * Person info for author/contributors
 */
export interface PersonInfo {
  name: string;
  email?: string;
  url?: string;
}

/**
 * Publish configuration
 */
export interface PublishConfig {
  registry?: string;
  access?: "public" | "restricted";
  tag?: string;
}

/**
 * Package exports map
 *
 * Supports conditional exports and subpath exports.
 */
export type PackageExports =
  | string
  | null
  | PackageExportsConditions
  | Record<string, string | null | PackageExportsConditions>;

/**
 * Conditional exports
 */
export interface PackageExportsConditions {
  import?: string | PackageExportsConditions;
  require?: string | PackageExportsConditions;
  node?: string | PackageExportsConditions;
  default?: string | PackageExportsConditions;
  types?: string | PackageExportsConditions;
  [condition: string]: string | PackageExportsConditions | undefined;
}

/**
 * fynlocal configuration in package.json
 */
export interface FynLocalConfig {
  [packageName: string]: string | boolean;
}

/**
 * fyn configuration in package.json
 *
 * The `fyn` section supports dependency overrides that can use boolean
 * values to enable/disable dependencies or string semver values.
 */
export interface FynConfig {
  /** fynlocal mappings */
  fynlocal?: FynLocalConfig;
  /** Central store mode */
  centralStore?: boolean;
  /** Lock file only mode */
  lockOnly?: boolean;
  /** Save exact versions */
  saveExact?: boolean;
  /** Dependency overrides (boolean to enable/disable, or string for version) */
  dependencies?: Record<string, string | boolean>;
  /** Dev dependency overrides */
  devDependencies?: Record<string, string | boolean>;
  /** Optional dependency overrides */
  optionalDependencies?: Record<string, string | boolean>;
  /** Dev optional dependency overrides */
  devOptDependencies?: Record<string, string | boolean>;
}
