// @ts-nocheck

import os from "os";
import Fs from "fs";
import Path from "path";
import Ini from "ini";
import _ from "lodash";
import logger from "../lib/logger";
import defaultRc from "./default-rc";
import fynTil from "../lib/util/fyntil";

/**
 * Get CI environment value if detected
 */
function getCiValue(): string | undefined {
  const ciEnvKey = ["CI", "BUILD_ENV"].find(k => process.env[k]);
  return ciEnvKey ? process.env[ciEnvKey] : undefined;
}

/**
 * Check if a section name matches current environment.
 * Section formats:
 *   - ENV_VAR:value - matches if ENV_VAR equals value
 *   - ENV1|ENV2:value - matches if ENV1=value OR ENV2=value
 *   - IS_CI - matches if any CI is detected (CI or BUILD_ENV set)
 *   - CI:value - matches if any CI env (CI, BUILD_ENV) equals specific value
 */
function sectionMatches(section: string): boolean {
  // IS_CI - any CI detection
  if (section === "IS_CI") {
    return getCiValue() !== undefined;
  }

  // CI:value - specific CI value match (checks all CI env vars)
  if (section.startsWith("CI:")) {
    const expectedValue = section.slice(3);
    const ciValue = getCiValue();
    return ciValue === expectedValue;
  }

  // ENV_VAR:value or ENV1|ENV2:value
  const colonIdx = section.indexOf(":");
  if (colonIdx > 0) {
    const envPart = section.slice(0, colonIdx);
    const expectedValue = section.slice(colonIdx + 1);
    const envVars = envPart.split("|");
    return envVars.some(envVar => process.env[envVar] === expectedValue);
  }

  return false;
}

/**
 * Get section priority for cascade ordering.
 * Higher number = applied later (takes precedence)
 */
function getSectionPriority(section: string): number {
  if (section.startsWith("CI:")) return 3;   // specific CI - highest
  if (section === "IS_CI") return 2;          // any CI
  return 1;                                    // env matches
}

// replace any ${ENV} values with the appropriate environ.
// copied from https://github.com/npm/config/blob/1f47a6c6ae7864b412d45c6a4a74930cf3365395/lib/env-replace.js

const envExpr = /(?<!\\)(\\*)\$\{([^${}]+)\}/g;

function replaceEnv(f, env) {
  return f.replace(envExpr, (orig, esc, name) => {
    const val = env[name] !== undefined ? env[name] : `$\{${name}}`;

    // consume the escape chars that are relevant.
    if (esc.length % 2) {
      return orig.slice((esc.length + 1) / 2);
    }

    return esc.slice(esc.length / 2) + val;
  });
}

function replaceRcEnv(rc, env) {
  for (const k in rc) {
    if (rc[k] && rc[k].replace) {
      rc[k] = replaceEnv(rc[k], env);
    }
  }
}

/**
 * Extract defaults and apply matching sections in cascade order for .fynrc
 * Cascade order: defaults → env matches → CI:true → $CI:value
 */
function applyFynrcSections(parsed: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};

  // Extract top-level non-object values as defaults
  for (const key in parsed) {
    if (parsed[key] === null || typeof parsed[key] !== "object") {
      result[key] = parsed[key];
    }
  }

  // Find all matching sections
  const matchingSections: string[] = [];
  for (const key in parsed) {
    if (typeof parsed[key] === "object" && parsed[key] !== null) {
      if (sectionMatches(key)) {
        matchingSections.push(key);
      }
    }
  }

  // Sort by priority (lower priority applied first, higher priority overrides)
  matchingSections.sort((a, b) => getSectionPriority(a) - getSectionPriority(b));

  // Apply matching sections in order
  for (const section of matchingSections) {
    Object.assign(result, parsed[section]);
    logger.debug(`Applied .fynrc section [${section}]`);
  }

  return result;
}

function readRc(fname: string) {
  const rcFname = Path.basename(fname);

  try {
    const rcData = Fs.readFileSync(fname).toString();
    let rc = Ini.parse(rcData);

    // For .fynrc files, apply section logic
    if (rcFname === ".fynrc") {
      rc = applyFynrcSections(rc);
    }

    logger.debug(`Loaded ${rcFname} RC`, fname, JSON.stringify(fynTil.removeAuthInfo(rc)));
    return rc;
  } catch (e) {
    if (e.code !== "ENOENT") {
      logger.error(`Failed to process ${rcFname} RC file`, fname, e.message);
    }
    return {};
  }
}

function loadRc(cwd, fynpoDir) {
  const npmrcData = [];

  if (cwd === false || cwd === undefined) {
    return {
      npmrc: {}
    };
  }

  const homeDir = os.homedir();

  const files = [
    process.env.NPM_CONFIG_GLOBALCONFIG,
    Path.join(process.env.PREFIX || "", "/etc/npmrc"),
    process.env.NPM_CONFIG_USERCONFIG,
    Path.join(homeDir, ".npmrc"),
    Path.join(homeDir, ".fynrc"),

    // fynpo dir
    fynpoDir && fynpoDir !== cwd && Path.join(fynpoDir, ".npmrc"),
    fynpoDir && fynpoDir !== cwd && Path.join(fynpoDir, ".fynrc"),

    Path.join(cwd, ".npmrc"),
    Path.join(cwd, ".fynrc")
  ].filter(x => x);

  const data = files.map(fp => {
    const x = readRc(fp);
    if (fp.endsWith("npmrc")) {
      npmrcData.push(x);
    }
    return x;
  });

  const all = _.merge.apply(_, [{}, defaultRc].concat(data));
  const npmrc = _.merge.apply(_, [{}].concat(npmrcData));

  replaceRcEnv(all, process.env);
  replaceRcEnv(npmrc, process.env);

  return {
    all,
    npmrc,
    data,
    npmrcData,
    files
  };
}

export default loadRc;
