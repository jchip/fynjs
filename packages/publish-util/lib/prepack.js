"use strict";

const Fs = require("fs").promises;
const {
  getInfo,
  extractFromObj,
  removeFromObj,
  keepStandardFields
} = require("./utils");
const _ = require("lodash");

exports.prePack = async function prePack() {
  const { pkg, pkgData, saveFile, pkgFile } = await getInfo();

  try {
    console.log("publish-util-prepack saveFile", saveFile, "pkgFile", pkgFile);
    await Fs.writeFile(saveFile, pkgData);

    const config = pkg.publishUtil || {};

    const keepObj = config.keep && extractFromObj(pkg, config.keep);

    if (config.remove) {
      removeFromObj(pkg, config.remove);
    }

    delete pkg.publishUtil;

    if (config.removeExtraKeys !== false) {
      const removed = Object.keys(pkg).filter(
        k => !keepStandardFields.includes(k)
      );
      if (!_.isEmpty(removed)) {
        console.log(
          "removed non-standard fields:",
          removed.join(", "),
          "\n  To skip this, set publishUtil.removeExtraKeys to false"
        );
        removed.forEach(k => delete pkg[k]);
      }
    }

    if (!_.get(pkg, "scripts.postpack") && config.autoPostPack !== false) {
      console.log(
        "scripts.postpack missing, adding it.\n To skip this, set publishUtil.autoPostPack to false"
      );
      _.set(pkg, "scripts.postpack", "publish-util-postpack");
    }

    delete pkg.scripts.prepack;

    if (keepObj) {
      _.merge(pkg, keepObj);
    }

    await Fs.writeFile(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
  } catch (err) {
    console.error(`publish-util-prepack failed`, err);
    process.exit(1);
  }
};
