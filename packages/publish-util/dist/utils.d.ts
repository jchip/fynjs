export interface PackageInfo {
    pkgDir: string;
    pkg: Record<string, unknown>;
    pkgData: Buffer;
    tmpDir: string;
    saveName: string;
    saveFile: string;
    pkgFile: string;
}
export declare function getInfo(cwd?: string): Promise<PackageInfo>;
/**
 * Load the info for a known package.json path.
 *
 * @param pkgFile - absolute path to the manifest
 */
export declare function loadInfo(pkgFile: string): Promise<PackageInfo>;
/**
 * Sidecar recording which manifest prepack modified, so postpack restores that exact file
 * rather than resolving one independently and possibly disagreeing.
 */
export interface SaveMeta {
    pkgFile: string;
    name?: string;
    version?: string;
    pid: number;
    ts: string;
}
export declare const metaFileOf: (saveFile: string) => string;
/**
 * Find the package.json that a **pack time** script (prepack/postpack) is operating on.
 *
 * `INIT_CWD` must never be used here.  It is the directory the user invoked the command
 * from, not the package being packed, and it is inherited: nine packages in one monorepo
 * each ran prepack against the same unrelated manifest because of it (FPM-75).
 *
 * Order of trust:
 *
 * 1. `PUBLISH_UTIL_PKG_DIR` - explicit escape hatch for an exotic runner.
 * 2. `npm_package_json` - npm, bun and fyn all set it to the manifest the script is
 *    running for.  Verified against npm 11.19.0 and bun 1.3.3.
 * 3. `<cwd>/package.json` - every packer runs lifecycle scripts from the package root
 *    ("Scripts are always run from the root of the package folder, regardless of what the
 *    current working directory is when npm is invoked").  This covers a runner that sets
 *    no npm_* env at all.
 *
 * Whatever is found is then cross checked against `npm_package_name` when the runner set
 * it, because npm_package_json is an inherited env var and can go stale exactly the way
 * INIT_CWD did.  A mismatch is a hard error - refusing is always better than rewriting
 * some other package's manifest.
 */
export declare function getPackInfo(cwd?: string): Promise<PackageInfo>;
/**
 * Update a package.json (or the prepack save file) in place, without ever leaving it
 * at zero length.
 *
 * `Fs.writeFile` opens the target with O_TRUNC and then writes.  A process killed
 * between those two steps leaves a **zero byte** manifest, and because nothing fails
 * loudly the run can still exit 0 (FPM-66: a postinstall child killed during test
 * teardown emptied a tracked package.json).
 *
 * The fix cannot be temp-file + rename: fyn hardlinks package files into node_modules,
 * and rename swaps the directory entry, so the installed copies would silently keep the
 * old content on the old inode.  Instead this opens "r+" (no O_TRUNC), writes the new
 * bytes first, and only then truncates to the new length.  The inode - and therefore
 * every hardlink to it - is preserved, and the file never passes through empty: an
 * interrupted write leaves old trailing bytes, never nothing.
 *
 * The write is skipped entirely when the content already matches, which is the common
 * case for postinstall - it used to rewrite the manifest byte for byte on every install.
 *
 * @param file - path to update
 * @param content - new content
 * @returns true if the file was written, false if it already had this content
 */
export declare function writePkgFile(file: string, content: string | Buffer): Promise<boolean>;
export type RenameSpec = Record<string, string | string[]>;
export declare function renameFromObj(obj: Record<string, unknown>, rename?: RenameSpec): void;
export type RemoveSpec = (string | Record<string, RemoveSpec>)[];
export declare function removeFromObj(obj: Record<string, unknown>, fields: RemoveSpec): void;
export type ExtractSpec = (string | Record<string, ExtractSpec>)[];
export declare function extractFromObj(obj: Record<string, unknown>, fields: ExtractSpec, output?: Record<string, unknown>): Record<string, unknown>;
export declare const keepStandardFields: string[];
