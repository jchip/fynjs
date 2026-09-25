/**
 * Installer Types
 *
 * Type definitions for package installation phase.
 * These types are used by pkg-installer and related modules.
 */

import type { PackageVersionMeta, PackageScripts } from "./npm-registry";
import type { PkgVersionInfo, ResolutionData } from "./resolution";
import type { PackageRawInfoSymbols } from "./symbols";

/**
 * Package.json as modified during installation
 *
 * Extends PackageVersionMeta with fyn-specific fields added during install.
 * These fields track script execution state and package origin.
 */
export interface InstallPkgJson extends PackageVersionMeta {
  /** fyn script execution tracking */
  _fyn: Record<string, boolean>;
  /** Original package specifier (name@semver) */
  _from?: string;
  /** Package identifier (name@version) */
  _id?: string;
  /** Deprecation message (copied from deprecated for persistence) */
  _deprecated?: string;
  /** Has preinstall script - encoded as `1`, like `PackageVersionMeta.hasPI`, and only
   * ever read for truth. It was declared `boolean` here, which nothing ever assigns. */
  hasPI?: number;
  /** Package was loaded from lock file */
  fromLocked?: boolean;
}

/**
 * package.json read off disk by `Fyn.loadJsonForPkg`. It is stored into `pkg.json`, where
 * pkg-installer reads it back as `DepInfo.json` (`InstallPkgJson`), so it is that shape plus
 * the raw-info symbol and the fields only loadJsonForPkg sets. Partial because a
 * package.json on disk may predate fyn's `_fyn` bookkeeping.
 */
export interface InstalledPkgJson extends Partial<InstallPkgJson>, PackageRawInfoSymbols {
  /** On-disk package doesn't match the version asked for */
  _invalid?: boolean;
  /** The package's own version string, before fyn cleaned it into valid semver */
  _origVersion?: string;
  /** Package has a binding.gyp */
  gypfile?: boolean;
}

/**
 * Distribution info for a package during installation
 */
export interface InstallDistInfo {
  tarball?: string;
  shasum?: string;
  integrity?: string;
  fullPath?: string;
}

/**
 * Dependency info for installation
 *
 * Extends PkgVersionInfo with installation-specific state.
 * Used by pkg-installer during the install process.
 *
 * State tracking properties:
 * - linkLocal/linkDep: Linking phase completed
 * - _removing/_removingDeps/_removed: Removal in progress (for failed optionals)
 * - install/preinstall: Scripts to execute
 */
export interface DepInfo extends PkgVersionInfo {
  /** Package.json contents (extended with install fields) */
  json?: InstallPkgJson;
  /** Distribution info */
  dist?: InstallDistInfo;
  /** Resolution data for this package's dependencies */
  res?: ResolutionData;

  // Linking state
  /** Package was linked as local (hard-link completed) */
  linkLocal?: boolean;
  /** Package dependencies were linked */
  linkDep?: boolean;
  /** Link counter for nested package linking */
  linked?: number;
  /** Bins linked into the package's own private `.bin` because they conflicted at top */
  privateBin?: Record<string, string>;

  // Display state
  /** Show deprecation warning for this package */
  showDepr?: boolean;
  /** Index of first request path (for deprecation message) */
  firstReqIdx?: number;

  // Script execution
  /** Post-install scripts to run (install, postinstall) */
  install?: string[];
  /** Has preinstall script that needs running */
  preinstall?: boolean;
  /** Fyn link data tracking script execution */
  fynLinkData?: Record<string, boolean>;

  // Removal state (for failed optional dependencies)
  /** Package is being removed */
  _removing?: boolean;
  /** Package dependencies are being removed */
  _removingDeps?: boolean;
  /** Package was removed */
  _removed?: boolean;
}

