"use strict";

const Fs = require("fs").promises;
const { getInfo } = require("./utils");
const _ = require("lodash");

async function postInstall() {
  // can't use process.cwd() because that's this package's installed dir
  // when its postinstall is executed by npm install
  const cwd = process.env.INIT_CWD;

  if (!cwd) {
    console.error(`publish-util postinstall: no INIT_CWD env - skipping`);
    return;
  }

  const { pkg, pkgFile } = await getInfo(cwd);

  const addScript = name => {
    const script = `publish-util-${name.toLowerCase()}`;
    const exist = _.get(pkg, `scripts.${name}`);
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
    addScript("prepublishOnly");
    addScript("postpack");
    await Fs.writeFile(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
  } catch (err) {
    //
  }
}

postInstall();
//# fynSourceMap
//# sourceMappingURL=postinstall.js.fyn.map
