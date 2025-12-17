// @ts-nocheck

import _ from "lodash";
import Path from "path";
import xenvConfig from "xenv-config";

/** Configuration spec for fyn environment variables */
export interface FynConfigSpec {
  registry: string;
  pkgFile: string;
  targetDir: string;
  fynDir: string;
  fynCacheDir: string;
  lockfile: boolean;
}

const spec = {
  registry: { env: "FYN_REGISTRY", default: "http://localhost:4873" },
  pkgFile: { env: "FYN_PACKAGE_FILE", default: "package.json" },
  targetDir: { env: "FYN_TARGET_DIR", default: "xout" },
  fynDir: {
    env: ["FYN_DIR", "USERPROFILE", "HOME"],
    default: process.cwd(),
    post: (v: string, t: { src: string; name: string }) => {
      if ((t.src === "env" && t.name !== "FYN_DIR") || t.src === "default") {
        return Path.join(v, ".fyn");
      }
      return v;
    }
  }
};

/**
 * Create fyn configuration from environment variables and overrides
 * @param override - Optional configuration overrides
 * @returns Merged configuration object
 */
export function fynConfig(override?: Record<string, unknown>): FynConfigSpec & Record<string, unknown> {
  const configKeys = Object.keys(spec);
  const userConfig = _.pick(override, configKeys);
  const config = xenvConfig(spec, userConfig, { sources: ["option", "env"] });
  config.fynCacheDir = Path.join(config.fynDir, "_cacache");
  config.lockfile = true;

  return Object.assign(config, _.omit(override, configKeys));
}

export default fynConfig;