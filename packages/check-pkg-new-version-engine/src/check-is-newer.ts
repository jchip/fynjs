/* eslint-disable no-magic-numbers */

import { PkgInfo } from "./types";
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
 * @returns true|false
 */
export function internalCheckIsNewer(
  pkg: PkgInfo,
  distTags: Record<string, string>,
  tag?: string
): boolean {
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

  return Boolean(diffs.find((d) => Number.isInteger(d) && d > 0));
}
