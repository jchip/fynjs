import { internalCheckIsNewer } from "./check-is-newer.ts";
import { internalFetchJSON } from "./fetch-json.ts";
import { getNpmRcConfig } from "./npm-config.ts";
import { CheckNewVersionOptions, checkPkgNewVersionEngine } from "check-pkg-new-version-engine";

/**
 * Check package new version using internal fetchDistTags and notify callback
 *
 * @param options - options
 * @returns whatever
 */
export async function checkPkgNewVersion(options: CheckNewVersionOptions): Promise<any> {
  const npmConfig = options.npmConfig || (await getNpmRcConfig());

  return checkPkgNewVersionEngine({
    fetchJSON: internalFetchJSON,
    npmConfig,
    checkIsNewer: internalCheckIsNewer,
    ...options,
  });
}
