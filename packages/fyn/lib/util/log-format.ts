/* eslint-disable no-magic-numbers, no-param-reassign */

import chalk from "chalk";
import fyntil from "./fyntil";

const { posixify } = fyntil;

/**
 * Highlight a path with node_modules and a package name.
 *
 * Given a path with a package name, process it as follows:
 *
 * If `node_modules` exist before the name then only keep that part.
 * Then highlight it:
 *  - the part before package name blue
 *  - the package name part magenta
 *  - remaining as is
 * @param name - package name
 * @param path - path to highlight
 * @returns highlighted path string
 */
export function pkgPath(name: string, path: string): string {
  const nm = "node_modules";
  const posixPath = posixify(path);
  const ixName = posixPath.indexOf(name);
  if (ixName > 0) {
    const ixNm = posixPath.lastIndexOf(nm, ixName);
    const dirName = posixPath.substring(ixNm >= 0 ? ixNm : 0, ixName);
    return (
      chalk.blue(`${dirName}`) + chalk.magenta(name) + posixPath.substr(ixName + name.length)
    );
  } else {
    return chalk.blue(posixPath);
  }
}

export function pkgId(name: string | { name: string; version?: string; resolved?: string; semver?: string }, version?: string): string {
  if (typeof name !== "string") {
    if (name.version) {
      version = name.version;
    } else if (name.resolved) {
      version = name.resolved;
    } else if (name.semver) {
      version = name.semver;
    }

    name = name.name;
  }

  if (version !== undefined) {
    const dimAt = chalk.cyan.dim("@");
    return chalk.magenta(`${name}${dimAt}${version}`);
  }

  return chalk.magenta(name);
}

export function time(x: number): string {
  x /= 1000;
  const m = chalk.magenta(`${x.toFixed(3)}`);
  return `${m}secs`;
}

export function timeWarn(x: number): string {
  x /= 1000;
  const m = chalk.yellow(`${x.toFixed(3)}`);
  return `${m}secs`;
}

export default { pkgPath, pkgId, time, timeWarn };