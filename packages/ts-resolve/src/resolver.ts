import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Predicate testing whether a `file:` URL points at a real file. */
export type FileCheck = (url: string) => boolean;

/** TS extensions tried for an extensionless specifier, in order. */
const TS_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];

/** For each JS extension, the TS extensions that may stand in for it. */
const JS_TO_TS: Record<string, string[]> = {
  ".js": [".ts", ".tsx"],
  ".mjs": [".mts", ".ts"],
  ".cjs": [".cts", ".ts"]
};

const HAS_EXTENSION = /\.[a-z0-9]+$/i;
const JS_EXTENSION = /\.[mc]?js$/;

/** Installed packages are never remapped - they ship built JS. */
const DEFAULT_SKIP = /\/(node_modules|\.fynpo)\//;

export const defaultIsFile: FileCheck = url => {
  try {
    return statSync(fileURLToPath(url)).isFile();
  } catch {
    return false;
  }
};

export type MapperOptions = {
  /** Overridable for tests; defaults to a real filesystem stat. */
  isFile?: FileCheck;
  /** URLs matching this are left alone. */
  skip?: RegExp;
};

/**
 * Build a mapper from a resolved `file:` URL to its TypeScript source, or null
 * to leave the URL alone.
 *
 * Resolution is the whole job. Once a `.ts` URL is handed back, node's own type
 * stripping compiles it - which is why this package has no load hook and no
 * transpiler dependency.
 */
export function createTsMapper(options: MapperOptions = {}) {
  const isFile = options.isFile ?? defaultIsFile;
  const skip = options.skip ?? DEFAULT_SKIP;
  const cache = new Map<string, string | null>();

  const lookup = (url: string): string | null => {
    if (skip.test(url)) return null;

    const js = url.match(JS_EXTENSION);
    if (js) {
      // A real .js sibling always wins - never shadow a file that exists.
      if (isFile(url)) return null;
      const base = url.slice(0, -js[0].length);
      for (const ext of JS_TO_TS[js[0]]) {
        const candidate = base + ext;
        if (isFile(candidate)) return candidate;
      }
      return null;
    }

    if (!HAS_EXTENSION.test(url)) {
      for (const ext of TS_EXTENSIONS) {
        const candidate = url + ext;
        if (isFile(candidate)) return candidate;
      }
      for (const ext of TS_EXTENSIONS) {
        const candidate = url + "/index" + ext;
        if (isFile(candidate)) return candidate;
      }
    }

    return null;
  };

  return function mapTs(url: string): string | null {
    const cached = cache.get(url);
    if (cached !== undefined) return cached;
    const mapped = lookup(url);
    cache.set(url, mapped);
    return mapped;
  };
}
