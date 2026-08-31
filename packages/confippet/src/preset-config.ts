import util from "./util.js";

/**
 * Compose a store from the directories and deployment named by the environment.
 *
 * Env is read with bracket access so bundlers cannot inline `NODE_ENV` at
 * build time - these must reflect the live process.
 *
 * Reads `NODE_CONFIG_DIR`, any `NODE_CONFIG_DIR_<n>` series, `NODE_ENV` and
 * `NODE_APP_INSTANCE`, then composes and (unless
 * `AUTO_LOAD_CONFIG_PROCESS_OFF` is set) resolves templates.
 *
 * @param config the store to load into
 * @param options extra compose options, overridden by the environment
 */
export function load(config: any, options?: any): void {
  options = options || {};

  const dirs: string[] = [];

  for (let i = 0, dir = ""; (dir = process.env[`NODE_CONFIG_DIR_${i}`]); ++i) {
    dirs.push(dir);
  }

  if (dirs.length > 0 && process.env["NODE_CONFIG_DIR"]) {
    dirs.push(process.env["NODE_CONFIG_DIR"]);
  }

  if (dirs.length > 0) {
    console.log("config dirs", dirs);
  }

  util.merge(options, {
    dirs: dirs.length > 0 && dirs,
    dir: process.env["NODE_CONFIG_DIR"],
    context: {
      deployment: process.env["NODE_ENV"],
      instance: process.env["NODE_APP_INSTANCE"]
    }
  });

  config._$.compose(options);

  if (!process.env["AUTO_LOAD_CONFIG_PROCESS_OFF"]) {
    config._$.process();
  }
}

/**
 * `load`, unless `AUTO_LOAD_CONFIG_OFF` is set.
 *
 * @param config the store to load into
 * @param options extra compose options
 */
export function autoLoad(config: any, options?: any): void {
  if (!process.env["AUTO_LOAD_CONFIG_OFF"]) {
    load(config, options);
  }
}

export const presetConfig = { load, autoLoad };

export default presetConfig;
