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

So gitignored paths are **discovered by default**. Auto-search is bounded by explicit config
excludes. Gitignore enters in two narrower places, below.

## The config

```jsonc
"packages": {
  // Walk the whole repo looking for package.json. Default: on. Stays on when include is set.
  "autoSearch": true | { "enable": true, "respectGitignore": false },

  // Filters what the scan found. With autoSearch off, becomes the scan patterns instead.
  "include": ["packages/*", "_w/*"],

  // Applies to every package, auto-searched or explicitly matched.
  "exclude": ["docusaurus", "testing/**"],

  // Publish allow list. Empty means every discovered package is eligible.
  "publishInclude": [],
  // Publish deny list, applied after the allow list.
  "publishExclude": []
}
```

### `include` filters, it does not replace the scan

This is the rule that makes everything else work. `autoSearch` is on by default and **stays
on** when `include` is set. Auto-search decides *how the tree is walked*; `include` then
filters what the walk found. Two separate stages:

| | auto-search on (default) | auto-search off |
|---|---|---|
| **scan** | walk the whole repo for `package.json` | scan `include` patterns, or `packages/*` |
| **filter** | keep only paths matching `include` (empty = keep all), then drop `exclude` | drop `exclude` |

Aliasing `include` onto the old `patterns` option would break this — `patterns` scans by glob
directly and never auto-searches, so the alias would silently turn auto-search off for every
config that set `include`. There is deliberately no such alias any more; the raw `packages`
config is carried through and resolved by the discovery code.

### Resolution rules

| Config | Discovery | Publish |
|---|---|---|
| absent | auto-search, everything | everything discovered |
| `["packages/*"]` (array) | auto-search, filtered to `packages/*` | only `path:packages/*` |
| `{ include: ["libs/*"] }` | auto-search, filtered to `libs/*` | everything discovered |
| `{ autoSearch: false }` | scan `packages/*` | everything discovered |
| `{ autoSearch: false, include: ["libs/*"] }` | scan `libs/*` | everything discovered |

- `autoSearch` defaults **on**; `respectGitignore` defaults **off**.
- With auto-search off and no `include`, `include` falls back to `["packages/*"]`.

### The array shape

`packages` as an array is the historical shape and feeds **both** sets: `include` (raw, for
discovery filtering) and `publishInclude` (for the publish allow list).

Feeding both is what makes it a no-op for existing repos. Had the array only meant
`publishInclude`, auto-search would have run unfiltered and every repo whose array was
narrowing discovery would have silently widened — this repo goes from 32 packages to 35,
picking up `docusaurus` and two `testing/monorepo-test/packages/*` fixtures and pulling them
into bootstrap. Verified: with the array feeding both, discovery is byte-identical to the old
pattern scan at 32 packages, and no config needs to change.

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

No migration is required — the array form is a no-op, so existing configs keep working
unchanged. But **adopting the object form requires upgrading fyn and fynpo first.** This is
accepted: a user who opts into the new shape is expected to upgrade.

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

This repo stays on the array form for now:

```jsonc
"packages": ["packages/*", "_w/*"]
```

which needs no change — discovery is unchanged at 32 packages, and the array now also supplies
the publish allow list. An optional later move to the object form would be:

```jsonc
"packages": {
  "include": ["packages/*", "_w/*"],
  "exclude": ["docusaurus", "testing/**"]
}
```

where `exclude` documents the two directories that must stay out if anyone ever drops
`include` and lets auto-search run unfiltered.

Publish jurisdiction is now: everything discovered, minus the gitignored `_w/*` clones.
Verified directly against the real `fynpo.json`:

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

**Bootstrap spans the discovery set** (unchanged from today). `_w/xsh` and any other
discovered-but-unmanaged package keeps getting its own dependencies installed, which is what
the `_w/` workflow relies on. Jurisdiction narrows only what gets versioned, changelogged and
published.

A dedicated bootstrap-scope config is worth considering if a repo ever wants bootstrap narrowed
independently of discovery. Deliberately not built yet — no evidence two repos want different
answers, and adding the knob before that is speculative.

## Still open

- **Nested `.gitignore` files** are not consulted by the matcher. Fine for a top-level ignored
  directory, incomplete if a repo declares ignores further down.
