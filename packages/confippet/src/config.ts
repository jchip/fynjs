import { getPresetConfig } from "./preset-store.js";

/**
 * The preset config store, composed from the environment.
 *
 * This is the same object as `confippet.config`, so importing either gets you
 * the one shared store.
 */
export const config = getPresetConfig();

export default config;
