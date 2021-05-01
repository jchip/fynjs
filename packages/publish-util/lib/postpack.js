"use strict";

const Fs = require("fs").promises;
const { getInfo } = require("./utils");

exports.postPack = async function postPack() {
  const { pkgFile, saveFile } = await getInfo();

  try {
    console.log("publish-util-postpack saveFile", saveFile, "pkgFile", pkgFile);

    const orig = await Fs.readFile(saveFile);
    await Fs.writeFile(pkgFile, orig);

    await Fs.unlink(saveFile);
  } catch (err) {
    console.error("publish-util-postpack failed", err);
    process.exit(1);
  }
};
