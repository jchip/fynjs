import Path from "path";
import Fs from "fs";

/**
 * ensure a path uses `/` for separator
 */
export const posixify = Path.sep === "/" ? (x) => x : (path) => path.replace(/\\/g, "/");

// ── JSON I/O helpers ──────────────────────────────────────────────────────────
//
// Centralises the `JSON.stringify(obj, null, 2) + "\n"` / `JSON.parse(readFile(…))`
// patterns that were duplicated across fynpo-base, fynpo, pkg-preper, and fyn.
//

/**
 * Write `data` as pretty-printed JSON (2-space indent, trailing newline).
 */
export async function writeJson(file: string, data: unknown): Promise<void> {
  await Fs.promises.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

/**
 * Write `data` as pretty-printed JSON (2-space indent, trailing newline) — synchronous.
 */
export function writeJsonSync(file: string, data: unknown): void {
  Fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

/**
 * Read and parse a JSON file.
 */
export async function readJson<T = any>(file: string): Promise<T> {
  return JSON.parse(await Fs.promises.readFile(file, "utf-8"));
}

/**
 * Read and parse a JSON file — synchronous.
 */
export function readJsonSync<T = any>(file: string): T {
  return JSON.parse(Fs.readFileSync(file, "utf-8"));
}

/**
 * Read and parse `package.json` from a directory.
 */
export async function readPkgJson(dir: string): Promise<Record<string, any>> {
  return readJson(Path.join(dir, "package.json"));
}

/**
 * Read and parse `package.json` from a directory — synchronous.
 */
export function readPkgJsonSync(dir: string): Record<string, any> {
  return readJsonSync(Path.join(dir, "package.json"));
}
