//
// Normalize the `packages` config.
//
// Discovery and membership used to be one list: whatever `packages` matched was both the set
// fyn could link as local deps AND the set fynpo versioned and published. A repo that listed a
// path just to get it discovered thereby handed it to fynpo's release machinery. See FPO-17.
//
// The two are separate here. Discovery is broad on purpose - gitignored paths included, since
// a gitignored nested clone is exactly the kind of package fyn is meant to link. Publish
// jurisdiction is narrow, and gitignored packages are never in it.
//

/** auto-search settings, after defaults are applied */
export type AutoSearchConfig = {
  /** search the whole repo for package.json when no explicit `include` patterns are given */
  enable: boolean;
  /** when true, auto-search skips gitignored paths. Does NOT affect the publish veto. */
  respectGitignore: boolean;
};

/** the `packages` config, after defaults are applied */
export type PackagesConfig = {
  autoSearch: AutoSearchConfig;
  /** explicit discovery patterns. Empty means "not specified" */
  include: string[];
  /** applies to every package, auto-searched or explicitly matched */
  exclude: string[];
  /** publish allow list. Empty means every discovered package is eligible */
  publishInclude: string[];
  /** publish deny list, applied after the allow list */
  publishExclude: string[];
};

const DEFAULT_INCLUDE = ["packages/*"];

/** tolerate a bare string for the common one-entry case */
const toList = (val: unknown): string[] =>
  []
    .concat(val || [])
    .filter((x) => typeof x === "string" && x.trim())
    .map((x: string) => x.trim());

const REF_TYPES = ["id:", "name:", "path:"];

/**
 * Coerce a legacy `packages` array entry into a path ref.
 *
 * Entries in the array form have always been path globs (`"packages/*"`), but `PackageRef`
 * reads a bare string as a NAME ref. Handing them over unchanged would produce refs that match
 * nothing, and since a non-empty allow list fails closed, that would make every package
 * unpublishable. Prefix with `path:` unless the entry already declares its type.
 *
 * @param ref - one entry from the `packages` array
 * @returns the entry as an explicit path ref
 */
const asPathRef = (ref: string): string =>
  REF_TYPES.some((t) => ref.startsWith(t)) ? ref : `path:${ref}`;

const resolveAutoSearch = (val: unknown): AutoSearchConfig => {
  if (val === false) {
    return { enable: false, respectGitignore: false };
  }

  if (val && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    return {
      enable: obj.enable !== false,
      respectGitignore: obj.respectGitignore === true,
    };
  }

  // undefined, true, or anything else -> on
  return { enable: true, respectGitignore: false };
};

/**
 * Normalize `packages` from a fynpo config into a complete {@link PackagesConfig}.
 *
 * Accepts both shapes:
 *
 * - **array** - the historical form. Treated as `publishInclude`, with auto-search on and
 *   `respectGitignore` off. It no longer narrows discovery.
 * - **object** - `{ autoSearch, include, exclude, publishInclude, publishExclude }`.
 *
 * Defaults: `autoSearch` on, `respectGitignore` off. With auto-search off and no `include`,
 * `include` falls back to `["packages/*"]`.
 *
 * @param packages - the raw `packages` value from fynpo.json / fynpo.config.js
 * @returns the resolved config, every field populated
 */
export function resolvePackagesConfig(packages?: unknown): PackagesConfig {
  if (Array.isArray(packages)) {
    return {
      autoSearch: { enable: true, respectGitignore: false },
      include: [],
      exclude: [],
      publishInclude: toList(packages).map(asPathRef),
      publishExclude: [],
    };
  }

  const obj = (packages && typeof packages === "object" ? packages : {}) as Record<string, unknown>;

  const autoSearch = resolveAutoSearch(obj.autoSearch);
  let include = toList(obj.include);

  if (!autoSearch.enable && include.length === 0) {
    include = [...DEFAULT_INCLUDE];
  }

  return {
    autoSearch,
    include,
    exclude: toList(obj.exclude),
    publishInclude: toList(obj.publishInclude),
    publishExclude: toList(obj.publishExclude),
  };
}

/**
 * Decide the discovery patterns, or that auto-search should run.
 *
 * Explicit `include` always wins - auto-search is the fallback for when nothing is declared,
 * not an addition to it.
 *
 * @param config - resolved packages config
 * @returns `null` to auto-search, otherwise the patterns to match
 */
export function discoveryPatterns(config: PackagesConfig): string[] | null {
  if (config.include.length > 0) {
    return config.include;
  }

  return config.autoSearch.enable ? null : [...DEFAULT_INCLUDE];
}
