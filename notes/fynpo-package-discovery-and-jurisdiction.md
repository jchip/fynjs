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
  // Search the repo for package.json when no explicit `include` is given. Default: on.
  "autoSearch": true | { "enable": true, "respectGitignore": false },

  // Explicit discovery patterns. Wins over autoSearch when non-empty.
  "include": ["packages/*", "_w/*"],

  // Applies to every package, auto-searched or explicitly matched.
  "exclude": ["docusaurus", "testing/**"],

  // Publish allow list. Empty means every discovered package is eligible.
  "publishInclude": [],
  // Publish deny list, applied after the allow list.
  "publishExclude": []
}
```

### Resolution rules

| Config | Discovery | Publish |
|---|---|---|
| absent | auto-search | everything discovered |
| `["packages/*"]` (array) | auto-search | only `path:packages/*` |
| `{ include: ["libs/*"] }` | `libs/*` | everything discovered |
| `{ autoSearch: false }` | `packages/*` | everything discovered |
| `{ autoSearch: false, include: ["libs/*"] }` | `libs/*` | everything discovered |

- `autoSearch` defaults **on**; `respectGitignore` defaults **off**.
- Explicit `include` always beats auto-search — auto-search is the fallback for when nothing is
  declared, not an addition to it.
- With auto-search off and no `include`, `include` falls back to `["packages/*"]`.

### The array shape

`packages` as an array is the historical shape and now means **`publishInclude`**, with
auto-search on. It no longer narrows discovery.

Entries are coerced to `path:` refs. This is not cosmetic: array entries have always been path
globs (`"packages/*"`), but `PackageRef` reads a bare string as a **name** ref. Passing them
through unchanged produces refs that match nothing, and because a non-empty allow list fails
closed, that would silently make every package in the repo unpublishable. This was caught by
running the real config through the filter — every package came back vetoed.

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

## Migration is BLOCKED until fyn and fynpo are republished

**Do not switch `fynpo.json` to the object form yet.** The published `fyn` bundles its own
older copy of `@fynpo/base`, which does `patterns = config.packages` and then `patterns.map(...)`.
Handing it an object kills every fyn command in the repo:

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
first, then adopt the object form in repo configs.** Old tooling and new config are not
compatible in either direction, and nothing can be done about the already-published copies.

### The migration to make, once unblocked

```jsonc
// before
"packages": ["packages/*", "_w/*"]

// after
"packages": {
  "include": ["packages/*", "_w/*"],
  "exclude": ["docusaurus", "testing/**"]
}
```

The `exclude` is load-bearing, and so is `include`. Since the array form no longer narrows
discovery, leaving this repo on the array once the new code is live switches it to auto-search,
which finds **35 packages instead of 32** — picking up `docusaurus` and the two
`testing/monorepo-test/packages/*` fixtures and pulling them into bootstrap. The object form
with `include` preserves the previous discovery set exactly.

That broadening applies to **every** existing repo whose `packages` array was narrowing
discovery, which is worth weighing against rule 1 (array ⇒ `publishInclude`, auto-search on).
The alternative — array ⇒ both `include` and `publishInclude` — would make the array form a
behavioral no-op for discovery and remove the migration entirely.

Publish jurisdiction, once adopted, is: everything discovered, minus the gitignored `_w/*`
clones. Verified directly against the real `fynpo.json`:

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
| `packages/fynpo-base/src/packages-config.ts` | `resolvePackagesConfig`, `discoveryPatterns` — normalizes both shapes |
| `packages/fynpo-base/src/gitignore.ts` | `makeGitignoreMatcher` |
| `packages/fynpo-base/src/fynpo-dep-graph.ts` | `readPackages` — the graph discovery path |
| `packages/fynpo-base/src/index.ts` | `readFynpoPackages` — the `prepare` discovery path |
| `packages/fynpo/src/utils.ts` | `makePublishFilter`, `loadConfig` |

Both discovery paths now resolve the same config through the same function, which is what stops
them drifting apart again — the original symptom in FPO-17 was `readFynpoPackages` defaulting to
`packages/*` while `FynpoDepGraph` auto-searched, so `fynpo prepare` silently found zero
packages in a repo laid out any other way.

## Still open

- **Bootstrap scope.** Bootstrap currently spans the discovery set, so `_w/xsh` still gets its
  own dependencies installed. If jurisdiction should also narrow bootstrap, that is a separate
  decision with a real cost — those packages stop being installed by fynpo.
- **Nested `.gitignore` files** are not consulted by the matcher. Fine for a top-level ignored
  directory, incomplete if a repo declares ignores further down.
