import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { TokenModuleFactory, TokenModuleLoader, TokenModuleNamespace } from "./types.js";

const handlerCache = new Map<string, Promise<TokenModuleLoader>>();

function failureFactory(path: string, reason: "failed to load" | "not found"): TokenModuleFactory {
  return () => ({
    process: () => `\n@fynjs/tag-renderer: token process module ${path} ${reason}\n`,
  });
}

export function resolveTokenModulePath(path: string, templateDir = process.cwd()): string {
  if (path.startsWith("file:")) return fileURLToPath(path);

  const requireFromTemplate = createRequire(
    pathToFileURL(`${templateDir}/__tag-renderer-loader.cjs`),
  );
  return requireFromTemplate.resolve(path);
}

function selectHandler(loaded: TokenModuleNamespace, customCall?: string): TokenModuleLoader {
  if (typeof loaded.tokenHandler === "function") return loaded.tokenHandler;
  if (typeof loaded.default === "function") return loaded.default;
  if (customCall && typeof loaded[customCall] === "function") return loaded;

  throw new TypeError(
    "@fynjs/tag-renderer: token module invalid - expected a default or tokenHandler function",
  );
}

export async function loadTokenModuleHandler(
  path: string,
  templateDir = process.cwd(),
  customCall?: string,
): Promise<TokenModuleLoader> {
  let resolvedPath: string;
  try {
    resolvedPath = resolveTokenModulePath(path, templateDir);
  } catch {
    return failureFactory(path, "not found");
  }

  const cacheKey = `${resolvedPath}\0${customCall ?? ""}`;
  let pending = handlerCache.get(cacheKey);
  if (!pending) {
    pending = import(pathToFileURL(resolvedPath).href)
      .then((namespace) => selectHandler(namespace as TokenModuleNamespace, customCall))
      .catch((error) => {
        handlerCache.delete(cacheKey);
        if (error instanceof TypeError && error.message.includes("token module invalid")) {
          throw error;
        }
        return failureFactory(path, "failed to load");
      });
    handlerCache.set(cacheKey, pending);
  }

  return pending;
}

export function tokenModuleDirectory(importMetaUrl: string): string {
  return dirname(fileURLToPath(importMetaUrl));
}
