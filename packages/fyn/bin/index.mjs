//
// Programmatic entry point. The release bundle is ESM (dist/fyn.mjs) because chalker uses
// top-level await to optionally load ESM-only chalk, and no CJS output format can represent
// module-scope await.
//
// The bundle is reached through a URL built at runtime rather than a literal specifier, and
// that is load-bearing rather than stylistic: a literal is statically analyzable, so a consumer
// that bundles this module - fynpo does - inlines the whole ~3.7MB fyn bundle into its own and
// ships a frozen second copy of a package it already depends on. A computed URL keeps fyn a
// runtime dependency of its consumers, which is what it should be.
//
// Loading is deferred to the first call for the same reason it always was: this is the whole
// CLI, and a consumer holding a reference to `run` should not pay to evaluate it.
//
import { fileURLToPath, pathToFileURL } from "node:url";
import Path from "node:path";

const bundleUrl = pathToFileURL(
  Path.join(Path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "fyn.mjs")
).href;

let bundle;

const load = async () => {
  if (!bundle) {
    bundle = await import(bundleUrl);
  }
  return bundle;
};

/**
 * @param {...unknown} args forwarded to the CLI's run
 * @returns {Promise<unknown>} what the CLI's run resolves to
 */
export const run = async (...args) => (await load()).run(...args);

/**
 * @param {...unknown} args forwarded to the CLI's fun
 * @returns {Promise<unknown>} what the CLI's fun resolves to
 */
export const fun = async (...args) => (await load()).fun(...args);

export default { run, fun };
