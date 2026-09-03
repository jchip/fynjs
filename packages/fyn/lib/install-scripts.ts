// @ts-nocheck
import Path from "path";
import chalk from "chalk";
import _ from "lodash";
import Fs from "./util/file-ops";
import logger from "./logger";
import {
  dedupeBlockedRecords,
  allowScriptsKey,
  mergeAllowEntry,
  blockedReasonText
} from "./util/script-policy-report";

//
// `fyn install-scripts` - reviewing and recording which packages may run their
// install scripts. The command names mirror npm's (`ls`, `approve`, `deny`,
// `prune`) so muscle memory transfers, with one difference npm does not have:
// in a fynpo repo the allowlist lives at the monorepo root, so twenty packages
// that all depend on esbuild share one reviewed approval instead of twenty.
//

/**
 * Split an allowScripts key into its package name and optional spec.
 *
 * Keys are `name`, `name@spec` or `@scope/name@spec`, so the separator is the
 * `@` after the scope, not the first one.
 *
 * @param {string} key an allowScripts key
 * @returns {{name:string, spec:(string|undefined)}} the parts
 */
export function parseAllowKey(key) {
  const at = key.indexOf("@", key.startsWith("@") ? 1 : 0);
  if (at < 0) {
    return { name: key, spec: undefined };
  }
  return { name: key.slice(0, at), spec: key.slice(at + 1) };
}

/**
 * Add approvals to an allowScripts map.
 *
 * A `false` already recorded for the same key is left alone: a denial is a
 * decision someone made, and an approve - `--all` included - must not quietly
 * undo it.
 *
 * One package is one entry, keyed by its bare name, so approving a second
 * version widens the entry's `semver` instead of adding a near-duplicate key.
 *
 * @param {object} allowScripts the current map
 * @param {object[]} records packages to approve, as blocked-scripts records
 * @param {object} [options] options
 * @param {boolean} [options.pin] scope each approval to the reviewed version
 * @returns {{allowScripts:object, approved:string[], skipped:string[]}} result
 */
export function approveEntries(allowScripts, records, { pin = true } = {}) {
  const updated = { ...allowScripts };
  const approved = [];
  const skipped = [];

  for (const record of records) {
    const key = allowScriptsKey(record);

    // a denial may have been written under a ranged key by hand; it still wins
    // when the policy is evaluated, so approve must not look like it worked
    const denied = Object.keys(updated).some(
      k => updated[k] === false && parseAllowKey(k).name === record.name
    );

    if (denied) {
      skipped.push(key);
      continue;
    }

    updated[key] = mergeAllowEntry(updated[key], record, pin);
    approved.push(key);
  }

  return { allowScripts: updated, approved, skipped };
}

/**
 * Record explicit denials. A denial is written against the bare package name so
 * it covers every version, and it wins over any approval at evaluation time.
 *
 * @param {object} allowScripts the current map
 * @param {string[]} names package names to deny
 * @returns {{allowScripts:object, denied:string[]}} result
 */
export function denyEntries(allowScripts, names) {
  const updated = { ...allowScripts };
  const denied = [];

  for (const name of names) {
    const { name: pkgName } = parseAllowKey(name);
    updated[pkgName] = false;
    denied.push(pkgName);
  }

  return { allowScripts: updated, denied };
}

/**
 * Drop entries for packages that are no longer installed.
 *
 * @param {object} allowScripts the current map
 * @param {string[]} installedNames names of the installed packages
 * @returns {{allowScripts:object, removed:string[]}} result
 */
export function pruneEntries(allowScripts, installedNames) {
  const installed = new Set(installedNames);
  const updated = {};
  const removed = [];

  for (const key of Object.keys(allowScripts)) {
    if (installed.has(parseAllowKey(key).name)) {
      updated[key] = allowScripts[key];
    } else {
      removed.push(key);
    }
  }

  return { allowScripts: updated, removed };
}

/**
 * Match the packages named on the command line against the records an install
 * recorded, so an approval can be pinned to the version that was reviewed.
 *
 * @param {string[]} names package names, optionally `name@version`
 * @param {object[]} records blocked / pending records from the last install
 * @returns {{matched:object[], unknown:string[]}} the records to act on
 */
export function selectRecords(names, records) {
  const byName = new Map();
  for (const record of records) {
    if (!byName.has(record.name)) {
      byName.set(record.name, record);
    }
  }

  const matched = [];
  const unknown = [];

  for (const arg of names) {
    const { name, spec } = parseAllowKey(arg);
    const record = byName.get(name);

    if (spec) {
      // an explicit version is the user's call - it does not need to have been
      // seen by an install
      matched.push({
        name,
        version: spec,
        scripts: record ? record.scripts : ["preinstall", "install", "postinstall"]
      });
    } else if (record) {
      matched.push(record);
    } else {
      unknown.push(arg);
    }
  }

  return { matched, unknown };
}

/**
 * Where an allowlist change should be written.
 *
 * In a fynpo repo the monorepo root is the default: one allowlist, reviewed
 * once. `--local` writes to the package's own package.json instead.
 *
 * @param {object} fyn the Fyn instance
 * @param {boolean} [local] force the package's own package.json
 * @returns {{file:string, fynpo:boolean}} the target
 */
export function resolveTarget(fyn, local = false) {
  const fynpoDir = _.get(fyn, ["_fynpo", "dir"]);

  if (!local && fynpoDir) {
    return { file: Path.join(fynpoDir, "fynpo.json"), fynpo: true };
  }

  return { file: Path.join(fyn.cwd, "package.json"), fynpo: false };
}

/**
 * `fyn install-scripts` - list, approve, deny and prune install-script
 * approvals.
 */
export class InstallScripts {
  /**
   * @param {object} options options
   * @param {object} options.fyn the Fyn instance
   */
  constructor({ fyn }) {
    this._fyn = fyn;
  }

  /**
   * The packages awaiting review: what the last install blocked, plus what it
   * recorded as pending when run with `--allow-scripts-pending`.
   *
   * @returns {object[]} deduplicated records
   */
  get records() {
    return dedupeBlockedRecords([...this._fyn.blockedScripts, ...this._fyn.pendingScripts]);
  }

  /**
   * Read the allowScripts map from the file a change would be written to.
   *
   * @param {object} target from {@link resolveTarget}
   * @returns {Promise<{json:object, allowScripts:object}>} the file contents
   */
  async readTarget(target) {
    let json = {};

    try {
      json = JSON.parse(await Fs.readFile(target.file));
    } catch (err) {
      if (target.fynpo) {
        throw new Error(
          `cannot read ${target.file} - the monorepo allowlist needs a fynpo.json. ` +
            `Use --local to write to this package's package.json instead.`
        );
      }
      throw err;
    }

    const path = target.fynpo ? ["fyn", "options", "allowScripts"] : ["fyn", "allowScripts"];

    return { json, allowScripts: _.get(json, path) || {}, path };
  }

  /**
   * Write an allowScripts map back to its file.
   *
   * @param {object} target from {@link resolveTarget}
   * @param {object} read result of {@link readTarget}
   * @param {object} allowScripts the map to write
   * @returns {Promise<void>} nothing
   */
  async writeTarget(target, read, allowScripts) {
    _.set(read.json, read.path, allowScripts);
    await Fs.writeFile(target.file, `${JSON.stringify(read.json, null, 2)}\n`);
    logger.info(`updated ${chalk.cyan(target.file)}`);
  }

  /**
   * List the packages awaiting review.
   *
   * @param {object} [options] options
   * @param {boolean} [options.json] emit JSON instead of a table
   * @returns {Promise<object[]>} the records listed
   */
  async ls({ json = false } = {}) {
    const records = this.records;

    if (json) {
      // stdout, not the logger: this is data for a pipe
      process.stdout.write(`${JSON.stringify(records, null, 2)}\n`);
      return records;
    }

    if (records.length === 0) {
      logger.info(chalk.green("No packages are awaiting install-script review."));
      logger.info(
        `Run ${chalk.cyan("fyn install --allow-scripts-pending")} to see what ` +
          `${chalk.cyan('scriptPolicy: "review"')} would ask you to approve.`
      );
      return records;
    }

    logger.info(
      `${records.length} package${records.length > 1 ? "s" : ""} awaiting install-script review:`
    );

    const width = records.reduce((w, r) => Math.max(w, `${r.name}@${r.version}`.length), 0);

    for (const record of records) {
      logger.info(
        `  ${chalk.cyan(`${record.name}@${record.version}`.padEnd(width))}  ` +
          `${chalk.yellow(record.scripts.join(", "))}  ${chalk.gray(blockedReasonText(record))}`
      );
    }

    logger.info(`Approve with ${chalk.cyan("fyn install-scripts approve <package>")}`);

    return records;
  }

  /**
   * Approve packages to run their install scripts.
   *
   * @param {string[]} names packages to approve, optionally `name@version`
   * @param {object} [options] options
   * @param {boolean} [options.all] approve everything awaiting review
   * @param {boolean} [options.local] write to this package's package.json
   * @returns {Promise<string[]>} the keys written
   */
  async approve(names = [], { all = false, local = false } = {}) {
    const pin = this._fyn.allowScriptsPin;
    let toApprove;

    if (all) {
      toApprove = this.records;
    } else {
      const { matched, unknown } = selectRecords(names, this.records);
      if (unknown.length > 0) {
        logger.error(
          `not awaiting review: ${unknown.join(", ")} - run ` +
            `${chalk.cyan("fyn install-scripts ls")} to see what is, or name an explicit version`
        );
        return [];
      }
      toApprove = matched;
    }

    if (toApprove.length === 0) {
      logger.info("nothing to approve");
      return [];
    }

    const target = resolveTarget(this._fyn, local);
    const read = await this.readTarget(target);
    const { allowScripts, approved, skipped } = approveEntries(read.allowScripts, toApprove, {
      pin
    });

    if (skipped.length > 0) {
      logger.warn(
        `${chalk.magenta("denied, not approved")}: ${skipped.join(", ")} - ` +
          `remove the ${chalk.cyan("false")} entry first if that was not intended`
      );
    }

    if (approved.length === 0) {
      return [];
    }

    await this.writeTarget(target, read, allowScripts);
    logger.info(`approved ${chalk.cyan(approved.join(", "))}`);
    logger.info(
      `Install scripts do not run retroactively - run ${chalk.cyan("fyn install")} to run them.`
    );

    return approved;
  }

  /**
   * Deny packages outright. The denial wins over any approval, at any scope.
   *
   * @param {string[]} names packages to deny
   * @param {object} [options] options
   * @param {boolean} [options.local] write to this package's package.json
   * @returns {Promise<string[]>} the names denied
   */
  async deny(names = [], { local = false } = {}) {
    if (names.length === 0) {
      logger.error("no packages named to deny");
      return [];
    }

    const target = resolveTarget(this._fyn, local);
    const read = await this.readTarget(target);
    const { allowScripts, denied } = denyEntries(read.allowScripts, names);

    await this.writeTarget(target, read, allowScripts);
    logger.info(`denied ${chalk.cyan(denied.join(", "))}`);

    return denied;
  }

  /**
   * Drop approvals for packages that are no longer installed.
   *
   * @param {object} [options] options
   * @param {boolean} [options.local] write to this package's package.json
   * @returns {Promise<string[]>} the keys removed
   */
  async prune({ local = false } = {}) {
    const installed = Object.keys(await this._fyn.loadFvVersions());

    if (installed.length === 0) {
      logger.error(
        `no installed packages found - run ${chalk.cyan("fyn install")} before pruning, ` +
          `otherwise every approval would look unused`
      );
      return [];
    }

    const target = resolveTarget(this._fyn, local);
    const read = await this.readTarget(target);
    const { allowScripts, removed } = pruneEntries(read.allowScripts, installed);

    if (removed.length === 0) {
      logger.info(chalk.green("nothing to prune"));
      return [];
    }

    await this.writeTarget(target, read, allowScripts);
    logger.info(`pruned ${chalk.cyan(removed.join(", "))}`);

    return removed;
  }
}

export default InstallScripts;
