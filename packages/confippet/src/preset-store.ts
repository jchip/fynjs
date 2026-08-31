import store from "./store.js";
import presetConfig from "./preset-config.js";

let cached: any;

/**
 * The process-wide preset config store, composed on first access.
 *
 * Loading is deferred rather than done at import time because `autoLoad` reads
 * `NODE_CONFIG_DIR`, `NODE_ENV` and friends - a caller setting those before
 * touching the config would otherwise be too late.
 *
 * @returns the shared store, the same object every call
 */
export function getPresetConfig(): any {
  if (!cached) {
    cached = store();
    presetConfig.autoLoad(cached);
  }
  return cached;
}

export default getPresetConfig;
