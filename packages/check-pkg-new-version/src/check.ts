import { internalCheckIsNewer } from "./check-is-newer.js";
import { internalFetchJSON } from "./fetch-json.js";
import { getNpmRcConfig } from "./npm-config.js";
import { type CheckNewVersionOptions, checkPkgNewVersionEngine } from "check-pkg-new-version-engine";

/**
 * Check package new version using internal fetchDistTags and notify callback
 *
 * @param options - options
 * @returns whatever
 */
export async function checkPkgNewVersion(options: CheckNewVersionOptions): Promise<any> {
  // drop keys set to undefined so they don't override the defaults below
  const given = Object.fromEntries(
    Object.entries(options).filter(([, v]) => v !== undefined)
  ) as CheckNewVersionOptions;
  const npmConfig = given.npmConfig || (await getNpmRcConfig());

  return checkPkgNewVersionEngine({
    fetchJSON: internalFetchJSON,
    npmConfig,
    checkIsNewer: internalCheckIsNewer,
    ...given,
  });
}
