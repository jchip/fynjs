"use strict";

const Path = require("path");
const Fs = require("fs").promises;
const { getInfo } = require("./utils");

exports.postPack = async function postPack() {
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
};
