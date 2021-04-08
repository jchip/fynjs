/* eslint-disable no-magic-numbers */

import { CheckResult, PkgInfo } from "./types";
import assert from "assert";

/**
 * Internal version to check if dist tags has a version newer than pkg.
 *
 * This uses simple logic and assumes that version is in x.y.z form, where
 * x/y/z are all numbers.
 *
 * @param pkg package info
 * @param distTags dist tags
 * @param tag tag to use
 *
 * @returns the newer version or ""
 */
export function internalCheckIsNewer(
  pkg: PkgInfo,
  distTags: Record<string, string>,
  tag?: string
): CheckResult {
  const current = pkg.version;
  const newer = distTags[tag];

  assert(current, `invalid version ${current}`);
  assert(newer, `invalid version ${newer}`);

  const currentX = current.toString().split(".");
  const newerX = newer.toString().split(".");

  assert(currentX.length === 3, `invalid version ${current}`);
  assert(newerX.length === 3, `invalid version ${newer}`);

  const currentN = currentX.map((s) => parseInt(s, 10));
  const newerN = newerX.map((s) => parseInt(s, 10));
  const diffs = currentN.map((v, i) => newerN[i] - v);

  const isNewer = Boolean(diffs.find((d) => Number.isInteger(d) && d > 0));

  if (isNewer) {
    return { isNewer, version: newer };
  } else {
    return { isNewer: false };
  }
}
