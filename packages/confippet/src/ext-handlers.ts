import * as jsYaml from "js-yaml";
import * as fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

/**
 * Load a config partial from a JS module.
 *
 * @param fullFilePath full path to the file
 *
 * @returns If it's an ES module and has `default`, then `default` is returned,
 *   else returns the module as config partial.
 */
function loadJs(fullFilePath: string): unknown {
  const configMod = require(fullFilePath);

  if (configMod.__esModule) {
    if (Object.prototype.hasOwnProperty.call(configMod, "default")) {
      return configMod.default;
    } else {
      // will be using the whole module as config partial, so hide the ES module flag
      try {
        Object.defineProperty(configMod, "__esModule", { enumerable: false });
      } catch {
        // oh well, can't hide it
      }
    }
  }

  return configMod;
}

/** load a config partial from a YAML file */
const loadYaml = (fullFilePath: string): unknown =>
  jsYaml.load(fs.readFileSync(fullFilePath, "utf8"));

/**
 * The handler used for each config file extension in `extSearch`.
 */
export const extHandlers: Record<string, (fullFilePath: string) => unknown> = {
  json: loadJs,
  js: loadJs,
  yaml: loadYaml,
  ts: loadJs
};

export default extHandlers;
