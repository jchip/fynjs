// @ts-nocheck
import chalk from "chalk";
import { LIFECYCLE_SCRIPTS, splitRange, asRange } from "./lifecycle-script-policy";
import * as semverUtil from "./semver";

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
 * The allowScripts key to write for a record: always the bare package name.
 *
 * The constraints live in the value, so one package is one entry however many
 * versions and scripts it accumulates - see {@link makeAllowEntry}.
 *
 * @param {object} record a blocked-scripts record
 * @returns {string} the allowScripts key
 */
export function allowScriptsKey(record) {
  return record.name;
}

/**
 * The allowScripts value fyn writes: `{ semver, scripts }`, with either field
 * omitted when it would not narrow anything.
 *
 * Pinned (the default) `semver` is a caret range of the reviewed version, so
 * the approval follows that release line and a jump past it comes back for
 * review. Unpinned there is no `semver`, which covers every version. `scripts`
 * is omitted when every install script is approved.
 *
 * @param {object} record a blocked-scripts record
 * @param {boolean} [pin] whether to scope the approval to the reviewed version
 * @returns {object} the allowScripts value
 */
export function makeAllowEntry(record, pin = true) {
  const entry = {};

  if (pin && record.version) {
    entry.semver = caretRange(record.version);
  }

  const scripts = normalizeScriptsValue(record.scripts);
  if (scripts.length > 0 && scripts[0] !== "*") {
    entry.scripts = scripts;
  }

  return entry;
}

/**
 * Fold a record into an entry a previous approval already wrote.
 *
 * One key per package means a second version widens `semver` rather than adding
 * a near-duplicate key. When the two approvals cover different scripts the
 * union is taken - with a single entry there is nowhere to record "these
 * scripts for that range, those for this one".
 *
 * @param {*} existing the value already in the map, any accepted form
 * @param {object} record a blocked-scripts record
 * @param {boolean} [pin] whether to scope the approval to the reviewed version
 * @returns {object} the merged entry
 */
export function mergeAllowEntry(existing, record, pin = true) {
  const added = makeAllowEntry(record, pin);

  if (existing === undefined) {
    return added;
  }

  const prior = toAllowEntry(existing);
  const entry = {};

  // an existing entry with no semver already covers every version
  if (prior.semver !== undefined && added.semver !== undefined) {
    entry.semver = addVersionToRange(prior.semver, record.version);
  }

  if (prior.scripts !== undefined && added.scripts !== undefined) {
    const scripts = normalizeScriptsValue([...prior.scripts, ...added.scripts]);
    if (scripts[0] !== "*") {
      entry.scripts = scripts;
    }
  }

  return entry;
}

/**
 * Read any accepted allowScripts value as the object form, so a map written by
 * hand - or by npm - can be merged into.
 *
 * @param {*} value an allowScripts value
 * @returns {object} the value as `{ semver?, scripts? }`
 */
export function toAllowEntry(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  if (value === true || value === "*" || value === undefined) {
    return {};
  }

  const list = Array.isArray(value) ? value : [value];
  const strings = list.filter(item => typeof item === "string");

  // npm's `"pkg": "1.2.3"` - a version constraint, all scripts
  if (strings.length === 1 && !LIFECYCLE_SCRIPTS.includes(strings[0].toLowerCase())) {
    const range = asRange(strings[0]);
    if (range) {
      return { semver: range };
    }
  }

  const scripts = normalizeScriptsValue(strings);
  return scripts[0] === "*" ? {} : { scripts };
}

/**
 * The range an approval of one reviewed version covers.
 *
 * @param {string} version the resolved version
 * @returns {string} a caret range, or the version itself when it is not semver
 */
export function caretRange(version) {
  const clean = semverUtil.unlocalify(String(version));
  return asRange(`^${clean}`) ? `^${clean}` : clean;
}

/**
 * Widen a range so it also covers a version, leaving it alone when it already
 * does. This is how a second approval of the same package becomes
 * `pkg@^1.2.3 || ^2.0.0` instead of a second key.
 *
 * @param {string} range the existing range
 * @param {string} version the version to cover
 * @returns {string} the range
 */
export function addVersionToRange(range, version) {
  const parts = splitRange(range);
  const added = caretRange(version);

  if (parts.includes(added) || parts.some(part => semverUtil.satisfies(version, part))) {
    return parts.join(" || ");
  }

  return [...parts, added].join(" || ");
}

/**
 * Normalize a list of script names into the value fyn writes: `["*"]` when it
 * covers every install script, otherwise the names in lifecycle order.
 *
 * @param {(string[]|string|boolean)} scripts script names, or a wildcard
 * @returns {string[]} the value to write
 */
export function normalizeScriptsValue(scripts) {
  const list = Array.isArray(scripts) ? scripts : scripts === undefined ? [] : [scripts];
  const names = new Set(list.map(name => String(name).toLowerCase()));

  if (names.has("*") || names.has("true") || LIFECYCLE_SCRIPTS.every(name => names.has(name))) {
    return ["*"];
  }

  const known = LIFECYCLE_SCRIPTS.filter(name => names.has(name));
  const extra = [...names].filter(name => !LIFECYCLE_SCRIPTS.includes(name));

  return [...known, ...extra];
}

/**
 * @param {string[]} a a normalized scripts value
 * @param {string[]} b a normalized scripts value
 * @returns {boolean} whether they grant the same scripts
 */
export function sameScriptsValue(a, b) {
  return a.length === b.length && a.every((name, i) => name === b[i]);
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
  const patch = {};

  for (const record of records) {
    const key = allowScriptsKey(record);
    patch[key] = mergeAllowEntry(patch[key], record, pin);
  }

  return patch;
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
    // the denial may be spelled either way, and the record does not say which
    case "denied":
      return "denied (denyScripts / allowScripts false)";
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

    // a denial is checked before allowTopLevelScripts, so offering it as a way
    // out for a denied package would be advice that provably does nothing
    if (blocked.some(r => r.topLevel && r.reason !== "denied")) {
      lines.push(
        chalk.blue("  Direct dependencies can also be trusted as a group with:"),
        `  ${chalk.cyan(`{ "fyn": { "allowTopLevelScripts": true } }`)}`
      );
    }
  }

  return lines;
}

/**
 * Render the summary for packages that would need approval under `"review"`,
 * shown with `--allow-scripts-pending` while the install still runs under the
 * mode in effect. This is what switching to `"review"` would cost.
 *
 * @param {object[]} records pending-review records
 * @param {object} [options] options
 * @param {string} [options.mode] the scriptPolicy mode in effect
 * @param {boolean} [options.pin] pin suggested approvals to the resolved version
 * @returns {string[]} lines to log, empty when nothing is pending
 */
export function formatPendingScriptsSummary(records, { mode = "source", pin = true } = {}) {
  const pending = dedupeBlockedRecords(records);

  if (pending.length === 0) {
    return [];
  }

  const lines = [
    chalk.blue(
      `${pending.length} package${pending.length > 1 ? "s" : ""} would need approval under ` +
        `${chalk.cyan('scriptPolicy: "review"')} (currently ${chalk.cyan(mode)})`
    )
  ];

  const width = pending.reduce((w, r) => Math.max(w, `${r.name}@${r.version}`.length), 0);

  for (const record of pending) {
    lines.push(
      `  ${chalk.cyan(`${record.name}@${record.version}`.padEnd(width))}  ` +
        chalk.yellow(record.scripts.join(", "))
    );
  }

  const patch = buildAllowScriptsPatch(
    pending.filter(r => r.reason !== "denied"),
    { pin }
  );

  if (Object.keys(patch).length > 0) {
    lines.push(
      chalk.blue("  To approve them now:"),
      `  ${chalk.cyan(JSON.stringify({ fyn: { allowScripts: patch } }))}`
    );
  }

  return lines;
}
