import { PkgInfo, CheckResult } from "check-pkg-new-version-engine";
import semver from "semver";

/**
 * Internal version to check if dist tags has a version newer than pkg
 *
 * @param pkg package
 * @param distTags dist tags
 * @param tag tag to check
 * @returns CheckResult with isNewer and version
 */
export function internalCheckIsNewer(
  pkg: PkgInfo,
  distTags: Record<string, string>,
  tag?: string
): CheckResult {
  const version = distTags[tag];
  return {
    isNewer: semver.gt(version, pkg.version),
    version
  };
}
