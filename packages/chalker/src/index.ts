import { makeOptionalImport } from "optional-import";
import { makeChalker } from "./core.ts";

export type { ChalkerFn } from "./core.ts";
export { makeChalker } from "./core.ts";

//
// The auto-detecting entry: take whichever of chalk / ansi-colors is installed.
//
// This is the historical default and stays the default. It costs a top-level await, which is
// what makes this entry unusable from `require()` (ERR_REQUIRE_ASYNC_MODULE) and what forces a
// bundler to leave the color module external -- the specifier is only known at runtime.
//
// If you know which colors module you have, import a static entry instead and pay neither cost:
//
//   import ck from "chalker/chalk";
//   import ck from "chalker/ansi-colors";
//

// optional import from this module's own context, used to optionally load
// chalk/ansi-colors without failing the whole module load when neither is installed.
//
// `import()` reaches both CJS and ESM, so this covers ESM-only chalk 5/6 as well as
// CJS-only ansi-colors -- `createRequire` could only ever load the latter.
const optionalImport = makeOptionalImport(import.meta);

async function loadColors(): Promise<any> {
  let colors = (await optionalImport("chalk")) || (await optionalImport("ansi-colors"));

  if (!colors) {
    // just go for chalk and let its module-not-found error propagate
    colors = await optionalImport("chalk", {
      notFound: err => {
        throw err;
      }
    });
  }

  return colors;
}

// top-level await: consumers that statically import chalker have their own evaluation
// deferred until this settles, so the very first format call already has colors loaded.
//
// This is what makes this entry unusable from `require()` -- ERR_REQUIRE_ASYNC_MODULE. That is
// deliberate as of 2.0; loading ESM-only chalk cannot be done synchronously, so CJS consumers
// must use `await import("chalker")` -- or one of the static entries, which have no await.
export default makeChalker(await loadColors());
