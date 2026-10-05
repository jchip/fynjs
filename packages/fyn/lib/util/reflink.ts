import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import logger from "../logger";

/**
 * Clone `files` (relative paths) from `srcDir` into `destDir`, replacing existing destinations.
 * Where a clone isn't possible, `hardlink` hardlinks the file instead of copying it, and
 * `copyFallback` false fails instead of copying.
 */
export type CloneFiles = (
  srcDir: string,
  destDir: string,
  files: string[],
  hardlink?: boolean,
  copyFallback?: boolean
) => Promise<CloneStats>;

/** how many files cloneFiles placed each way */
export interface CloneStats {
  cloned: number;
  linked: number;
  copied: number;
}

/**
 * Clone the whole dir `src` to `dest` in one call. `dest` must not exist. Resolves false where
 * the filesystem can't clone a dir (anything but APFS).
 */
export type CloneDir = (src: string, dest: string) => Promise<boolean>;

let nativeReflink: Promise<{ cloneFiles: CloneFiles; cloneDir?: CloneDir } | undefined> | undefined;

/**
 * @fynjs/reflink is a native addon, so it cannot be bundled into dist/. Load it at runtime from
 * an optional dependency, and resolve to undefined when it is absent or has no binary for
 * this platform.
 */
function loadReflink() {
  nativeReflink ??= (async () => {
    try {
      const file = createRequire(import.meta.url).resolve("@fynjs/reflink");
      return await import(/* @vite-ignore */ pathToFileURL(file).href);
    } catch (err) {
      logger.debug(`@fynjs/reflink not loaded, using JS clone: ${(err as Error).message}`);
      return undefined;
    }
  })();
  return nativeReflink;
}

export async function loadReflinkCloneFiles(): Promise<CloneFiles | undefined> {
  return (await loadReflink())?.cloneFiles;
}

/** undefined with no reflink, or an reflink older than cloneDir */
export async function loadReflinkCloneDir(): Promise<CloneDir | undefined> {
  return (await loadReflink())?.cloneDir;
}
