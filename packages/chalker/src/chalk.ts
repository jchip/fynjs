import chalk from "chalk";
import { makeChalker } from "./core.ts";

export type { ChalkerFn } from "./core.ts";
export { makeChalker } from "./core.ts";

//
// Static entry: colors come from a hard `import` of chalk.
//
// Use this when you know chalk is there. Compared to the default entry it has no top-level
// await and no runtime-computed specifier, which means:
//
// - a bundler resolves chalk statically and inlines it, instead of leaving a dynamic
//   `import()` that fails at runtime when nothing installed chalk next to the bundle
// - a consumer that already imports chalk itself shares that exact module instance, so there
//   is one chalk with one color-support state rather than two
//
// `chalk` is a peer dependency. Importing this entry without it installed is a resolve error
// at import time, which is the intended, explicit failure.
//
export default makeChalker(chalk);
