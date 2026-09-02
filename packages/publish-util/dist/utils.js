import * as Fs from "fs/promises";
import * as Os from "os";
import * as Path from "path";
import { findUp } from "find-up";
import _ from "lodash";
export async function getInfo(cwd = process.env.INIT_CWD || process.cwd()) {
    const pkgFile = await findUp("package.json", { cwd });
    if (!pkgFile) {
        throw new Error(`No package.json found starting from directory: ${cwd}`);
    }
    const pkgDir = Path.dirname(pkgFile);
    const pkgData = await Fs.readFile(pkgFile);
    const pkg = JSON.parse(pkgData.toString());
    const tmpDir = Os.tmpdir();
    const pkgName = pkg.name || "unknown";
    const saveName = `package-util-${pkgName.replace(/[@\/]/g, "_")}_pkg.json`;
    const saveFile = Path.join(tmpDir, saveName);
    return { pkgDir, pkg, pkgData, tmpDir, saveName, saveFile, pkgFile };
}
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
export async function writePkgFile(file, content) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const existing = await Fs.readFile(file).catch(() => undefined);
    if (existing && existing.equals(data)) {
        return false;
    }
    if (!existing) {
        // nothing to preserve or corrupt yet
        await Fs.writeFile(file, data);
        return true;
    }
    const fh = await Fs.open(file, "r+");
    try {
        await fh.write(data, 0, data.length, 0);
        await fh.truncate(data.length);
    }
    finally {
        await fh.close();
    }
    return true;
}
function transferField(f, from, to) {
    if (f.startsWith("/")) {
        const parts = f.split("/");
        if (parts.length === 3) {
            const regex = new RegExp(parts[1], parts[2]);
            Object.keys(from).forEach((fk) => {
                if (fk.match(regex)) {
                    to[fk] = from[fk];
                }
            });
            return;
        }
    }
    to[f] = from[f];
}
function deleteFields(f, obj) {
    if (f.startsWith("/")) {
        const parts = f.split("/");
        if (parts.length === 3) {
            const regex = new RegExp(parts[1], parts[2]);
            Object.keys(obj).forEach((fk) => {
                if (fk.match(regex)) {
                    delete obj[fk];
                }
            });
            return;
        }
    }
    delete obj[f];
}
export function renameFromObj(obj, rename) {
    if (rename) {
        for (const key in rename) {
            const data = _.get(obj, key);
            if (data !== undefined && rename[key]) {
                _.unset(obj, key);
                _.set(obj, rename[key], data);
            }
        }
    }
}
export function removeFromObj(obj, fields) {
    for (const f of fields) {
        if (typeof f === "string") {
            deleteFields(f, obj);
        }
        else {
            Object.keys(f).forEach((f2) => {
                removeFromObj(obj[f2], f[f2]);
            });
        }
    }
}
export function extractFromObj(obj, fields, output = {}) {
    for (const f of fields) {
        if (typeof f === "string") {
            transferField(f, obj, output);
            continue;
        }
        for (const f2 of Object.keys(f)) {
            const obj2 = obj[f2];
            // falsy is just a primitive, safe to assign
            if (!obj2) {
                output[f2] = obj2;
                continue;
            }
            const t = typeof obj2;
            if (t === "number" ||
                t === "string" ||
                t === "boolean" ||
                t === "bigint" ||
                t === "symbol") {
                // assign primitive
                output[f2] = obj2;
            }
            else {
                // extract into potential object
                const constructor = obj2.constructor;
                output[f2] = extractFromObj(obj2, f[f2], new constructor());
            }
        }
    }
    return output;
}
// https://docs.npmjs.com/cli/v7/configuring-npm/package-json
export const keepStandardFields = [
    "name",
    "version",
    "description",
    "keywords",
    "homepage",
    "bugs",
    "license",
    "author",
    "contributors",
    "funding",
    "files",
    "main",
    "browser",
    "bin",
    "man",
    "directories",
    "repository",
    "scripts",
    "config",
    "dependencies",
    // "devDependencies",
    "peerDependencies",
    "peerDependenciesMeta",
    "bundledDependencies",
    "bundleDependencies", // npm accepts both spellings
    "optionalDependencies",
    "engines",
    "os",
    "cpu",
    "libc", // glibc/musl selection, complements os/cpu
    "private",
    "publishConfig",
    //   "workspaces"
    // extras
    "module",
    "type", // module type
    "types", // typescript types
    "typings", // legacy alias of types
    "typesVersions", // per-TS-version type mappings
    "sideEffects", // bundler tree-shaking hint
    // ESM
    "exports", // subpath exports entry point
    "imports", // subpath imports entry point
    // CDN entry points
    "unpkg",
    "jsdelivr",
];
