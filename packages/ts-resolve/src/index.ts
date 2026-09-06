import Module, { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createTsMapper } from "./resolver.ts";
import type { MapperOptions } from "./resolver.ts";

export { createTsMapper, defaultIsFile } from "./resolver.ts";
export type { FileCheck, MapperOptions } from "./resolver.ts";

type ResolveContext = { parentURL?: string };
type ResolveResult = { url: string; shortCircuit?: boolean };
type NextResolve = (specifier: string, context: ResolveContext) => ResolveResult;

/** A mapper from a resolved `file:` URL to its TypeScript source, or null. */
type MapTs = (url: string) => string | null;

/**
 * Build the resolve hook. Separated from {@link install} so the mapping
 * decision can be tested without registering anything on the process.
 */
export function createResolveHook(options: MapperOptions = {}) {
  const mapTs = createTsMapper(options);

  return function resolve(
    specifier: string,
    context: ResolveContext,
    nextResolve: NextResolve
  ): ResolveResult {
    if (specifier.startsWith(".") && context.parentURL) {
      const mapped = mapTs(new URL(specifier, context.parentURL).href);
      // Deliberately no `format`: node infers module-typescript /
      // commonjs-typescript and applies its own stripping. Setting it here
      // suppresses that and the file arrives unstripped.
      if (mapped) return { url: mapped, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  };
}

type CjsParent = { filename?: string | null } | null | undefined;
type ResolveFilename = (
  request: string,
  parent: CjsParent,
  isMain: boolean,
  options?: unknown
) => string;

/**
 * Build the CommonJS counterpart of {@link createResolveHook}, wrapping a
 * `Module._resolveFilename` implementation. Exported for the same reason the
 * resolve hook is: so the mapping can be tested without patching the process.
 */
export function createResolveFilename(mapTs: MapTs, next: ResolveFilename): ResolveFilename {
  return function _resolveFilename(this: unknown, request, parent, isMain, options) {
    const parentFile = parent?.filename;
    if (request.startsWith(".") && parentFile) {
      const mapped = mapTs(new URL(request, pathToFileURL(parentFile)).href);
      // _resolveFilename deals in paths, not URLs - the mapper speaks URLs.
      if (mapped) return fileURLToPath(mapped);
    }
    return next.call(this, request, parent, isMain, options);
  };
}

/**
 * Cover `require()` on node < 26.2.
 *
 * A CommonJS file run as the entry point is loaded through the ESM loader's
 * CJS translator, and below 26.2 the `require` that translator hands it goes
 * straight to `Module._resolveFilename` without consulting `registerHooks` -
 * so the resolve hook never sees those specifiers and `require("./lib.js")`
 * fails with MODULE_NOT_FOUND. Patching the CJS resolver covers that path.
 *
 * Resolution is all that is missing: node's CJS loader already strips types
 * from a `.ts` file it is handed, on every version this package supports.
 *
 * From 26.2 the hook handles this path itself and the patch agrees with it, so
 * it stays installed unconditionally rather than sniffing `process.version`.
 */
function patchCjsResolve(mapTs: MapTs): void {
  const mod = Module as unknown as { _resolveFilename: ResolveFilename };
  mod._resolveFilename = createResolveFilename(mapTs, mod._resolveFilename);
}

/**
 * Install the resolve hooks so node can load this repo's TypeScript directly.
 *
 * Each call registers another hook and wraps the CJS resolver again, so call it
 * once per process - `./register` is the usual entry point.
 */
export function install(options: MapperOptions = {}): void {
  registerHooks({ resolve: createResolveHook(options) } as never);
  patchCjsResolve(createTsMapper(options));
}
