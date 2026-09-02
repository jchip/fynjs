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
