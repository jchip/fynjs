import * as Path from "path";
import * as Fs from "fs/promises";
import {
  getInfo,
  extractFromObj,
  removeFromObj,
  keepStandardFields,
  renameFromObj,
  ExtractSpec,
  RemoveSpec,
  RenameSpec,
} from "./utils.ts";
import _ from "lodash";

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
    if (!_.isEmpty(removed)) {
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
  if (!_.get(pkg, "scripts.postpack") && config.autoPostPack !== false) {
    if (!config.silent) {
      console.log(
        "scripts.postpack missing, adding it.\n To skip this, set publishUtil.autoPostPack to false"
      );
    }
    _.set(pkg, "scripts.postpack", "publish-util-postpack");
  }

  if (scripts?.prepack === "publish-util-prepack") {
    delete scripts.prepack;
  }

  if (keepObj) {
    _.merge(pkg, keepObj);
  }
}

export async function prePack(): Promise<void> {
  const { pkg, pkgData, saveFile, pkgFile } = await getInfo();

  const myName = Path.basename(process.argv[1]) || "publish-util-prepack";

  try {
    const config = (pkg.publishUtil || {}) as PrePackConfig;
    if (!config.silent) {
      console.log(`${myName} saveFile`, saveFile, "pkgFile", pkgFile);
    }

    await Fs.writeFile(saveFile, pkgData);

    prePackObj(pkg, config);

    await Fs.writeFile(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
  } catch (err) {
    console.error(`${myName} failed`, err);
    process.exit(1);
  }
}
