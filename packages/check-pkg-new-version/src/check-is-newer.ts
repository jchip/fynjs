import { PkgInfo } from "check-pkg-new-version-engine";
import semver from "semver";

/**
 * Internal version to check if dist tags has a version newer than pkg
 *
 * @param pkg package
 * @param distTags dist tags
 * @param tag tag to check
 * @returns true|false
 */
export function internalCheckIsNewer(
  pkg: PkgInfo,
  distTags: Record<string, string>,
  tag?: string
): boolean {
  return semver.gt(distTags[tag], pkg.version);
}
