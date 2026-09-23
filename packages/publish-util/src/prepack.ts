import * as Path from "path";
import * as Fs from "fs/promises";
import {
  getPackInfo,
  metaFileOf,
  extractFromObj,
  removeFromObj,
  keepStandardFields,
  renameFromObj,
  withPackLock,
  writePkgFile,
  type SaveMeta,
  type ExtractSpec,
  type RemoveSpec,
  type RenameSpec,
} from "./utils.js";
import { isEmpty, merge, set } from "lodash-es";

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
    if (!isEmpty(removed)) {
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
    set(pkg, "scripts.postpack", "publish-util-postpack");
  }

  if (scripts?.prepack === "publish-util-prepack") {
    delete scripts.prepack;
  }

  if (keepObj) {
    merge(pkg, keepObj);
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

    await withPackLock(saveFile, async () => {
      const metaFile = metaFileOf(saveFile);
      const active = await Fs.readFile(metaFile, "utf8").then(
        data => JSON.parse(data) as SaveMeta,
        () => undefined
      );

      if (active) {
        if (active.pkgFile !== pkgFile) {
          throw new Error(
            `publish-util: ${active.pkgFile} is already using backup ${saveFile}`
          );
        }
        active.activePacks = (active.activePacks ?? 1) + 1;
        await writePkgFile(metaFile, `${JSON.stringify(active, null, 2)}\n`);
        return;
      }

      await writePkgFile(saveFile, pkgData);
      // Record which manifest was modified so postpack restores that exact file instead of
      // resolving one on its own and possibly disagreeing. Written after the save file, so
      // metadata present always implies the backup is there too.
      await writePkgFile(
        metaFile,
        `${JSON.stringify(
          {
            pkgFile,
            name: pkg.name,
            version: pkg.version,
            pid: process.pid,
            ts: new Date().toISOString(),
            activePacks: 1
          },
          null,
          2
        )}\n`
      );

      prePackObj(pkg, config);

      await writePkgFile(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
    });
  } catch (err) {
    console.error(`${myName} failed`, err);
    process.exit(1);
  }
}
