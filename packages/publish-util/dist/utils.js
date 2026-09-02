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
    return loadInfo(pkgFile);
}
/**
 * Load the info for a known package.json path.
 *
 * @param pkgFile - absolute path to the manifest
 */
export async function loadInfo(pkgFile) {
    const pkgDir = Path.dirname(pkgFile);
    const pkgData = await Fs.readFile(pkgFile);
    const pkg = JSON.parse(pkgData.toString());
    const tmpDir = Os.tmpdir();
    const pkgName = pkg.name || "unknown";
    const saveName = `package-util-${pkgName.replace(/[@\/]/g, "_")}_pkg.json`;
    const saveFile = Path.join(tmpDir, saveName);
    return { pkgDir, pkg, pkgData, tmpDir, saveName, saveFile, pkgFile };
}
export const metaFileOf = (saveFile) => `${saveFile}.meta.json`;
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
export async function getPackInfo(cwd = process.cwd()) {
    const override = process.env.PUBLISH_UTIL_PKG_DIR;
    const fromEnv = process.env.npm_package_json;
    let pkgFile;
    let lookedIn = cwd;
    if (override) {
        lookedIn = Path.resolve(override);
        pkgFile = Path.join(lookedIn, "package.json");
    }
    else if (fromEnv && (await exists(fromEnv))) {
        lookedIn = "env npm_package_json";
        pkgFile = Path.resolve(fromEnv);
    }
    else {
        const atCwd = Path.join(cwd, "package.json");
        pkgFile = (await exists(atCwd)) ? atCwd : await findUp("package.json", { cwd });
    }
    if (!pkgFile || !(await exists(pkgFile))) {
        throw new Error(`publish-util: no package.json found for this package (looked in ${lookedIn})`);
    }
    const info = await loadInfo(pkgFile);
    if (override) {
        // an explicit override is an instruction, not a hint - it exists precisely for the
        // case where detection is wrong, so it must not be second guessed by the env below
        console.log(`publish-util: using ${pkgFile} from PUBLISH_UTIL_PKG_DIR`);
        return info;
    }
    const expectName = process.env.npm_package_name;
    if (expectName && info.pkg.name !== expectName) {
        throw new Error(`publish-util: refusing to touch ${pkgFile} - it is '${info.pkg.name}' but the package manager says this script belongs to '${expectName}'.` +
            ` Set PUBLISH_UTIL_PKG_DIR if this package's directory cannot be detected.`);
    }
    const expectVersion = process.env.npm_package_version;
    if (expectVersion && info.pkg.version !== expectVersion) {
        console.warn(`publish-util: ${pkgFile} is version ${info.pkg.version} but the package manager says ${expectVersion}`);
    }
    return info;
}
async function exists(file) {
    return Fs.access(file).then(() => true, () => false);
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
