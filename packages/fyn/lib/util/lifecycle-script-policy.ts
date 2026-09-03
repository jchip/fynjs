// @ts-nocheck
import Semver from "semver";
import * as semverUtil from "./semver";
import { DEP_ITEM, SEMVER } from "../symbols";


//
// Security hardening: a package's npm lifecycle scripts (preinstall, install,
// postinstall) are only executed during install when the policy in effect
// allows it.
//
// There are two trust models, selected by `fyn.scriptPolicy`:
//
//   "source" (default) - trust is provenance. A package from a configured
//     registry, or a trusted local file:/link:/symlink dependency, runs its
//     scripts; a github/git/url tarball needs an explicit allowlist entry.
//
//   "review" - trust is review (npm 12 parity). Nothing runs its install
//     scripts without an allowlist entry, registry packages included, because
//     a compromised release of an ordinary dependency is the actual attack.
//     Workspace-local packages stay exempt: they are reviewed by the PR that
//     changed them.
//
//   "all" - the blanket escape hatch. Every package runs its install scripts,
//     whatever its source. An explicit `false` in the allowlist still denies,
//     which turns this mode into a blacklist: everything runs except what you
//     name.
//
//   "off" - nothing runs, and the allowlist is not consulted. This is npm's
//     `ignore-scripts`, and like npm's it wins over the allowlist rather than
//     the other way around.
//
// A package's source is determined from its dependency spec's urlType:
//   - registry semver (e.g. ^1.2.3)         -> no urlType             -> trusted in "source"
//   - local path under root/registry/local  -> localType, no urlType  -> trusted in every mode
//   - local path under git/URL ancestor     -> ancestor urlType       -> UNTRUSTED
//   - npm: alias (resolves from a registry)  -> urlType "npm"          -> trusted in "source"
//   - github:/git/git+*/http(s) tarball      -> urlType set            -> UNTRUSTED
//
// Anything carrying a urlType that isn't a known registry alias is treated as
// untrusted (deny-by-default).
//
// Two lists shape the outcome within a mode:
//
//   `fyn.allowScripts` - the allowlist, keyed by package name or `name@<range>`,
//     merged loosest scope to tightest (fynpo config, package.json, CLI).
//
//   `fyn.denyScripts` - the blacklist, a list of the same keys. Each one is
//     overlaid onto the merged allowlist as `false` (see {@link applyDenyScripts}),
//     and a `false` is checked before every approval path there is. So deny beats
//     allow at every scope: a package the monorepo denies cannot be re-approved by
//     a package.json entry, a CLI flag, `"all"` mode, or allowTopLevelScripts.
//     Denying a bare name covers every version; `name@<range>` denies only the
//     versions in that range.
//

// urlTypes that still resolve from a configured registry and are trusted.
export const TRUSTED_URL_TYPES = new Set(["npm"]);

/** The install-time lifecycle scripts this policy gates. */
export const LIFECYCLE_SCRIPTS = ["preinstall", "install", "postinstall"];

/** Valid `fyn.scriptPolicy` modes, loosest to strictest. */
export const SCRIPT_POLICY_MODES = ["all", "source", "review", "off"];

/**
 * The default. Nothing runs its install scripts without an approval, workspace
 * packages excepted - npm 12's model. `--script-policy=source` is the opt-out
 * back to trusting a package because of where it came from.
 */
export const DEFAULT_SCRIPT_POLICY = "review";

/**
 * Split a range union into its parts. Accepts npm's `||` and the single `|` a
 * hand-written config may use.
 *
 * @param {string} range a semver range, possibly a union
 * @returns {string[]} the parts, trimmed
 */
export function splitRange(range) {
  return String(range)
    .split(/\s*\|\|?\s*/)
    .map(part => part.trim())
    .filter(Boolean);
}

/**
 * Read an allowScripts key's spec as a semver range.
 *
 * A key's spec is a range (`^1.2.3`, `1.2.3`, `^1.2.3 || ^2.0.0`) or it is not
 * a range at all - a git/URL spec such as `github:user/repo#v1`, which matches
 * the requested spec literally instead.
 *
 * @param {string} spec the part of the key after the package name
 * @returns {(string|undefined)} the range in `||` form, or undefined
 */
export function asRange(spec) {
  if (!spec) {
    return undefined;
  }
  const normalized = splitRange(spec).join(" || ");
  return Semver.validRange(normalized) ? normalized : undefined;
}

/**
 * Normalize a `fyn.scriptPolicy` value.
 *
 * @param {*} mode the configured value
 * @param {string} [dflt] mode to use when unset
 * @returns {string} one of {@link SCRIPT_POLICY_MODES}
 * @throws {Error} when the value is set but not a known mode
 */
export function normalizeScriptPolicy(mode, dflt = DEFAULT_SCRIPT_POLICY) {
  if (mode === undefined || mode === null || mode === "") {
    return dflt;
  }

  const normalized = String(mode).toLowerCase();
  if (!SCRIPT_POLICY_MODES.includes(normalized)) {
    throw new Error(
      `fyn scriptPolicy "${mode}" is not valid - expected one of ${SCRIPT_POLICY_MODES.join(", ")}`
    );
  }

  return normalized;
}

/**
 * Normalize a `fyn.scriptPolicy` value, keeping "not configured" distinct from
 * the default so scopes can be merged before the default is applied.
 *
 * @param {*} mode the configured value
 * @returns {(string|undefined)} the mode, or undefined when unset
 * @throws {Error} when the value is set but not a known mode
 */
export function normalizeScriptPolicyIfSet(mode) {
  if (mode === undefined || mode === null || mode === "") {
    return undefined;
  }
  return normalizeScriptPolicy(mode);
}

/**
 * Pick the stricter of two policy modes. Used to merge a package's setting with
 * the monorepo's: a package may tighten what the repo asked for, never loosen
 * it.
 *
 * @param {...string} modes modes to compare, unset values ignored
 * @returns {string} the strictest mode given, or the default when none are
 */
export function strictestScriptPolicy(...modes) {
  const given = modes.filter(mode => mode !== undefined);

  if (given.length === 0) {
    return DEFAULT_SCRIPT_POLICY;
  }

  // reduce from the first value given, not from the default - otherwise an
  // explicit mode looser than the default could never win
  return given.reduce((strictest, mode) =>
    SCRIPT_POLICY_MODES.indexOf(mode) > SCRIPT_POLICY_MODES.indexOf(strictest) ? mode : strictest
  );
}

/**
 * Normalize a configured allowScripts value into a map.
 *
 * A map is used as-is. A list of package names - the `--allow-scripts=a,b` CLI
 * form - becomes a blanket approval for each name, matching npm's flag.
 *
 * @param {(object|string[]|string)} value the configured value
 * @returns {object} an allowScripts map
 */
export function normalizeAllowScriptsConfig(value) {
  if (!value) {
    return {};
  }

  const list = Array.isArray(value) ? value : typeof value === "string" ? [value] : undefined;

  if (list === undefined) {
    return value;
  }

  // commas are split inside array entries too, not just in a bare string:
  // nix-clap's variadic `[packages string..]` hands `--allow-scripts=a,b` over
  // as the single argv word ["a,b"], and without this that became one bogus
  // key that matched no package and approved nothing.
  return list
    .flatMap(name => String(name).split(","))
    .reduce((map, name) => {
      const key = name.trim();
      if (key) {
        map[key] = true;
      }
      return map;
    }, {});
}

/**
 * Merge allowScripts maps from loosest to tightest scope - fynpo config, then
 * package.json, then CLI.
 *
 * Approvals accumulate, but a `false` at any level is final: a package cannot
 * approve what the monorepo denied. Cross-key denials (a bare-name `false`
 * against a version-pinned approval) are resolved at evaluation time, where
 * every matching key is folded together.
 *
 * @param {...object} maps allowScripts maps, loosest scope first
 * @returns {object} the merged map
 */
export function mergeAllowScripts(...maps) {
  const merged = {};

  for (const map of maps) {
    const normalized = normalizeAllowScriptsConfig(map);
    for (const key of Object.keys(normalized)) {
      if (merged[key] === false) {
        continue;
      }
      merged[key] = normalized[key];
    }
  }

  return merged;
}

/**
 * Fold the `fyn.denyScripts` map for a package.
 *
 * The map has the same shape and key grammar as `fyn.allowScripts` -
 * `{ semver, scripts }` with both fields optional, plus the shorthand forms -
 * because it answers the same two questions. The only difference is that a
 * match denies: an absent `semver` denies every version, an absent `scripts`
 * denies every install script.
 *
 * Entries need no `!` markers; every entry in this map is already negative.
 *
 * @param {object} depInfo resolved package data
 * @param {object} denyScripts the effective `fyn.denyScripts` map
 * @returns {{denyAll:boolean, scripts:Set<string>, key:(string|undefined)}} what
 *   this map denies for this package
 */
export function foldDenyScripts(depInfo, denyScripts) {
  const acc = makeAcc();

  if (!denyScripts) {
    return { denyAll: false, scripts: acc.deny, key: undefined };
  }

  const key = foldAllowScripts(depInfo, denyScripts, acc, { version: depInfo.version });

  // in a deny map, an entry with no `scripts` means every script
  return {
    denyAll: acc.allowAll || acc.denyAll || acc.denied,
    scripts: new Set([...acc.scripts, ...acc.deny]),
    key
  };
}

/**
 * Derive the effective source urlType for a dependency item.
 *
 * Local dependencies inherit the trust boundary of the nearest non-local
 * ancestor. This keeps root/registry/fynpo local dependencies trusted while a
 * local dependency declared by a git/URL package remains untrusted.
 *
 * @param {object} depItem dependency item to inspect
 * @returns {string|undefined} the effective urlType
 */
export function getSourceUrlType(depItem) {
  let item = depItem;
  while (item) {
    const analyzed = item.semver ? semverUtil.analyze(item.semver) : {};
    const urlType = item.urlType || analyzed.urlType;
    if (urlType) {
      return urlType;
    }
    if (!(item.localType || analyzed.localType)) {
      return undefined;
    }
    item = item.parent;
  }
  return undefined;
}

/**
 * Derive the source urlType for a resolved package (depInfo).
 *
 * Prefers the DepItem attached to the depInfo, but falls back to analyzing the
 * original requested semver spec so the policy still works for depInfo objects
 * that don't carry a DepItem (e.g. restored from a lockfile).
 *
 * @param {object} depInfo resolved package data
 * @returns {string|undefined} the urlType, or undefined for registry/local
 */
export function getUrlType(depInfo) {
  const depItem = depInfo[DEP_ITEM];
  if (depItem) {
    return getSourceUrlType(depItem);
  }

  const spec = depInfo[SEMVER];
  if (spec) {
    return semverUtil.analyze(spec).urlType;
  }

  return undefined;
}

/**
 * Whether a resolved package came from the workspace itself - a file:/link:
 * dependency or a fynpo sibling - rather than from a registry or a URL.
 *
 * Under `"review"` these are exempt: an allowlist is a review gate on code you
 * did not write, and monorepo source is reviewed by the PR that changed it.
 *
 * @param {object} depInfo resolved package data
 * @returns {boolean} true if the package is a workspace-local dependency
 */
export function isLocalSource(depInfo) {
  if (!depInfo) {
    return false;
  }

  if (depInfo.local) {
    return true;
  }

  const depItem = depInfo[DEP_ITEM];
  if (depItem && depItem.localType) {
    return true;
  }

  const spec = (depItem && depItem.semver) || depInfo[SEMVER];
  return Boolean(spec && semverUtil.analyze(spec).localType);
}

/**
 * @param {object} depInfo resolved package data
 * @returns {boolean} true if the package source is trusted to run lifecycle
 *   scripts without being explicitly whitelisted.
 */
export function isTrustedScriptSource(depInfo) {
  const urlType = getUrlType(depInfo);
  return !urlType || TRUSTED_URL_TYPES.has(urlType);
}

/**
 * Build the candidate whitelist keys for a package. Matching accepts BOTH the
 * original requested spec and the resolved version, e.g. `foo@github:user/repo`
 * and `foo@2.3.0`, plus the bare package name - npm's key form, where the
 * version it approved lives on the value side.
 *
 * @param {object} depInfo resolved package data
 * @returns {string[]} candidate keys, spec form first
 */
export function makeAllowKeys(depInfo) {
  const depItem = depInfo[DEP_ITEM];
  const spec = (depItem && depItem.semver) || depInfo[SEMVER];
  const keys = [];
  if (spec) {
    keys.push(`${depInfo.name}@${spec}`);
  }
  if (depInfo.version && depInfo.version !== spec) {
    keys.push(`${depInfo.name}@${depInfo.version}`);
  }
  keys.push(depInfo.name);
  return keys;
}

/**
 * Classify a string allowScripts value. A lifecycle script name allows just
 * that script (fyn's form); anything that parses as a semver range is npm's
 * version pin, allowing all scripts for the matching version only.
 *
 * @param {string} value the string value
 * @returns {string} "script" or "version"
 */
function classifyStringEntry(value) {
  if (LIFECYCLE_SCRIPTS.includes(value.toLowerCase())) {
    return "script";
  }
  return Semver.validRange(value) ? "version" : "script";
}

/**
 * Fold a single allowScripts entry value into an accumulator.
 *
 * Every form is accepted, though fyn only ever writes the object one:
 *
 * | value | meaning |
 * |---|---|
 * | `{ semver, scripts }` | fyn's form - either field absent means "all" |
 * | `true` / `"*"` | all install scripts |
 * | `["install"]` / `"install"` | only those scripts |
 * | `"1.2.3"` / `"^1.2.3"` | npm's form - all scripts, only matching versions |
 * | `false` | denied outright |
 *
 * @param {(string[]|string|boolean)} value the allowScripts entry value
 * @param {{allowAll:boolean, scripts:Set<string>, denied:boolean}} acc
 *   accumulator to fold into
 * @param {object} [ctx] matching context
 * @param {string} [ctx.version] the package's resolved version, for version pins
 * @returns {{allowAll:boolean, scripts:Set<string>, denied:boolean}} the accumulator
 */
function normalizeAllowEntry(value, acc, ctx = {}) {
  // an explicit denial is final - it must not be reversible by a wildcard
  // elsewhere, which is what makes a blanket "approve all" workflow safe.
  if (value === false) {
    acc.denied = true;
    return acc;
  }

  if (value === true || value === "*") {
    acc.allowAll = true;
    return acc;
  }

  // the form fyn writes: { semver, scripts }, each optional. An absent `semver`
  // covers every version, an absent `scripts` covers every install script.
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const range = asRange(value.semver);

    if (value.semver && !(range && ctx.version && semverUtil.satisfies(ctx.version, range))) {
      return acc;
    }

    if (value.scripts === undefined) {
      acc.allowAll = true;
      return acc;
    }

    return normalizeAllowEntry(value.scripts, acc, ctx);
  }

  let list = [];
  if (Array.isArray(value)) {
    list = value;
  } else if (value !== undefined) {
    list = [value];
  }

  for (const s of list) {
    if (s === false) {
      acc.denied = true;
      continue;
    }

    if (s === true || s === "*") {
      acc.allowAll = true;
      continue;
    }

    if (typeof s !== "string") {
      continue;
    }

    // `!postinstall` denies that one script; `+postinstall` and a bare
    // `postinstall` allow it. `!` rather than `-` because a leading dash reads
    // as part of a name, and a denial has to be obvious at a glance in a config
    // someone else wrote.
    const negated = s.startsWith("!");
    const name = negated || s.startsWith("+") ? s.slice(1) : s;

    if (negated) {
      if (name === "*") {
        acc.denyAll = true;
      } else {
        acc.deny.add(name.toLowerCase());
      }
      continue;
    }

    if (classifyStringEntry(name) === "version") {
      // npm's form: "canvas": "5.0.1" - all scripts, only that version
      if (ctx.version && semverUtil.satisfies(ctx.version, name)) {
        acc.allowAll = true;
      }
    } else {
      acc.scripts.add(name.toLowerCase());
    }
  }

  return acc;
}

/**
 * A fresh accumulator for folding allow or deny entries.
 *
 * @returns {{allowAll:boolean, scripts:Set<string>, deny:Set<string>,
 *   denyAll:boolean, denied:boolean}} the accumulator
 */
function makeAcc() {
  return { allowAll: false, scripts: new Set(), deny: new Set(), denyAll: false, denied: false };
}

// Index of an allowScripts map by package name, so matching does not rescan
// every entry for every resolved package. Keyed on the map itself, which the
// `Fyn.allowScripts` getter caches.
const allowIndexCache = new WeakMap();

/**
 * Group an allowScripts map by package name, parsing each key once.
 *
 * @param {object} allowScripts the map
 * @returns {Map<string, object[]>} entries by package name
 */
export function indexAllowScripts(allowScripts) {
  if (!allowScripts) {
    return new Map();
  }

  const cached = allowIndexCache.get(allowScripts);
  if (cached) {
    return cached;
  }

  const index = new Map();

  for (const key of Object.keys(allowScripts)) {
    // `@scope/name@spec` - the separator is the `@` after the scope
    const at = key.indexOf("@", key.startsWith("@") ? 1 : 0);
    const name = at < 0 ? key : key.slice(0, at);
    const spec = at < 0 ? undefined : key.slice(at + 1);

    const entries = index.get(name) || [];
    entries.push({ key, spec, range: asRange(spec), value: allowScripts[key] });
    index.set(name, entries);
  }

  allowIndexCache.set(allowScripts, index);
  return index;
}

/**
 * Fold every `fyn.allowScripts` entry that matches this package into the
 * accumulator.
 *
 * A key matches when it is the bare package name (every version), when its
 * spec is a semver range the resolved version satisfies (`sharp@^0.34.0`,
 * `sharp@^0.34.0 || ^0.35.0`), or - for a git/URL dependency, where there is no
 * version to range over - when its spec is literally the requested spec.
 *
 * @param {object} depInfo resolved package data
 * @param {object} allowScripts the project's `fyn.allowScripts` map
 * @param {{allowAll:boolean, scripts:Set<string>, denied:boolean}} acc
 *   accumulator to fold into
 * @param {object} [ctx] matching context passed to {@link normalizeAllowEntry}
 * @returns {(string|undefined)} the first matched key, if any
 */
function foldAllowScripts(depInfo, allowScripts, acc, ctx) {
  const entries = indexAllowScripts(allowScripts).get(depInfo.name);

  if (!entries) {
    return undefined;
  }

  const depItem = depInfo[DEP_ITEM];
  const requestedSpec = (depItem && depItem.semver) || depInfo[SEMVER];
  let matchedKey;

  for (const entry of entries) {
    const matched =
      entry.spec === undefined ||
      entry.spec === requestedSpec ||
      (entry.range !== undefined &&
        Boolean(depInfo.version) &&
        semverUtil.satisfies(depInfo.version, entry.range));

    if (matched) {
      if (!matchedKey) matchedKey = entry.key;
      normalizeAllowEntry(entry.value, acc, ctx);
    }
  }

  return matchedKey;
}

/**
 * @param {object} depInfo resolved package data
 * @returns {boolean} true if this resolved package was requested directly by
 *   the top-level package.json (set during resolution as `depInfo.top` whenever
 *   the request's parent is the root package). Independent of node_modules
 *   hoisting/promotion - a transitive dep promoted to the top of node_modules
 *   is NOT considered top-level here.
 */
export function isTopLevelDep(depInfo) {
  return Boolean(depInfo && depInfo.top);
}

/**
 * Evaluate the lifecycle-script policy for a resolved package.
 *
 * @param {object} depInfo resolved package data
 * @param {object} allowScripts the effective `fyn.allowScripts` map
 * @param {object} [options] additional policy options
 * @param {(boolean|string|string[])} [options.allowTopLevel] the project's
 *   `fyn.allowTopLevelScripts` config. When truthy, packages that are declared
 *   directly in the top-level package.json are allowed to run the given
 *   lifecycle scripts (`true`/`"*"` = all, or a list of script names).
 * @param {string} [options.mode] the `fyn.scriptPolicy` mode in effect
 * @param {boolean} [options.reviewLocalPackages] when true, workspace-local
 *   packages lose their exemption and need an allowlist entry like any other
 * @returns {{trusted:boolean, denied:boolean, urlType:(string|undefined),
 *   local:boolean, mode:string, reason:string, allowAll:boolean,
 *   allowed:Set<string>, key:(string|undefined), topLevel:boolean}} the
 *   resolved script policy
 */
export function evaluateScriptPolicy(depInfo, allowScripts, options = {}) {
  const { allowTopLevel, reviewLocalPackages = false, denyScripts } = options;
  const mode = normalizeScriptPolicy(options.mode);
  const urlType = getUrlType(depInfo);
  const keys = makeAllowKeys(depInfo);
  const topLevel = isTopLevelDep(depInfo);
  const local = isLocalSource(depInfo);

  const base = { urlType, local, mode, topLevel, key: keys[0] };
  // a fully denied policy - `denied` short-circuits isScriptAllowed, so the
  // per-script sets are empty rather than meaningful
  const nothing = { trusted: false, allowAll: false, allowed: new Set(), deniedScripts: new Set() };

  // `fyn.denyScripts` first: a denial outranks every way an approval can arrive
  // - the allowlist, `allowTopLevelScripts`, the local exemption, and "all" -
  // so there is nothing later that could undo it, and folding it here keeps
  // that ordering impossible to get wrong.
  const deny = foldDenyScripts(depInfo, denyScripts);

  // "off" is npm's ignore-scripts: the allowlist is not consulted at all.
  if (mode === "off") {
    return { ...base, ...nothing, denied: true, reason: "off" };
  }

  if (deny.denyAll) {
    return { ...base, ...nothing, key: deny.key || keys[0], denied: true, reason: "denied" };
  }

  const acc = makeAcc();
  const matchedKey = foldAllowScripts(depInfo, allowScripts, acc, { version: depInfo.version });
  const key = matchedKey || keys[0];

  if (acc.denied || acc.denyAll) {
    return { ...base, ...nothing, key, denied: true, reason: "denied" };
  }

  // scripts denied by name, from `denyScripts` entries that named some, and
  // from `!postinstall` markers in the allowlist entry. Checked ahead of
  // `allowAll` in isScriptAllowed, so `["*", "!postinstall"]` reads as written.
  const denied = new Set([...deny.scripts, ...acc.deny]);

  // "all": the blanket escape hatch. Checked after the allowlist fold so an
  // explicit `false` still denies - that is what makes this a blacklist rather
  // than a way to lose the denials you already recorded.
  if (mode === "all") {
    return {
      ...base,
      key,
      trusted: true,
      denied: false,
      allowAll: true,
      allowed: new Set(),
      deniedScripts: denied,
      reason: "all"
    };
  }

  // workspace-local packages are exempt in every mode, including "review":
  // they are reviewed by the PR that changed them. `urlType` being set means
  // the local path was declared by a git/URL package, which is not that.
  if (local && !urlType && !reviewLocalPackages) {
    return {
      ...base,
      key,
      trusted: true,
      denied: false,
      allowAll: true,
      allowed: new Set(),
      deniedScripts: denied,
      reason: "local"
    };
  }

  // "source": provenance is the trust boundary, so a registry package runs.
  if (mode === "source" && (!urlType || TRUSTED_URL_TYPES.has(urlType))) {
    return {
      ...base,
      key,
      trusted: true,
      denied: false,
      allowAll: true,
      allowed: new Set(),
      deniedScripts: denied,
      reason: "registry"
    };
  }

  // opt-in: trust lifecycle scripts of packages declared directly in the
  // top-level package.json (fyn.allowTopLevelScripts). Unioned with any
  // per-package fyn.allowScripts entry above.
  //
  // "source" only. Under "review" the question is whether someone read this
  // code, and "I typed this name into package.json" is not an answer to it - a
  // blanket exemption for every direct dependency would be the widest hole in
  // the policy, and a stale `true` would open it silently.
  if (mode === "source" && topLevel && allowTopLevel !== undefined && allowTopLevel !== false) {
    normalizeAllowEntry(allowTopLevel, acc, { version: depInfo.version });
  }

  return {
    ...base,
    trusted: false,
    denied: acc.denied,
    allowAll: acc.allowAll,
    allowed: acc.scripts,
    deniedScripts: new Set([...denied, ...acc.deny]),
    // key to suggest when warning - prefer a matched key, else the spec form
    key,
    reason: mode === "review" ? "review" : "untrusted-source"
  };
}

/**
 * @param {object} policy result of {@link evaluateScriptPolicy}
 * @param {string} scriptName lifecycle script name (preinstall/install/postinstall)
 * @returns {boolean} whether the script is allowed to run
 */
export function isScriptAllowed(policy, scriptName) {
  if (policy.denied) {
    return false;
  }

  const name = String(scriptName).toLowerCase();

  // a script denied by name beats every approval, including `trusted` and the
  // `"all"` mode - otherwise `["*", "!postinstall"]` and a scoped denyScripts
  // entry would both be advisory
  if (policy.deniedScripts && policy.deniedScripts.has(name)) {
    return false;
  }

  if (policy.trusted || policy.allowAll) {
    return true;
  }

  return policy.allowed.has(name);
}
