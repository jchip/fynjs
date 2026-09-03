/**
 * `@fynpo/base` public surface.
 *
 * This was also the home of the original discovery API - `PackageInfo`, `readFynpoPackages`
 * and `makePkgDeps` - which `FynpoDepGraph` replaced. `fynpo prepare` was its last caller;
 * once that migrated (FJM-25) the ~390 lines behind it had no consumers left and were
 * removed, so this file is now just the barrel.
 */

export * from "./fynpo-dep-graph.js";

export * from "./fynpo-config.js";

export * from "./packages-config.js";

export * from "./gitignore.js";

export * from "./util.js";

export * as caching from "./caching.js";
