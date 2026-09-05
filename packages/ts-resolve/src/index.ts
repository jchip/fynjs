import { registerHooks } from "node:module";
import { createTsMapper } from "./resolver.ts";
import type { MapperOptions } from "./resolver.ts";

export { createTsMapper, defaultIsFile } from "./resolver.ts";
export type { FileCheck, MapperOptions } from "./resolver.ts";

type ResolveContext = { parentURL?: string };
type ResolveResult = { url: string; shortCircuit?: boolean };
type NextResolve = (specifier: string, context: ResolveContext) => ResolveResult;

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

/**
 * Install the resolve hook so node can load this repo's TypeScript directly.
 *
 * Each call registers another hook, so call it once per process - `./register`
 * is the usual entry point.
 */
export function install(options: MapperOptions = {}): void {
  registerHooks({ resolve: createResolveHook(options) } as never);
}
