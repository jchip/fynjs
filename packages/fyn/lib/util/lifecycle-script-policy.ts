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

// urlTypes that still resolve from a configured registry and are trusted.
export const TRUSTED_URL_TYPES = new Set(["npm"]);

/** The install-time lifecycle scripts this policy gates. */
export const LIFECYCLE_SCRIPTS = ["preinstall", "install", "postinstall"];

/** Valid `fyn.scriptPolicy` modes, loosest to strictest. */
export const SCRIPT_POLICY_MODES = ["source", "review", "off"];

/** Today's behavior, and the default until the owner decides otherwise. */
export const DEFAULT_SCRIPT_POLICY = "source";

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
 * Pick the stricter of two policy modes. Used to merge a package's setting with
 * the monorepo's: a package may tighten what the repo asked for, never loosen
 * it.
 *
 * @param {...string} modes modes to compare, unset values ignored
 * @returns {string} the strictest mode given, or the default when none are
 */
export function strictestScriptPolicy(...modes) {
  return modes.reduce((strictest, mode) => {
    if (mode === undefined) {
      return strictest;
    }
    return SCRIPT_POLICY_MODES.indexOf(mode) > SCRIPT_POLICY_MODES.indexOf(strictest)
      ? mode
      : strictest;
  }, DEFAULT_SCRIPT_POLICY);
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

  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : undefined;

  if (list === undefined) {
    return value;
  }

  return list.reduce((map, name) => {
    const key = String(name).trim();
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
    } else if (s === true || s === "*") {
      acc.allowAll = true;
    } else if (typeof s === "string") {
      if (classifyStringEntry(s) === "version") {
        // npm's form: "canvas": "5.0.1" - all scripts, only that version
        if (ctx.version && semverUtil.satisfies(ctx.version, s)) {
          acc.allowAll = true;
        }
      } else {
        acc.scripts.add(s.toLowerCase());
      }
    }
  }

  return acc;
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
  const { allowTopLevel, reviewLocalPackages = false } = options;
  const mode = normalizeScriptPolicy(options.mode);
  const urlType = getUrlType(depInfo);
  const keys = makeAllowKeys(depInfo);
  const topLevel = isTopLevelDep(depInfo);
  const local = isLocalSource(depInfo);

  const base = { urlType, local, mode, topLevel, key: keys[0] };
  const nothing = { trusted: false, allowAll: false, allowed: new Set() };

  // "off" is npm's ignore-scripts: the allowlist is not consulted at all.
  if (mode === "off") {
    return { ...base, ...nothing, denied: true, reason: "off" };
  }

  const acc = { allowAll: false, scripts: new Set(), denied: false };
  const matchedKey = foldAllowScripts(depInfo, allowScripts, acc, { version: depInfo.version });
  const key = matchedKey || keys[0];

  if (acc.denied) {
    return { ...base, ...nothing, key, denied: true, reason: "denied" };
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
      reason: "registry"
    };
  }

  // opt-in: trust lifecycle scripts of packages declared directly in the
  // top-level package.json (fyn.allowTopLevelScripts). Unioned with any
  // per-package fyn.allowScripts entry above.
  if (topLevel && allowTopLevel !== undefined && allowTopLevel !== false) {
    normalizeAllowEntry(allowTopLevel, acc, { version: depInfo.version });
  }

  return {
    ...base,
    trusted: false,
    denied: acc.denied,
    allowAll: acc.allowAll,
    allowed: acc.scripts,
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
  if (policy.trusted || policy.allowAll) {
    return true;
  }
  return policy.allowed.has(String(scriptName).toLowerCase());
}
