/* eslint-disable max-statements, complexity, no-magic-numbers */

import { isCI } from "ci-info";
import { CheckNewVersionOptions, NpmConfig, PkgInfo } from "./types";
import os from "os";
import Path from "path";
import { promises as Fs } from "fs";
import mkdirp from "mkdirp";
import { internalNotify } from "./notify-new-version";

const ACCEPT = "application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*";
const ONE_DAY = 24 * 60 * 60 * 1000;
/**
 *
 * Using user provided `fetchJSON` to fetch npm package packument and retrieve dist-tags data.
 *
 * @param baseUrl - base url
 * @param _authToken - auth token
 * @param options - options
 * @returns dist tags
 */
async function fetchDistTags2(baseUrl, _authToken, options: CheckNewVersionOptions) {
  const { pkg } = options;
  const pathname = encodeURIComponent(pkg.name);
  const pkUrl = new URL(pathname, baseUrl);
  const headers = {
    "user-agent": "check-pkg-new-version-fetch",
    accept: ACCEPT,
  };

  try {
    const body = await options.fetchJSON(pkUrl.toString(), { headers });
    return body["dist-tags"];
  } catch {
    return {};
  }
}

/**
 * extract npm registry and auth token from npm config
 *
 * @param npmConfig  npm config
 * @param pkg package info
 *
 * @returns registry and auth token
 */
function getNpmRegistryInfo(npmConfig: NpmConfig, pkg: PkgInfo) {
  const pkgNames = pkg.name.split("/");
  const scope = pkgNames.length > 1 ? pkgNames[0] : "";

  const regKey = Object.keys(npmConfig).find(
    (k) => k.endsWith("registry") && (!scope || k.startsWith(scope))
  );

  const registry =
    (regKey && npmConfig[regKey]) || npmConfig.registry || "https://registry.npmjs.org/";

  const regUrl = new URL(registry);
  const regHost = `//${regUrl.host}/`;
  const authKey = Object.keys(npmConfig).find(
    (k) => k.endsWith("_authToken") && k.startsWith(regHost)
  );

  const authToken = (authKey && npmConfig[authKey]) || npmConfig._authToken || "";

  return { registry, authToken };
}

/**
 * Internal use
 *
 * @param options options
 * @returns boolean
 */
async function _internalCheck(options: CheckNewVersionOptions): Promise<any> {
  //
  if (isCI) {
    return false;
  }

  const pkg = { name: options.pkg.name, version: options.pkg.version };

  const fetchDistTags = async () => {
    const { registry, authToken } = getNpmRegistryInfo(options.npmConfig, pkg);
    if (options.fetchDistTags) {
      return await options.fetchDistTags(registry, authToken, pkg);
    } else if (options.fetchJSON) {
      return await fetchDistTags2(registry, authToken, options);
    } else {
      throw new Error("must provide one fetch method: fetchDistTags or fetchJSON");
    }
  };

  const now = Date.now();
  const tag = options.checkTag || "latest";

  const metaDir = Path.join(options.saveMetaDir || os.tmpdir(), "check-pkg-new-version");

  try {
    await mkdirp(metaDir);
  } catch {
    //
  }

  const metaFile = Path.join(metaDir, `${pkg.name}-${tag}-meta.json`);

  const readMetaFile = async () => {
    try {
      const data = await Fs.readFile(metaFile, "utf-8");
      return JSON.parse(data);
    } catch {
      return { ...pkg, time: 0, notifiedVersion: "", notifiedTime: 0 };
    }
  };

  const checkInterval = options.checkInterval || ONE_DAY;
  const existMeta = await readMetaFile();

  const shouldFetch = now - existMeta.time >= checkInterval || !existMeta.distTags;
  const distTags = shouldFetch ? await fetchDistTags() : existMeta.distTags;

  const saveMetaFile = async (notifiedVersion = "", notifiedTime = 0) => {
    await Fs.writeFile(
      metaFile,
      JSON.stringify({ ...pkg, distTags, time: now, notifiedVersion, notifiedTime })
    );
  };

  // only if we fetched for something that we need to do a check and update meta
  if (shouldFetch) {
    let notifiedVersion =
      typeof existMeta.notifiedVersion === "string" ? existMeta.notifiedVersion : "";

    let notifiedTime = existMeta.notifiedTime || 0;

    const checked = options.checkIsNewer(pkg, distTags, tag);

    if (
      checked.isNewer &&
      // if have not notified about the new version yet or if it's been 7 days since
      // last notify, then notify again
      (notifiedVersion !== checked.version || now - notifiedTime > 7 * ONE_DAY)
    ) {
      notifiedVersion = checked.version;
      notifiedTime = now;
      (options.notifyNewVersion || internalNotify)({ ...pkg, newVersion: checked.version });
    }

    await saveMetaFile(notifiedVersion, notifiedTime);
  }

  return true;
}

/**
 * Check package new version with all options customizable
 *
 * @param options - options
 * @returns whatever
 */
export async function checkPkgNewVersionEngine(options: CheckNewVersionOptions): Promise<any> {
  try {
    return await _internalCheck(options);
  } catch {
    return false;
  }
}
