// @ts-nocheck
import chalk from "chalk";

//
// Reporting for packages whose install scripts the lifecycle-script policy
// blocked.
//
// Under "source" only the occasional git/URL dependency blocks, and a warning
// per package reads fine. Under "review" every native registry dependency
// blocks on a first install, and per-package warnings become scrollback nobody
// reads - so the packages are collected and reported once, at the end, with the
// exact config to paste. The same records are what `fyn install-scripts ls`
// lists, so what you see is what `approve` acts on.
//

/**
 * Build the record of one package whose install scripts were blocked.
 *
 * @param {object} depInfo resolved package data
 * @param {object} policy result of `evaluateScriptPolicy`
 * @param {string[]} blocked the lifecycle scripts that were skipped
 * @returns {object} a blocked-scripts record
 */
export function makeBlockedRecord(depInfo, policy, blocked) {
  return {
    name: depInfo.name,
    version: depInfo.version,
    key: policy.key,
    scripts: [...blocked],
    urlType: policy.urlType,
    reason: policy.reason,
    topLevel: Boolean(policy.topLevel),
    local: Boolean(policy.local)
  };
}

/**
 * The allowScripts key to suggest for a record.
 *
 * Pinning to the reviewed version is the default, as it is in npm: a later
 * release is code nobody has read yet, so it should come back for review.
 *
 * @param {object} record a blocked-scripts record
 * @param {boolean} [pin] whether to pin the approval to the resolved version
 * @returns {string} the allowScripts key
 */
export function allowScriptsKey(record, pin = true) {
  if (!pin) {
    return record.name;
  }
  return record.version ? `${record.name}@${record.version}` : record.key || record.name;
}

/**
 * Build the `fyn.allowScripts` fragment that would let these packages run the
 * scripts they were blocked from.
 *
 * fyn's per-script form is kept rather than npm's blanket `"pkg": "1.2.3"`:
 * it approves the same version but only the scripts the package actually has,
 * so a later release that adds a `preinstall` still comes back for review.
 *
 * @param {object[]} records blocked-scripts records
 * @param {object} [options] options
 * @param {boolean} [options.pin] pin each approval to the resolved version
 * @returns {object} an allowScripts map
 */
export function buildAllowScriptsPatch(records, { pin = true } = {}) {
  return records.reduce((patch, record) => {
    const key = allowScriptsKey(record, pin);
    const scripts = new Set([...(patch[key] || []), ...record.scripts]);
    patch[key] = [...scripts];
    return patch;
  }, {});
}

/**
 * @param {object[]} records blocked-scripts records
 * @returns {object[]} the records, deduplicated by name@version and with their
 *   script lists merged
 */
export function dedupeBlockedRecords(records) {
  const byId = new Map();

  for (const record of records) {
    const id = `${record.name}@${record.version}`;
    const existing = byId.get(id);
    if (existing) {
      existing.scripts = [...new Set([...existing.scripts, ...record.scripts])];
    } else {
      byId.set(id, { ...record, scripts: [...record.scripts] });
    }
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Why a package was blocked, in a few words for the summary table.
 *
 * @param {object} record a blocked-scripts record
 * @returns {string} the reason
 */
export function blockedReasonText(record) {
  switch (record.reason) {
    case "off":
      return "scriptPolicy is off";
    case "denied":
      return "denied in allowScripts";
    case "review":
      return "not reviewed";
    default:
      return `non-registry (${record.urlType})`;
  }
}

/**
 * Render the end-of-install summary for the packages that were blocked.
 *
 * @param {object[]} records blocked-scripts records
 * @param {object} [options] options
 * @param {string} [options.mode] the scriptPolicy mode in effect
 * @param {boolean} [options.pin] pin suggested approvals to the resolved version
 * @param {boolean} [options.anyTopLevel] whether any record is a direct dep
 * @returns {string[]} lines to log, empty when nothing was blocked
 */
export function formatBlockedScriptsSummary(records, { mode = "source", pin = true } = {}) {
  const blocked = dedupeBlockedRecords(records);

  if (blocked.length === 0) {
    return [];
  }

  const lines = [
    `${chalk.black.bgYellow("WARN")} ${chalk.magenta("install scripts blocked")} ` +
      chalk.yellow(
        `${blocked.length} package${blocked.length > 1 ? "s" : ""} did not run their install scripts`
      )
  ];

  const width = blocked.reduce((w, r) => Math.max(w, `${r.name}@${r.version}`.length), 0);

  for (const record of blocked) {
    const id = `${record.name}@${record.version}`.padEnd(width);
    lines.push(
      `  ${chalk.cyan(id)}  ${chalk.yellow(record.scripts.join(", "))}` +
        `  ${chalk.gray(blockedReasonText(record))}`
    );
  }

  // "off" is not an allowlist decision - nothing to approve, the mode is the
  // reason - so a paste-ready allowlist would be misleading here.
  if (mode !== "off") {
    const patch = buildAllowScriptsPatch(
      blocked.filter(r => r.reason !== "denied"),
      { pin }
    );

    if (Object.keys(patch).length > 0) {
      lines.push(
        chalk.blue("  To allow them, add to package.json:"),
        `  ${chalk.cyan(JSON.stringify({ fyn: { allowScripts: patch } }))}`,
        chalk.blue(`  Or run: ${chalk.cyan("fyn install-scripts approve <package>")}`)
      );
    }

    if (blocked.some(r => r.topLevel)) {
      lines.push(
        chalk.blue("  Direct dependencies can also be trusted as a group with:"),
        `  ${chalk.cyan(`{ "fyn": { "allowTopLevelScripts": true } }`)}`
      );
    }
  }

  return lines;
}
