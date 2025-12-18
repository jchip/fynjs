/* eslint-disable no-param-reassign */

import Promise from "./aveazul";
import LifecycleScripts from "../lifecycle-scripts";
import chalk from "chalk";
import logFormat from "./log-format";
import logger from "../logger";
import _ from "lodash";

import { INSTALL_PACKAGE } from "../log-items";

const running = [];
const updateRunning = s => {
  logger.updateItem(INSTALL_PACKAGE, `running ${s}: ${running.join(", ")}`);
};

const removeRunning = (step, pkgId) => {
  const x = running.indexOf(pkgId);
  running.splice(x, 1);
  updateRunning(step);
};

/**
 * Add npm lifecycle pre and post scripts to an array of scripts
 *
 * @param {*} scripts - array of scripts
 * @param {*} pkgScripts - scripts from package.json
 * @returns
 */
function addNpmLifecycle(scripts, pkgScripts) {
  return []
    .concat(scripts)
    .filter(x => x)
    .reduce((added, script) => {
      if (
        pkgScripts[script] !== undefined &&
        !script.startsWith("pre") &&
        !script.startsWith("post")
      ) {
        added.push(`pre${script}`);
        added.push(script);
        added.push(`post${script}`);
      } else {
        added.push(script);
      }

      return added;
    }, [])
    .filter(x => x && pkgScripts[x] !== undefined);
}

/**
 * Run a npm script with visual terminal display
 *
 * @param {*} param0
 * @returns
 */
const runNpmScript = ({
  appDir,
  fyn,
  scripts,
  dir,
  pkgJson,
  depInfo,
  ignoreFailure,
  withLifecycle = false
}) => {
  const pkgId = logFormat.pkgId(depInfo);

  const options = Object.assign({ appDir, _fyn: fyn, dir, json: pkgJson }, depInfo);
  if (withLifecycle && options.json) {
    scripts = addNpmLifecycle(scripts, _.get(options.json, "scripts", {}));
  }

  return Promise.each(scripts, script => {
    running.push(pkgId);
    updateRunning(script);
    const ls = new LifecycleScripts(options);
    return ls
      .execute(script, true)
      .then(() => undefined)
      .catch(e => {
        if (!ignoreFailure) throw e;
        logger.warn(
          chalk.yellow(`ignoring failure of npm script ${script} of ${pkgId}`, chalk.red(e.message))
        );
        return e;
      })
      .finally(() => {
        removeRunning(script, pkgId);
      });
  });
};

export { addNpmLifecycle, runNpmScript };