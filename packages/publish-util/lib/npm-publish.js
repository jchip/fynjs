"use strict";

const execa = require("execa");
const { getInfo } = require("./utils");
const assert = require("assert");
const Fs = require("fs").promises;
const Path = require("path");

function getArg({ opt, msg, argv, value = true, valids = [] }) {
  const tagIx = argv.indexOf(opt);

  if (tagIx >= 0) {
    if (value) {
      const val = argv[tagIx + 1];
      if (valids.length > 0) {
        assert(
          valids.includes(val),
          `${opt} has a value ${val} but it must be one of: ${valids.join(
            ", "
          )}`
        );
      } else {
        assert(val, `${opt} must specify a ${msg}`);
      }
      argv.splice(tagIx, 2);

      return [opt, val];
    } else {
      argv.splice(tagIx, 1);
    }

    return [opt];
  }

  return [];
}

async function removeFile(name) {
  try {
    if (name) {
      await Fs.unlink(name);
    }
  } catch {}
}

exports.npmPublish = async function npmPublish({
  exit = true,
  silent = false,
} = {}) {
  const noop = () => {};
  process.on("SIGINT", noop);
  const argv = [].concat(process.argv.slice(2));

  const { pkgDir, pkgFile, pkg, pkgData } = await getInfo();

  const dryRun = getArg({ opt: "--dry-run", value: false, argv }).length > 0;
  const tag = getArg({ opt: "--tag", msg: "tag", argv });
  const access = getArg({
    opt: "--access",
    msg: "access",
    argv,
    valids: ["public", "restricted"],
  });

  let changedPkg = false;
  let exitCode = 0;

  const tgzName = pkg.name.replace(/@/g, "").replace(/\//g, "-");
  const tgzFile = `${tgzName}-${pkg.version}.tgz`;
  const fullTgzFile = Path.join(pkgDir, tgzFile);

  const saveDir = process.cwd();

  const restore = async () => {
    try {
      if (changedPkg) {
        if (!silent) {
          console.log("Restoring", pkgFile);
        }
        await Fs.writeFile(pkgFile, pkgData);
      }
    } catch {}

    try {
      process.chdir(saveDir);
    } catch {}

    process.removeListener("SIGINT", noop);
  };

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

    await removeFile(fullTgzFile);

    await execa(`npm`, [`pack`], execaOpts);

    if (scripts.publish) {
      await execa(`npm`, [`run`, `publish`], execaOpts);
    }

    if (!dryRun) {
      const publishArgs = [`publish`].concat(tag, access, fullTgzFile, argv);
      if (!silent) {
        console.log("publishing args:", publishArgs.join(" "));
      }
      await execa(`npm`, publishArgs, execaOpts);
    } else {
      console.log("dry-run", tgzFile, "args:", [].concat(tag, access, argv));
    }
  } catch (err) {
    if (err.message.includes("SIGINT")) {
      console.log("");
    } else {
      console.error("publish failed!", err);
    }
    exitCode = 1;
  } finally {
    await restore();
    await removeFile(fullTgzFile);
    if (exit) {
      process.exit(exitCode);
    }
  }

  return exitCode;
};
