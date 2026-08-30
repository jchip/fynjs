//
// chalker is ESM-only and its module body ends in a top-level await (it optionally imports
// ESM-only chalk). This package is CJS, so `require("chalker")` throws ERR_REQUIRE_ASYNC_MODULE
// and the bin dies before printing anything - see FPO-29.
//
// A plain `await import("chalker")` does not help either: tsc with `module: CommonJS` rewrites
// it back into that same `require`. The import has to go through `Function` so a real dynamic
// import survives the compile.
//
// There is one chalker call site and it already sits inside an async function, so loading it
// there costs nothing. Colors are optional: when chalker cannot be loaded we strip the
// `<cyan>text</>` markers instead, which is what chalker's own `remove()` does. Output stays
// readable either way.
//

export type Chalker = (s: TemplateStringsArray | string, ...args: unknown[]) => string;

const dynamicImport = new Function("specifier", "return import(specifier)");

/**
 * Rebuild the string from a tagged template call, or pass a plain string through.
 *
 * @param s - template strings from a tagged template, or a plain string
 * @param args - interpolated values
 * @returns the assembled string, markers included
 */
function joinTemplate(s: TemplateStringsArray | string, args: unknown[]): string {
  if (!Array.isArray(s)) {
    return s === undefined || s === null ? "" : String(s);
  }

  let out = "";
  let i = 0;
  for (; i < args.length; i++) {
    out += s[i] + String(args[i]);
  }

  return out + s[i];
}

/**
 * Drop chalker's `<cyan>text</>` color markers.
 *
 * @param str - string possibly containing markers
 * @returns the string with every marker removed
 */
export function stripMarkers(str: string): string {
  return str.replace(/<[^>]*>/g, "");
}

/**
 * Colorless stand-in for chalker, used when chalker cannot be loaded.
 */
export const plainCk: Chalker = (s, ...args) => stripMarkers(joinTemplate(s, args));

/**
 * Load chalker through a real dynamic import.
 *
 * Never rejects - colors are optional, so a failure yields the marker-stripping fallback.
 *
 * @returns chalker, or {@link plainCk} if it could not be loaded
 */
export async function loadCk(): Promise<Chalker> {
  try {
    const mod = await dynamicImport("chalker");
    return (mod?.default || mod) as Chalker;
  } catch {
    return plainCk;
  }
}
