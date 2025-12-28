import * as Path from "path";
import * as Fs from "fs/promises";
import { getInfo } from "./utils.ts";

export async function postPack(): Promise<void> {
  const { pkgFile, saveFile } = await getInfo();
  const myName = Path.basename(process.argv[1]) || "publish-util-postpack";

  try {
    console.log(`${myName} saveFile`, saveFile, "pkgFile", pkgFile);

    const orig = await Fs.readFile(saveFile);
    await Fs.writeFile(pkgFile, orig);

    await Fs.unlink(saveFile);
  } catch (err) {
    console.error(`${myName} failed`, err);
    process.exit(1);
  }
}
