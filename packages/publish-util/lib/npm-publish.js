"use strict";

const execa = require("execa");
const { getInfo } = require("./utils");
const assert = require("assert");
const Fs = require("fs").promises;
const Path = require("path");

function getArg(opt, msg, valids = []) {
  const tagIx = process.argv.indexOf(opt);

  if (tagIx > 0) {
    const val = process.argv[tagIx + 1];
    if (valids.length > 0) {
      assert(
        valids.includes(val),
        `${opt} must specify a valid ${msg}: ${valids.join(",")}`
      );
    } else {
      assert(val, `${opt} must specify a ${msg}`);
    }
    return [opt, val];
  }

  return [];
}

process.on("SIGINT", () => {});

exports.npmPublish = async function npmPublish() {
  const { pkgDir, pkgFile, pkg, pkgData } = await getInfo();

  const dryRun = process.argv.indexOf("--dry-run") > 0;
  const tag = getArg("--tag", "tag");
  const access = getArg("--access", "access", ["public", "restricted"]);

  let changedPkg = false;
  let exitCode = 0;

  const saveDir = process.cwd();
  try {
    process.env.BY_PUBLISH_UTIL = "1";
    process.chdir(pkgDir);

    const scripts = pkg.scripts || {};

    if (scripts.prepublish) {
      console.error(
        "Warning: You have 'prepublish' npm script which is deprecated - npm publish will not run it."
      );
      delete scripts.prepublish;
      changedPkg = true;
    }

    if (dryRun) {
      delete scripts.prepare;
      changedPkg = true;
    }

    if (changedPkg) {
      await Fs.writeFile(pkgFile, JSON.stringify(pkg, null, 2));
    }

    const execaOpts = { stdout: "inherit", stderr: "inherit" };

    if (scripts.prepublishOnly) {
      await execa(`npm`, ["run", "prepublishOnly"], execaOpts);
    }

    await execa(`npm`, [`pack`], execaOpts);

    if (scripts.publish) {
      await execa(`npm`, [`run`, `publish`], execaOpts);
    }

    const tgzName = pkg.name.replace(/@/g, "").replace(/\//g, "-");
    const tgzFile = `${tgzName}-${pkg.version}.tgz`;

    if (!dryRun) {
      const publishArgs = [`publish`].concat(
        tag,
        access,
        Path.join(pkgDir, tgzFile)
      );
      console.log("publishing args:", publishArgs.join(" "));
      await execa(`npm`, publishArgs, execaOpts);
    } else {
      console.log(tgzFile);
    }
  } catch (err) {
    if (err.message.includes("SIGINT")) {
      console.log("");
    } else {
      console.error("publish failed!", err);
    }
    exitCode = 1;
  } finally {
    if (changedPkg) {
      console.log("Restoring", pkgFile);
      await Fs.writeFile(pkgFile, pkgData);
    }
    process.chdir(saveDir);
    process.exit(exitCode);
  }
};
