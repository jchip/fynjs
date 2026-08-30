import colors from "ansi-colors";
import { makeChalker } from "./core.ts";

export type { ChalkerFn } from "./core.ts";
export { makeChalker } from "./core.ts";

//
// Static entry: colors come from a hard `import` of ansi-colors.
//
// The ansi-colors counterpart of `chalker/chalk` - same trade: no top-level await, no
// runtime-computed specifier, so bundlers resolve it and CJS consumers are not blocked by an
// async module. See `./chalk.ts` for the longer rationale.
//
// `ansi-colors` is a peer dependency. Importing this entry without it installed is a resolve
// error at import time, which is the intended, explicit failure.
//
export default makeChalker(colors);
