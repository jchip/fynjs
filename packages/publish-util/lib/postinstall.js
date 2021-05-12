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
    if (!_.get(pkg, `scripts.${name}`)) {
      console.log(
        `adding ${name} script to your package.json for publish-util-${name}`
      );
      _.set(pkg, `scripts.${name}`, `publish-util-${name}`);
    }
  };

  try {
    addScript("prepack");
    addScript("postpack");
    await Fs.writeFile(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
  } catch (err) {
    //
  }
}

postInstall();
