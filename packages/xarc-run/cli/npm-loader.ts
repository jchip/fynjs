import logger from "../lib/logger.js";
import chalk from "../lib/chalk.js";
import { readPackageUpSync } from "read-package-up";
import myPkg from "../lib/my-pkg.js";
import makeNpmScriptEnv from "../lib/util/npm-script-env.js";
import config from "./config.js";
import env from "./env.js";

export default (xrun, options) => {
  const readPkg = readPackageUpSync();

  if (!readPkg) {
    return;
  }

  const Pkg = readPkg.packageJson;

  const pkgName = chalk.magenta(readPkg.path.replace(process.cwd(), "."));

  if (Pkg.scripts && options.npm !== false) {
    const scripts = {};
    const initCwd = env.get(env.xrunInitCwd) || process.cwd();
    const npmExec = key =>
      xrun.exec(Pkg.scripts[key], {
        flags: "npm",
        env: makeNpmScriptEnv({
          pkgPath: readPkg.path,
          pkgJson: Pkg,
          scriptName: key,
          scriptCmd: Pkg.scripts[key],
          initCwd
        })
      });
    for (const k in Pkg.scripts) {
      if (!k.startsWith("pre") && !k.startsWith("post")) {
        const pre = `pre${k}`;
        const post = `post${k}`;
        scripts[k] = xrun.serial(
          Pkg.scripts.hasOwnProperty(pre) && pre,
          npmExec(k),
          Pkg.scripts.hasOwnProperty(post) && post
        );
      } else {
        scripts[k] = npmExec(k);
      }
    }
    xrun.load("npm", scripts);
    /* istanbul ignore else */
    if (env.get(env.xrunPackagePath) !== readPkg.path) {
      logger.log(`Loaded npm scripts from ${pkgName} into namespace ${chalk.magenta("npm")}`);
    }

    env.set(env.xrunPackagePath, readPkg.path);
  }

  const pkgOptField = config.getPkgOpt(Pkg);
  const pkgConfig = pkgOptField && Pkg[pkgOptField];

  if (pkgConfig) {
    const tasks = Object.assign({}, pkgConfig.tasks);
    /* istanbul ignore else */
    if (Object.keys(tasks).length > 0) {
      xrun.load("pkg", tasks);
      logger.log(
        `Loaded ${myPkg.name} tasks from ${pkgName} into namespace ${chalk.magenta("pkg")}`
      );
    }
  }
};
