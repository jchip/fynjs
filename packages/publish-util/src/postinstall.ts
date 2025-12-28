import * as Fs from "fs/promises";
import { getInfo } from "./utils.ts";
import _ from "lodash";

async function postInstall(): Promise<void> {
  // can't use process.cwd() because that's this package's installed dir
  // when its postinstall is executed by npm install
  const cwd = process.env.INIT_CWD;

  if (!cwd) {
    console.error(`publish-util postinstall: no INIT_CWD env - skipping`);
    return;
  }

  const { pkg, pkgFile } = await getInfo(cwd);

  const addScript = (name: string): void => {
    const script = `publish-util-${name.toLowerCase()}`;
    const exist = _.get(pkg, `scripts.${name}`) as string | undefined;
    if (!exist) {
      console.log(
        `adding ${name} script to your package.json with '${script}'`
      );
      _.set(pkg, `scripts.${name}`, script);
    } else if (!exist.includes(script)) {
      console.warn(
        `You already have npm script '${name}' in your package.json, please add '${script}' to it.`
      );
    }
  };

  try {
    console.log(
      `publish-util postinstall - setting CWD to env INIT_CWD: ${cwd}`
    );
    addScript("prepack");
    addScript("postpack");
    await Fs.writeFile(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
  } catch {
    // ignore errors
  }
}

postInstall();
