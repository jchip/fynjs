# Package discovery and jurisdiction (fyn + fynpo)

Status: implemented. Tracked as FPO-17.

## The problem

fynpo used one config key, `packages`, for two jobs that are not the same job:

1. **Discovery** — which packages exist under the monorepo directory, so **fyn** can treat them
   as local dependencies instead of fetching them from the registry.
2. **Jurisdiction** — which packages **fynpo** manages: bootstrap, version, changelog, prepare,
   publish.

Discovery wants to be broad. Jurisdiction wants to be narrow. Conflating them means a repo has
to list a path in `packages` just to get it linked locally — and thereby hands that package to
fynpo's release machinery.

### The concrete case

This repo keeps three separately-cloned repos under `_w/`, which is gitignored:

```
_w/xsh           xsh@0.4.6            private: false
_w/ignore-walk   ignore-walk@8.0.0    private: false
_w/npm-packlist  npm-packlist@10.0.3  private: false
```

They are checked out here so fyn links them locally while they are being worked on. Before this
change, `fynpo.json` declared `"packages": ["packages/*", "_w/*"]` — the only way to get them
discovered — and with no publish allow list configured, `makePublishFilter` returned
`() => true`. All three were live publish candidates from this repo. None of them belongs to
this repo.

## What gitignore does and does not mean

An early reading of this bug was "auto-search reaches into places that are not part of the
monorepo, so it should skip gitignored paths." That is wrong, and the distinction matters:

- A gitignored nested clone is **exactly** the kind of package fyn is meant to discover and
  link. Skipping it by default would break the workflow the directory exists for.
- What is wrong is that discovering it also made it publishable.

So gitignored paths are **eligible for discovery by default**. Auto-search is bounded by package
directories and explicit config excludes. Gitignore enters in two narrower places, below.

## The config

```jsonc
"packages": {
  // Search for package.json, stopping at package directories. Default: on. Stays on with include.
  "autoSearch": true | {
    "enable": true,
    "respectGitignore": false,
    "stopOnPackageJsonFound": true
  },

  // Adds explicit paths below package boundaries; ordinary auto-search results remain.
  // With autoSearch off, becomes the scan patterns instead.
  "include": ["packages/*", "_w/*"],

  // Applies to every package, auto-searched or explicitly matched.
  "exclude": ["docusaurus", "testing/**"],

  // Publish allow list. Empty means every discovered package is eligible.
  "publishInclude": [],
  // Publish deny list, applied after the allow list.
  "publishExclude": []
}
```

### `include` adds to auto-search

`autoSearch` is on by default and **stays on** when `include` is set. Ordinary packages remain
discoverable regardless of `include`. Includes add explicit paths through package boundaries
and promote directly matched nested packages to managed membership. A repo can therefore list
only `dev-tools/create-fynapp/examples/*` and still discover its ordinary packages automatically.

| | auto-search on (default) | auto-search off |
|---|---|---|
| **scan** | search for `package.json`, stopping at package directories by default, plus explicit `include` paths | scan `include` patterns, or `packages/*` |
| **filter** | drop `exclude` from all discovered packages | drop `exclude` |

Aliasing `include` onto the old `patterns` option would break this — `patterns` scans by glob
directly and never auto-searches, so the alias would silently turn auto-search off for every
config that set `include`. There is deliberately no such alias any more; the raw `packages`
config is carried through and resolved by the discovery code.

### Resolution rules

| Config | Discovery | Publish |
|---|---|---|
| absent | auto-search, everything | everything discovered |
| `["packages/*"]` (array) | auto-search plus explicit `packages/*` matches | only `path:packages/*` |
| `{ include: ["libs/*"] }` | auto-search plus explicit `libs/*` matches | everything discovered |
| `{ autoSearch: false }` | scan `packages/*` | everything discovered |
| `{ autoSearch: false, include: ["libs/*"] }` | scan `libs/*` | everything discovered |

- `autoSearch` defaults **on**; `respectGitignore` defaults **off**.
- Auto-search stops at directories containing `package.json` by default.
- Explicit `include` matches can cross package boundaries; only paths leading to those
  matches are traversed below a package, and matched nested packages are managed.
- `stopOnPackageJsonFound: false` explicitly enables discovery below package directories.
- With auto-search off and no `include`, `include` falls back to `["packages/*"]`.

### Nested packages

With `packages.autoSearch.stopOnPackageJsonFound: false`, recursive auto-search separates
graph membership from command participation:

- A package found below another accepted package remains in the graph for local dependency
  resolution.
- It is **unmanaged** by default, so `fynpo run`, changelog, version and publish skip it.
- A direct `include` match promotes the nested package to managed. Matching only its ancestor
  does not promote it.
- `fynpo prepare` is the exception: it rewrites an unmanaged package's ranges when a released
  local dependency changes, without bumping the nested package's version or changing its
  `publishConfig`.
- Manifest `"private": true` remains independent. A managed private package may participate
  in lifecycle commands but is still not publishable.

The graph exposes this distinction as `managed` and `nested` metadata. Neither field is
written to `package.json`. Explicit-pattern discovery with auto-search disabled keeps every
matched package managed.

### The array shape

`packages` as an array is the historical shape and feeds **both** sets: `include` (raw, for
additive discovery) and `publishInclude` (for the publish allow list).

The publish allow list remains unchanged, but additive includes can widen discovery compared
with the old filtering behavior. Repos that relied on their array to restrict discovery must
use the object form with `exclude`, or set `autoSearch: false` and retain their paths in
`include`. Keep the corresponding `publishInclude` entries when converting to preserve the
publish allow list.

`publishInclude` entries are coerced to `path:` refs; `include` entries are left raw. That
asymmetry is deliberate. Array entries have always been path globs (`"packages/*"`), and
`include` is matched with minimatch so a glob is already correct — but `PackageRef` reads a
bare string as a **name** ref. Passing them through unchanged produces refs that match nothing,
and because a non-empty allow list fails closed, that would silently make every package in the
repo unpublishable. This was caught by running the real config through the filter: every
package, `packages/fyn` included, came back vetoed.

### The gitignore publish veto

**A gitignored package is never in publish jurisdiction.** This is absolute:

- independent of `respectGitignore`, which only governs discovery;
- not overridable by `publishInclude` naming the package.

A gitignored package is nearly always a nested clone of some other repo, present for local
linking. Releasing it from here is never right. `respectGitignore` is the separate, opt-in
question of whether such a package should be *discovered* at all.

Implemented with the `ignore` package (exact gitignore semantics — negation, `**`,
trailing-slash directory rules, anchoring — and no dependency on git being installed). Scope is
the repo-root `.gitignore` plus `.git/info/exclude`; nested `.gitignore` files deeper in the
tree and the user's global excludes file are **not** consulted. In a directory with no rules
the matcher reports `hasRules: false` and both behaviors are no-ops.

## Removed

`command.publish.includePackages` and `command.publish.excludePackages` are gone, with no
aliasing or deprecation period — nothing was using them. Their `PackageRef` semantics carry
over to `packages.publishInclude` / `packages.publishExclude` unchanged: the allow list is
checked first so config fails closed, the deny list is applied after and always wins, and refs
support `name:`, `id:`, `path:`, `/regex/` and globs.

## The object form requires an upgraded fyn/fynpo

**Adopting the object form requires upgrading fyn and fynpo first.** The array form is still
accepted, but repos that need its former restricted discovery scope must migrate as described
above.

The published `fyn` bundles its own older copy of `@fynpo/base`, which does
`patterns = config.packages` and then `patterns.map(...)`. Handing it an object kills every fyn
command in the repo:

```
$ fyn install
> Detected a fynpo monorepo at /Users/jc/dev/fynjs
> TypeError: patterns.map is not a function
    at FynpoDepGraph.readPackages (node_modules/.f/_/fyn/2.1.6/fyn/dist/fyn.js:11971:28)
    at FynpoDepGraph.resolve
    at Object.loadFynpo
    at async pickOptions
```

`pickOptions` catches it and calls `process.exit(1)`, which also turns fyn's own test suite red
with an unhandled `process.exit` — a confusing symptom a long way from the cause.

The ordering constraint is therefore: **publish fyn and fynpo carrying the new `@fynpo/base`
before adopting the object form in a repo config.** Old tooling and new config are not
compatible, and nothing can be done about the already-published copies.

For example, an existing array config:

```jsonc
"packages": ["packages/*", "_w/*"]
```

can keep auto-search enabled while excluding unwanted directories and preserving its publish
allow list:

```jsonc
"packages": {
  "include": ["packages/*", "_w/*"],
  "exclude": ["docusaurus", "testing/**"],
  "publishInclude": ["path:packages/*", "path:_w/*"]
}
```

Here `exclude` limits automatic discovery; `include` does not filter it. To retain exclusive
pattern discovery instead, set `autoSearch: false` with the same includes and publish allow
list.

Publish jurisdiction is now: everything discovered, minus the gitignored `_w/*` clones.
The original publish-filter inspection against `fynpo.json` produced:

```
PUBLISHABLE  fyn          ->  packages/fyn
PUBLISHABLE  fynpo        ->  packages/fynpo
PUBLISHABLE  @fynpo/base  ->  packages/fynpo-base
vetoed       xsh          ->  _w/xsh
vetoed       ignore-walk  ->  _w/ignore-walk
vetoed       npm-packlist ->  _w/npm-packlist
```

## Where it lives

| File | Role |
|---|---|
| `packages/fynpo-base/src/packages-config.ts` | `resolvePackagesConfig`, `scanPatterns`, `includeFilter` — normalizes both shapes |
| `packages/fynpo-base/src/gitignore.ts` | `makeGitignoreMatcher` |
| `packages/fynpo-base/src/fynpo-dep-graph.ts` | `readPackages` — the graph discovery path |
| `packages/fynpo-base/src/index.ts` | `readFynpoPackages` — the `prepare` discovery path |
| `packages/fynpo/src/utils.ts` | `makePublishFilter`, `loadConfig` |

Both discovery paths now resolve the same config through the same function, which is what stops
them drifting apart again — the original symptom in FPO-17 was `readFynpoPackages` defaulting to
`packages/*` while `FynpoDepGraph` auto-searched, so `fynpo prepare` silently found zero
packages in a repo laid out any other way.

## Bootstrap scope — decided

**Bootstrap spans the discovery set** (unchanged from today). `_w/xsh`, nested packages found
when recursive discovery is explicitly enabled, and any other discovered-but-unmanaged package
get their own dependencies installed, which is what local-link workflows rely on. Jurisdiction
narrows lifecycle runs and release commands; prepare still performs dependency-range maintenance
across the discovery set.

A dedicated bootstrap-scope config is worth considering if a repo ever wants bootstrap narrowed
independently of discovery. Deliberately not built yet — no evidence two repos want different
answers, and adding the knob before that is speculative.

## Still open

- **Nested `.gitignore` files** are not consulted by the matcher. Fine for a top-level ignored
  directory, incomplete if a repo declares ignores further down.
