import * as Path from "path";
import * as Fs from "fs/promises";
import { getPackInfo, metaFileOf, writePkgFile, SaveMeta } from "./utils.js";

/**
 * Restore the manifest prepack saved.
 *
 * The path prepack recorded wins over the one resolved here: only prepack knows for
 * certain which file it modified, and if the two disagree - two checkouts of the same
 * package, a runner that moved cwd - restoring to the resolved path would write the
 * backup over the wrong manifest and leave the real one pruned (FPM-75).
 *
 * Save files written by an older publish-util have no sidecar, so the resolved path
 * stays as the fallback.
 */
export async function postPack(): Promise<void> {
  const myName = Path.basename(process.argv[1]) || "publish-util-postpack";

  try {
    const { pkgFile, saveFile } = await getPackInfo();
    const metaFile = metaFileOf(saveFile);

    const meta = await Fs.readFile(metaFile, "utf8").then(
      data => JSON.parse(data) as SaveMeta,
      () => undefined
    );

    const target = meta?.pkgFile || pkgFile;

    if (meta?.pkgFile && meta.pkgFile !== pkgFile) {
      console.log(`${myName} restoring ${target} as recorded by prepack, not ${pkgFile}`);
    }

    console.log(`${myName} saveFile`, saveFile, "pkgFile", target);

    const orig = await Fs.readFile(saveFile);
    await writePkgFile(target, orig);

    await Fs.unlink(saveFile);
    await Fs.unlink(metaFile).catch(() => undefined);
  } catch (err) {
    console.error(`${myName} failed`, err);
    process.exit(1);
  }
}
