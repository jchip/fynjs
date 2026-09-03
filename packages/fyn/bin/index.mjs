//
// Programmatic entry point. The release bundle is ESM (dist/fyn.mjs) because chalker uses
// top-level await to optionally load ESM-only chalk, and no CJS output format can represent
// module-scope await.
//
// The specifier is a literal so a consumer bundling this module - fynpo does - can inline
// fyn's dist rather than carrying a runtime dependency on it. That only works because fyn no
// longer resolves its own paths at module scope; see findFynCli in lib/lifecycle-scripts.ts.
//
// Loading is still deferred to the first call: standalone, this is a 3.7MB CLI, and a consumer
// holding a reference to `run` should not pay to evaluate it.
//
let bundle;

const load = async () => {
  if (!bundle) {
    bundle = await import("../dist/fyn.mjs");
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
