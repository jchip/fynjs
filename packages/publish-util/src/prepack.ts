import * as Path from "path";
import * as Fs from "fs/promises";
import {
  getPackInfo,
  metaFileOf,
  extractFromObj,
  removeFromObj,
  keepStandardFields,
  liveOwners,
  packOwner,
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

// true when a script runs publish-util-prepack, alone or chained as in
// "xrun build && publish-util-prepack"
const runsPrePack = (script: unknown): boolean =>
  typeof script === "string" && script.includes("publish-util-prepack");

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

  if (scripts && runsPrePack(scripts.prepack)) {
    delete scripts.prepack;
  }

  if (scripts?.prepublishOnly === "publish-util-prepublishonly") {
    delete scripts.prepublishOnly;
  }

  if (keepObj) {
    merge(pkg, keepObj);
  }
}

/**
 * The legacy prepublishOnly hook. prepack does the pruning now. When the package's prepack
 * also runs publish-util-prepack, this skips, so npm publish doesn't prune twice and leave
 * the manifest pruned after postpack.
 */
export async function prePublishOnly(): Promise<void> {
  const { pkg } = await getPackInfo();
  const scripts = pkg.scripts as Record<string, string> | undefined;
  if (!runsPrePack(scripts?.prepack)) {
    return prePack();
  }
  if (!(pkg.publishUtil as PrePackConfig | undefined)?.silent) {
    console.log("publish-util-prepublishonly: scripts.prepack runs publish-util-prepack, skipping");
  }
}

export async function prePack(): Promise<void> {
  const info = await getPackInfo();
  const { saveFile, pkgFile } = info;
  let { pkg, pkgData } = info;

  const myName = Path.basename(process.argv[1]) || "publish-util-prepack";

  try {
    let config = (pkg.publishUtil || {}) as PrePackConfig;
    if (!config.silent) {
      console.log(`${myName} saveFile`, saveFile, "pkgFile", pkgFile);
    }

    await withPackLock(saveFile, async stalePid => {
      const metaFile = metaFileOf(saveFile);
      const owner = packOwner();
      const active = await Fs.readFile(metaFile, "utf8").then(
        data => JSON.parse(data) as SaveMeta,
        () => undefined
      );

      if (active) {
        const owners = liveOwners(active);
        if ((active.pid === stalePid && active.activePacks === 1) || !owners.length) {
          // Every pack using this backup is gone: its prepack died holding the lock, so no
          // other pack joined, or the owners of all packs are dead. None will run postpack.
          // Do that postpack's restore, then start fresh.
          const saved = await Fs.readFile(saveFile);
          await writePkgFile(active.pkgFile, saved);
          if (active.pkgFile === pkgFile) {
            pkgData = saved;
            pkg = JSON.parse(saved.toString()) as Record<string, unknown>;
            config = (pkg.publishUtil || {}) as PrePackConfig;
          }
        } else {
          if (active.pkgFile !== pkgFile) {
            throw new Error(
              `publish-util: ${active.pkgFile} is already using backup ${saveFile}`
            );
          }
          active.owners = [...owners, owner];
          active.activePacks = active.owners.length;
          await writePkgFile(metaFile, `${JSON.stringify(active, null, 2)}\n`);
          return;
        }
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
            activePacks: 1,
            owners: [owner]
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
