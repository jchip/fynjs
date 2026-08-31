import processConfig from "./process-config.js";
import composeConfig from "./compose-config.js";
import presetConfig from "./preset-config.js";
import store from "./store.js";
import providerTypes from "./provider-types.js";
import util from "./util.js";
import extHandlers from "./ext-handlers.js";
import { loadConfig } from "./load-config.js";
import { getPresetConfig } from "./preset-store.js";

export { processConfig, composeConfig, presetConfig, store, providerTypes, util, extHandlers };
export { loadConfig };
export { Config } from "./store.js";
export { defaultOpts } from "./default-compose-opts.js";
export type { MissingRef } from "./process-config.js";
export type {
  ExtHandler,
  LoadContext,
  LoadOptions,
  ProviderTypes
} from "./load-config.js";

/**
 * Confippet - compose a NodeJS application's configuration from partial files.
 */
export const confippet = {
  processConfig,
  composeConfig,
  presetConfig,
  store,
  providerTypes,
  extHandlers,
  util,
  loadConfig
};

Object.defineProperty(confippet, "config", {
  enumerable: true,
  get: () => getPresetConfig()
});

export default confippet;
