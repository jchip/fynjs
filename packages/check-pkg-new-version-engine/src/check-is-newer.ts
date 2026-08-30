import { CheckResult, PkgInfo } from "./types.js";
import semver from "semver";

/** what npm calls the current release when no tag is asked for */
const DEFAULT_TAG = "latest";

/**
 * Internal version to check if dist tags has a version newer than pkg.
 *
 * Comparison is delegated to `semver`. The previous implementation split on "." and asked
 * whether ANY component grew:
 *
 * ```js
 * const diffs = currentN.map((v, i) => newerN[i] - v);
 * const isNewer = Boolean(diffs.find((d) => d > 0));
 * ```
 *
 * which reports an OLDER release as newer whenever a lower-precedence component happens to be
 * larger - `3.0.0` vs a `latest` of `2.9.9` gives diffs `[-1, 9, 9]`, finds the `9`, and says
 * upgrade. Version precedence is decided by the first component that differs, not by any of
 * them. It also mis-parsed prereleases: `parseInt("0-beta")` is `0`, so `1.0.0-beta` compared
 * equal to `1.0.0`. See FJM-19.
 *
 * Invalid input yields `{ isNewer: false }` rather than throwing. This runs in the background
 * of someone else's CLI, so a malformed version means "cannot tell", not "take the host process
 * down with an assert".
 *
 * @param pkg package info
 * @param distTags dist tags
 * @param tag tag to use, defaults to `latest`
 *
 * @returns whether the tagged version is newer, and that version when it is
 */
export function internalCheckIsNewer(
  pkg: PkgInfo,
  distTags: Record<string, string>,
  tag: string = DEFAULT_TAG
): CheckResult {
  const current = pkg?.version;
  const newer = distTags?.[tag || DEFAULT_TAG];

  if (!semver.valid(current) || !semver.valid(newer)) {
    return { isNewer: false };
  }

  return semver.gt(newer, current) ? { isNewer: true, version: newer } : { isNewer: false };
}
