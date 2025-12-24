/**
 * Lock File Types
 *
 * Type definitions for fyn lock file structures (fyn-lock.yaml).
 * The lock file stores resolved dependency versions and metadata
 * to ensure reproducible installations.
 */

/**
 * Version metadata in lock file
 *
 * Represents package version data stored in the lock file.
 * Uses shorthand keys for compact serialization:
 * - `$` for integrity (maps to dist.integrity)
 * - `_` for tarball URL (maps to dist.tarball or dist.fullPath)
 *
 * When loading from lockfile, `$` and `_` are expanded into the `dist` object.
 * When saving to lockfile, `dist` is compressed into `$` and `_`.
 *
 * @example Lock file format (YAML):
 * ```yaml
 * lodash:
 *   "4.17.21":
 *     $: sha512-v2kDE... # integrity hash
 *     _: https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz
 *     hasI: 1
 * ```
 *
 * @example Local package format:
 * ```yaml
 * my-local-pkg:
 *   "1.0.0":
 *     $: local
 *     _: ./packages/my-local-pkg
 * ```
 */
export interface LockVersionMeta {
  /**
   * Integrity hash shorthand (serialized form)
   *
   * Values:
   * - `"local"` - indicates a local package (fynlocal)
   * - `string` - sha512 integrity hash (without "sha512-" prefix)
   * - `number` (0) - integrity not available
   *
   * When loading, this is expanded to `dist.integrity`.
   * When saving, `dist.integrity` is compressed to this.
   */
  $?: string | number;

  /**
   * Tarball URL shorthand (serialized form)
   *
   * Values:
   * - For remote packages: full tarball URL
   * - For local packages: relative or absolute path to package directory
   *
   * When loading, this is expanded to `dist.tarball` or `dist.fullPath`.
   * When saving, the dist URL/path is compressed to this.
   */
  _?: string;

  /** Package is a top-level (direct) dependency (1 = true) */
  top?: number;

  /** Optional dependency that failed to install (failure reason code) */
  optFailed?: number;

  /** Has preinstall script (1 = true) */
  hasPI?: number;

  /** Has install or postinstall script (1 = true) */
  hasI?: number;

  /** Is a local package (fynlocal) - set when loading from lock */
  local?: boolean;

  /** Loaded from lock file - set when populating from lock data */
  fromLocked?: boolean;

  /** Package name - set when loading from lock */
  name?: string;

  /** Package version - set when loading from lock */
  version?: string;

  /** Deprecation warning message */
  deprecated?: string;

  /** OS platform requirements from package.json */
  os?: string[];

  /** CPU architecture requirements from package.json */
  cpu?: string[];

  /**
   * Package has npm-shrinkwrap.json
   * - `1` or `true` when present
   */
  _hasShrinkwrap?: number | boolean;

  /** Package.json was not available when locking */
  _missingJson?: boolean;

  /** Lock entry is valid (false = corrupted/incomplete) */
  _valid?: boolean;

  /** Production dependencies from package.json */
  dependencies?: Record<string, string>;

  /** Optional dependencies from package.json */
  optionalDependencies?: Record<string, string>;

  /** Peer dependencies from package.json */
  peerDependencies?: Record<string, string>;

  /** Bundled dependencies from package.json */
  bundleDependencies?: string[];

  /**
   * Distribution info (expanded form, not serialized to lockfile)
   *
   * Populated when loading from lock file by expanding `$` and `_`.
   * When saving, this is compressed back to `$` and `_`.
   */
  dist?: {
    /** Integrity hash (sha512-...) */
    integrity?: string;
    /** Tarball URL for remote packages */
    tarball?: string;
    /** Full path for local packages */
    fullPath?: string;
  };
}

/**
 * Package lock data for a single package in the lock file
 *
 * Contains version entries and semver resolution mappings.
 */
export interface PkgLockData {
  /**
   * Semver resolution map (serialized form)
   *
   * Maps semver ranges to resolved versions.
   * Multiple ranges resolving to the same version are joined with commas.
   *
   * @example
   * ```yaml
   * _:
   *   "^4.0.0,~4.17.0": "4.17.21"
   *   ">=3.0.0 <4.0.0": ["3.10.1", "3.10.0"]  # multiple matches
   * ```
   */
  _?: Record<string, string | string[]>;

  /** Latest version tag from dist-tags */
  _latest?: string;

  /**
   * Version entries
   *
   * Keys are version strings, values are LockVersionMeta.
   * Special keys starting with `_` are metadata, not versions.
   */
  [version: string]: LockVersionMeta | Record<string, string | string[]> | string | undefined;
}

/**
 * Dependency item structure for lock file
 */
export interface LockDepItem {
  /** Package name */
  name: string;
  /** Semver range from package.json */
  semver?: string;
  /** Resolved version */
  resolved?: string;
  /** Internal semver tracking */
  _semver?: { $: string };
}

/**
 * Package dependency items grouped by type (runtime form)
 *
 * Used when processing dependencies from package.json.
 * Each section is an array of LockDepItem objects.
 */
export interface LockPkgDepItems {
  /** Production dependencies */
  dep?: LockDepItem[];
  /** Development dependencies */
  dev?: LockDepItem[];
  /** Optional dependencies */
  opt?: LockDepItem[];
  /** Peer dependencies */
  peer?: LockDepItem[];
}

/**
 * Package dependency items grouped by type (serialized form)
 *
 * Used in the lock file's $pkg section.
 * Each section is a Record mapping package name to semver range.
 *
 * @example Lock file format (YAML):
 * ```yaml
 * $pkg:
 *   dep:
 *     lodash: "^4.17.0"
 *     express: "^4.18.0"
 *   dev:
 *     typescript: "^5.0.0"
 * ```
 */
export interface LockPkgDepItemsSerialized {
  /** Production dependencies: name -> semver */
  dep?: Record<string, string>;
  /** Development dependencies: name -> semver */
  dev?: Record<string, string>;
  /** Optional dependencies: name -> semver */
  opt?: Record<string, string>;
  /** Peer dependencies: name -> semver */
  peer?: Record<string, string>;
}

/**
 * Root lock file data structure
 *
 * The complete structure of fyn-lock.yaml
 */
export interface LockFileData {
  /** Package dependency items for the project root (serialized form) */
  $pkg?: LockPkgDepItemsSerialized;

  /** fyn configuration snapshot */
  $fyn?: Record<string, unknown>;

  /**
   * Package lock entries
   *
   * Keys are package names, values are PkgLockData.
   * Keys starting with `$` are special metadata entries.
   */
  [pkgName: string]: PkgLockData | LockPkgDepItemsSerialized | Record<string, unknown> | undefined;
}
