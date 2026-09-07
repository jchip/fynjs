import * as Path from "path";
import {
  getPackInfo,
  metaFileOf,
  extractFromObj,
  removeFromObj,
  keepStandardFields,
  renameFromObj,
  writePkgFile,
  type ExtractSpec,
  type RemoveSpec,
  type RenameSpec,
} from "./utils.js";
function deepMerge<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
  for (const key of Object.keys(source)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    const sVal = source[key];
    const tVal = target[key];
    if (
      sVal &&
      typeof sVal === "object" &&
      !Array.isArray(sVal) &&
      tVal &&
      typeof tVal === "object" &&
      !Array.isArray(tVal)
    ) {
      deepMerge(tVal as Record<string, unknown>, sVal as Record<string, unknown>);
    } else {
      target[key as keyof T] = sVal as any;
    }
  }
  return target;
}

export interface PrePackConfig {
  rename?: RenameSpec;
  keep?: ExtractSpec;
  remove?: RemoveSpec;
  removeExtraKeys?: boolean;
  autoPostPack?: boolean;
  silent?: boolean;
}

export function prePackObj(pkg: Record<string, unknown>, config: PrePackConfig = {}): void {
  renameFromObj(pkg, config.rename);

  const keepObj = config.keep && extractFromObj(pkg, config.keep);

  if (config.remove) {
    removeFromObj(pkg, config.remove);
  }

  delete pkg.publishUtil;

  if (config.removeExtraKeys !== false) {
    const removed = Object.keys(pkg).filter(
      (k) => !keepStandardFields.includes(k)
    );
    if (removed.length > 0) {
      if (!config.silent) {
        console.log(
          "removed non-standard fields:",
          removed.join(", "),
          "\n  To skip this, set publishUtil.removeExtraKeys to false"
        );
      }
      removed.forEach((k) => delete pkg[k]);
    }
  }

  const scripts = pkg.scripts as Record<string, string> | undefined;
  if (!scripts?.postpack && config.autoPostPack !== false) {
    if (!config.silent) {
      console.log(
        "scripts.postpack missing, adding it.\n To skip this, set publishUtil.autoPostPack to false"
      );
    }
    if (!pkg.scripts) {
      pkg.scripts = {};
    }
    (pkg.scripts as Record<string, string>).postpack = "publish-util-postpack";
  }

  if (scripts?.prepack === "publish-util-prepack") {
    delete scripts.prepack;
  }

  if (keepObj) {
    deepMerge(pkg, keepObj);
  }
}

export async function prePack(): Promise<void> {
  const { pkg, pkgData, saveFile, pkgFile } = await getPackInfo();

  const myName = Path.basename(process.argv[1]) || "publish-util-prepack";

  try {
    const config = (pkg.publishUtil || {}) as PrePackConfig;
    if (!config.silent) {
      console.log(`${myName} saveFile`, saveFile, "pkgFile", pkgFile);
    }

    await writePkgFile(saveFile, pkgData);
    // record which manifest was modified so postpack restores that exact file instead of
    // resolving one on its own and possibly disagreeing.  Written after the save file, so
    // meta present always implies the backup is there too.
    await writePkgFile(
      metaFileOf(saveFile),
      `${JSON.stringify(
        {
          pkgFile,
          name: pkg.name,
          version: pkg.version,
          pid: process.pid,
          ts: new Date().toISOString()
        },
        null,
        2
      )}\n`
    );

    prePackObj(pkg, config);

    await writePkgFile(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
  } catch (err) {
    console.error(`${myName} failed`, err);
    process.exit(1);
  }
}
