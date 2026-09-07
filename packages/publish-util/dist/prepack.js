import * as Path from "path";
import { getPackInfo, metaFileOf, extractFromObj, removeFromObj, keepStandardFields, renameFromObj, writePkgFile, } from "./utils.js";
function deepMerge(target, source) {
    for (const key of Object.keys(source)) {
        if (key === "__proto__" || key === "constructor" || key === "prototype")
            continue;
        const sVal = source[key];
        const tVal = target[key];
        if (sVal &&
            typeof sVal === "object" &&
            !Array.isArray(sVal) &&
            tVal &&
            typeof tVal === "object" &&
            !Array.isArray(tVal)) {
            deepMerge(tVal, sVal);
        }
        else {
            target[key] = sVal;
        }
    }
    return target;
}
export function prePackObj(pkg, config = {}) {
    renameFromObj(pkg, config.rename);
    const keepObj = config.keep && extractFromObj(pkg, config.keep);
    if (config.remove) {
        removeFromObj(pkg, config.remove);
    }
    delete pkg.publishUtil;
    if (config.removeExtraKeys !== false) {
        const removed = Object.keys(pkg).filter((k) => !keepStandardFields.includes(k));
        if (removed.length > 0) {
            if (!config.silent) {
                console.log("removed non-standard fields:", removed.join(", "), "\n  To skip this, set publishUtil.removeExtraKeys to false");
            }
            removed.forEach((k) => delete pkg[k]);
        }
    }
    const scripts = pkg.scripts;
    if (!(scripts === null || scripts === void 0 ? void 0 : scripts.postpack) && config.autoPostPack !== false) {
        if (!config.silent) {
            console.log("scripts.postpack missing, adding it.\n To skip this, set publishUtil.autoPostPack to false");
        }
        if (!pkg.scripts) {
            pkg.scripts = {};
        }
        pkg.scripts.postpack = "publish-util-postpack";
    }
    if ((scripts === null || scripts === void 0 ? void 0 : scripts.prepack) === "publish-util-prepack") {
        delete scripts.prepack;
    }
    if (keepObj) {
        deepMerge(pkg, keepObj);
    }
}
export async function prePack() {
    const { pkg, pkgData, saveFile, pkgFile } = await getPackInfo();
    const myName = Path.basename(process.argv[1]) || "publish-util-prepack";
    try {
        const config = (pkg.publishUtil || {});
        if (!config.silent) {
            console.log(`${myName} saveFile`, saveFile, "pkgFile", pkgFile);
        }
        await writePkgFile(saveFile, pkgData);
        // record which manifest was modified so postpack restores that exact file instead of
        // resolving one on its own and possibly disagreeing.  Written after the save file, so
        // meta present always implies the backup is there too.
        await writePkgFile(metaFileOf(saveFile), `${JSON.stringify({
            pkgFile,
            name: pkg.name,
            version: pkg.version,
            pid: process.pid,
            ts: new Date().toISOString()
        }, null, 2)}\n`);
        prePackObj(pkg, config);
        await writePkgFile(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
    }
    catch (err) {
        console.error(`${myName} failed`, err);
        process.exit(1);
    }
}
