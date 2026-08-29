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
