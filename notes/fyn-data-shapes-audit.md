# fyn data-shapes audit (read-only fact-finding)

Source lives in `packages/fyn/lib/` (not `src/`). Shared types module: `lib/types/` (index.ts
re-exports from resolution.ts, npm-registry.ts, package-json.ts, installer.ts, lock-file.ts,
symbols.ts, fyn-views.ts, native-promise.ts).

## 1. Canonical shapes in `lib/types/`

| Name | File | Kind | Key fields |
|---|---|---|---|
| `PkgVersionInfo` | resolution.ts:37 | interface (extends `PkgVersionInfoSymbols`) | name, version, dist?, src, specifier?, dsrc, res?, requests, promoted?, linked?, top?, extracted?, local?, localType?, dir?, str?, json?(`PackageVersionMeta`), deprecated?, preInstalled?, optFailed?, fromLock?, hasPI?, hasI?, priority, _hasShrinkwrap?, _hasNonOpt? |
| `KnownPackage` | resolution.ts:99 | interface (extends `KnownPackageSymbols`) | versions: Record<string, PkgVersionInfo> |
| `KnownPackageLegacy` | resolution.ts:110 | interface, `@deprecated` | index signature version of KnownPackage |
| `PkgData` | resolution.ts:119 | interface (extends `PkgDataSymbols`) | promoted?, linked? |
| `ResolutionData` / `ResolutionEntry` | resolution.ts:24/14 | interface | `{dep?, opt?}` of `Record<string,{resolved:string}>` |
| `DepthInfoItem`/`DepthData`/`DepthResolving`/`QueueDepthItem`/`PromiseItem`/`ResolveResult` | resolution.ts:129-203 | interfaces | placeholder shapes, `items: unknown[]` etc, "avoid circular import" |
| `DepInfo` | installer.ts:54 | interface (extends `PkgVersionInfo`) | json?(`InstallPkgJson`), dist?(`InstallDistInfo`), res?, linkLocal?, linkDep?, linked?, showDepr?, firstReqIdx?, install?, preinstall?, fynLinkData?, _removing?/_removingDeps?/_removed? |
| `InstallPkgJson` | installer.ts:17 | interface (extends `PackageVersionMeta`) | _fyn, _from?, _id?, _deprecated?, hasPI?, fromLocked? |
| `ResData` | installer.ts:98 | interface, `@deprecated` "Use ResolutionData instead" | ResolutionData + index signature |
| `PackageVersionMeta` | npm-registry.ts:34 | interface | registry packument version fields + fyn extensions (local, hasPI, hasI, optFailed, fromLocked, _hasShrinkwrap, _shrinkwrap, _missingJson) |
| `PackageMeta` | npm-registry.ts:137 | interface (extends `PackageMetaSymbols`) | name?, versions, dist-tags?, time?, local?, jsonStr?, urlVersions? |
| `PackageJson` / `FynPackageJson` | package-json.ts:15/99 | interface | standard npm fields; FynPackageJson adds _fyn, _from, _id, _deprecated, hasPI, dist |
| `LockVersionMeta` / `PkgLockData` / `LockDepItem` / `LockPkgDepItems(Serialized)` / `LockFileData` | lock-file.ts | interfaces | fyn-lock.yaml shapes |
| `FynPkgsData` / `FynPkgDirs` / `FynpoGraph` / `FynpoPackage` / `FynForDepLocker` / `FynForLifecycle` | fyn-views.ts | interfaces | structural views of `Fyn`, explicitly built to fix FJM-154/FJM-22 (see §3) |
| symbol-keyed interfaces (`PkgVersionInfoSymbols`, `KnownPackageSymbols`, `PkgDataSymbols`, `PackageMetaSymbols`, `PackageRawInfoSymbols`, `DepItemSymbols`, `SemverSymbols`) | symbols.ts | interfaces + typed accessor fns | wrap the raw `Symbol()` keys from `lib/symbols.ts` |

## 2. Local/file-scoped shapes with the same or overlapping names, found outside `lib/types/`

| Name | File:line | Kind | Key fields | Relation to a canonical type |
|---|---|---|---|---|
| `PkgInfo` | cli/show-stat.ts:12 | interface | name, version?, promoted? | none (unrelated, display-only) |
| `PkgInfo` | lib/fyn.ts:112 | interface (extends local `FynPackageJson`, fyn.ts:107) | promoted?, dir?, str?, json?(`PackageJson`), _id?, _invalid?, _origVersion?, _hasShrinkwrap?, dist?{integrity,tarball,localPath,fullPath}, `[DEP_ITEM]?: DepItemRef`(local) | none imported; local `FynPackageJson` here is a *different* interface than `lib/types/package-json.ts`'s exported `FynPackageJson` |
| `PkgInfo` | lib/pkg-dep-linker.ts:23 | interface | name, version, promoted?, local?, json?(`InstallPkgJson\|Record<string,unknown>`), linkDep?, res?(`ResolutionData\|ResData` local), fynLinkData? | comment: "Uses a subset of DepInfo properties needed for linking operations" — references `DepInfo` conceptually but doesn't import/extend it |
| `PkgInfo` | lib/pkg-src-manager.ts:120 | interface (extends `PackageRawInfoSymbols`) | name, version, dist?(local `PkgDist`), _resolved?, _integrity?, _shasum?, _id?, _shrinkwrap?, `[DEP_ITEM]?: DepItem & {...}`, `[key:string]:unknown` | imports the canonical symbol interface but not `PkgVersionInfo`/`PackageVersionMeta` |
| `DepInfo` | lib/pkg-bin-linker-base.ts:19 | interface, exported | name, version, top?, json?{name?,bin?}, res?{dep?:DepSection, opt?:DepSection}, privateBin? | **not** related to `lib/types/installer.ts`'s exported `DepInfo`; standalone, narrower, no `extends` |
| `ResData` | lib/pkg-dep-linker.ts:35 | interface (extends `ResolutionData`) | adds `per?: Record<string,ResolutionEntry>` + index signature | shadows the name of the `@deprecated` `ResData` in `lib/types/installer.ts:98`, which it does not import |
| `DepItemRef` | lib/dep-data.ts:25 | interface, exported | name, optFailed?: boolean\|number | implemented by `DepItem` class (dep-item.ts:50) |
| `DepItemRef` | lib/fyn.ts:131 | interface, local | name, version, _resolveByLock?, index signature | same name, disjoint fields — used only as the type of `PkgInfo[DEP_ITEM]` in fyn.ts |
| `YarnLockData` | lib/fyn.ts:225 | interface | `{[key:string]: {version, resolved?, integrity?, dependencies?}}` | byte-for-byte duplicate of the next row, no shared import |
| `YarnLockData` | lib/pkg-dep-resolver.ts:177 | interface | identical shape to fyn.ts:225 | pkg-dep-resolver.ts *does* type-import `FynpoData` from `./fyn` with a comment explaining why (avoid module cycle), but didn't do the same for this type |
| `QueueDepthItem` | lib/pkg-dep-resolver.ts:198 | interface | `{queueDepth: boolean, depth: number}` | shares its name with `lib/types/resolution.ts`'s exported `QueueDepthItem` (`{name, semver, depth}`), fields do not match |
| `PromiseItem` | lib/pkg-dep-resolver.ts:204 | interface | `{promise: Promise<unknown> \| null}` | shares its name with `lib/types/resolution.ts`'s exported `PromiseItem` (`{promise, name, extra?}`), fields do not match |
| `DepthInfoItem` / `DepthData` | lib/pkg-dep-resolver.ts:54/61 | interfaces | `items: DepItem[]`, `depItems?: PkgDepItems[]` (concretely typed) | same names as `lib/types/resolution.ts`'s versions, which use `unknown[]` placeholders "to avoid circular import" — the real, concrete version was never wired back through the shared module |
| `ResolveResult` | lib/pkg-dep-resolver.ts:209 | interface | `{meta: PackageMeta, resolved: string}` | shares its name with `lib/types/resolution.ts`'s exported `ResolveResult` (`{version, fromLock?, meta?}`) — different required fields |
| `PkgDepItems` | lib/pkg-dep-resolver.ts:72 | interface | name, dep?/dev?/opt?/devOpt?: `DepItem[]` | conceptually parallel to `LockPkgDepItems` (lock-file.ts:216, `LockDepItem[]`) but a distinct name/shape for the in-memory (`DepItem`) vs lock (`LockDepItem`) forms |
| `VersionPkgData` | lib/pkg-dep-locker.ts:65 | interface (extends `PkgVersion` from dep-data.ts) | top?, optFailed?, hasPI?, local?, deprecated?, json?{scripts, dependencies, optionalDependencies, peerDependencies, bundleDependencies, os?, cpu?, _hasShrinkwrap?, index sig}, dist?{tarball,shasum,integrity,fullPath} | re-derives a subset of `PackageVersionMeta`'s fields by hand instead of reusing it; built on `PkgVersion` (dep-data.ts:31), an index-signature escape-hatch type, not on `PkgVersionInfo` |
| `PkgVersion` | lib/dep-data.ts:31 | interface, exported | `{linked?: number, [key:string]: unknown}` | an untyped escape hatch that `VersionPkgData` (above) and other modules extend instead of using `PkgVersionInfo` |
| `OptDepItem` / `OptDepData` | lib/pkg-opt-resolver.ts:58/74 | interfaces | OptDepItem: name, resolved, optChecked?, optFailed?, runningScript?; OptDepData: item, meta(`PackageMeta`), err?, runningScript? | `OptDepData.meta` explicitly reuses canonical `PackageMeta` — comment (line 69-72) says it used to be its own bag of fields, which made it incompatible with the resolver's `PackageMeta` (FJM-154) — see §4 |
| `InstallerPkgsData` | lib/pkg-installer.ts:57 | type alias | `Record<string, KnownPackage & {versions: Record<string, DepInfo>}>` | intersection-type override of `KnownPackage.versions` (typed `PkgVersionInfo`) to `DepInfo`; comment says "at runtime, version objects in the installer phase have been extended with DepInfo properties" - same object, mutated/widened in place rather than converted |
| `FvDepInfo` | lib/pkg-dep-linker.ts:48 | interface | name, version, promoted? | yet another narrow subset of `PkgVersionInfo`/`DepInfo`, unused-looking beyond local file |
| `LocalDepInfo` | lib/fyn.ts:249 | interface | `{fullPath?: string}` | name overlaps "DepInfo" family but unrelated single-field shape |
| `RawPkgInfo` / `PkgJsonData` / `DistInfo` / `PkgOsCpu` | lib/util/fyntil.ts:21-40 | interfaces/type | `PkgJsonData = Record<string,any> & {[PACKAGE_RAW_INFO]?: RawPkgInfo}`; `DistInfo{integrity?,shasum?,[key:string]:any}`; `PkgOsCpu{os?,cpu?,[key:string]:any}` | still uses explicit `any`; overlaps `PackageJson`/`PackageDist`/`PackageVersionMeta` conceptually but is untyped and not imported elsewhere by name |
| `FynpoConfigData` | lib/util/fyntil.ts:13 | interface | `config?: any, dir?, graph?(FynpoDepGraph), indirects?: any[], [key:string]: any` | overlaps `FynpoData`/`FynpoConfig` (lib/fyn.ts:192/175) conceptually; also uses `any` |
| `PackageData` | lib/pkg-dist-fetcher.ts:37 | interface | `{pkg: FetchPkg, listener?, optional?, foundAtTop?}` | wraps a third, local `FetchPkg` shape (dist-fetcher.ts:20: name, version, local?, promoted?, extracted?, dsrc?, src?, requests?, dist?) — another narrow subset of `PkgVersionInfo` |
| `VersionInfo` / `LatestVersionInfo` / `GlobalPackageInfo` | lib/fyn-global.ts:102/163/186 | interfaces | installed.json / global-install specific shapes (version, dir, spec, semver, installedAt, bins, local, linked) | separate domain (global installs), no overlap with resolver/installer `PkgVersionInfo` beyond sharing "version" concept |
| `FileInfo` / `PackageInfo` | lib/fyn-central.ts:19/43 | interfaces | content-integrity/cache shapes (`{z,m,$}` file stats; `{algorithm,contentPath,hex,tree?,...}`) | different domain (central-store content cache); name collision with `PackageInfo`/`PackageMeta` naming pattern only, not a real duplicate |

## 3. Concrete overlaps / divergences

- **`PkgInfo` exists 4 times**, each with a different shape, none related to the shared
  `PkgVersionInfo`/`KnownPackage`: cli/show-stat.ts:12, lib/fyn.ts:112, lib/pkg-dep-linker.ts:23,
  lib/pkg-src-manager.ts:120. pkg-dep-linker.ts's own comment ("subset of DepInfo properties")
  shows the author knew it overlapped a "DepInfo"-shaped concept but re-declared rather than
  imported it.

- **`DepInfo` exists twice with unrelated shapes.** `lib/types/installer.ts:54` is the canonical,
  exported `DepInfo extends PkgVersionInfo`. `lib/pkg-bin-linker-base.ts:19` independently
  exports its own `DepInfo` (`name, version, top?, json?{name?,bin?}, res?{dep?,opt?}, privateBin?`)
  with zero `extends`/import relationship. `pkg-installer.ts` passes canonical `DepInfo` objects
  (built from `PkgVersionInfo`, whose `res` is `ResolutionData` and whose `json` is
  `InstallPkgJson`) straight into `pkg-bin-linker-base.ts`'s `linkBin(depInfo: DepInfo, ...)` /
  `linkDepBin(depInfo: DepInfo)` (pkg-installer.ts:580-587). This only type-checks because the
  two independently-declared `DepInfo` shapes happen to be structurally compatible
  (`ResolutionData{dep?,opt?}` of `{resolved:string}` vs bin-linker's `res?{dep?,opt?}` of
  `DepSection{[name]:{resolved:string}}`) - there is no shared type or adapter, just structural
  coincidence.

- **`ResData` exists twice**, one marked `@deprecated` in favor of `ResolutionData`
  (lib/types/installer.ts:98), the other a live, actively-used local interface in
  lib/pkg-dep-linker.ts:35 that adds a `per` (peer-deps) field and an index signature - it
  shadows the deprecated name without importing or extending it.

- **`QueueDepthItem`, `PromiseItem`, `DepthInfoItem`, `DepthData`, `ResolveResult` are all
  exported from `lib/types/resolution.ts` but never imported anywhere outside that file**
  (confirmed via grep - no other file in `lib/`/`cli/` references them by name). Meanwhile
  `lib/pkg-dep-resolver.ts` declares its own local interfaces with the *same names* but
  different, real field sets, e.g. local `QueueDepthItem = {queueDepth: boolean, depth: number}`
  vs. exported `QueueDepthItem = {name: string, semver: string, depth: number}`; local
  `PromiseItem = {promise: Promise<unknown> | null}` vs. exported `PromiseItem = {promise,
  name, extra?}`; local `ResolveResult = {meta: PackageMeta, resolved: string}` vs. exported
  `ResolveResult = {version, fromLock?, meta?}`. The canonical `resolution.ts` versions of these
  five types appear to be placeholder shapes (their own comments say "avoid circular import")
  that were never reconciled with the concrete, actually-used versions in pkg-dep-resolver.ts.

- **`YarnLockData` is declared identically in two files** (lib/fyn.ts:225 and
  lib/pkg-dep-resolver.ts:177) with no shared import, even though pkg-dep-resolver.ts already
  type-imports `FynpoData` from `./fyn` elsewhere with an explicit comment about avoiding a
  module cycle - the same treatment wasn't applied to `YarnLockData`.

- **`DepItemRef` exists twice with disjoint fields**: lib/dep-data.ts:25 (`name,
  optFailed?`, implemented by the `DepItem` class) vs. lib/fyn.ts:131 (`name, version,
  _resolveByLock?`, used only as the type of the `[DEP_ITEM]` symbol payload stashed on
  fyn.ts's local `PkgInfo`).

- **`PkgVersion`** (lib/dep-data.ts:31, `{linked?: number, [key: string]: unknown}`) is an
  untyped escape hatch that `lib/pkg-dep-locker.ts`'s `VersionPkgData` extends instead of
  extending the canonical `PkgVersionInfo`; `VersionPkgData.json` then hand-redeclares a subset
  of `PackageVersionMeta`'s fields (scripts, dependencies, optionalDependencies,
  peerDependencies, bundleDependencies, os, cpu, _hasShrinkwrap) rather than reusing it.

- **`lib/util/fyntil.ts` still has explicit `any`** in `PkgJsonData`, `DistInfo`, `PkgOsCpu`,
  and `FynpoConfigData` (lines 13-40) - these are package-json/dist-info-shaped types living
  outside `lib/types/` that were not migrated to the canonical, `any`-free shapes even though
  the rest of the package is `tsc --noEmit` clean. They appear unused elsewhere by name (only
  the function `checkPkgOsCpu` that presumably consumes `PkgOsCpu` is referenced elsewhere).

- **`pkg-installer.ts`'s `InstallerPkgsData`** (`Record<string, KnownPackage & {versions:
  Record<string, DepInfo>}>`) documents, via comment, that the *same* `PkgVersionInfo` objects
  created during resolution are mutated in place to grow into `DepInfo` shape during install -
  i.e. there's one runtime object, but three type names apply to it across its lifetime
  (`PkgVersionInfo` at resolve time, `DepInfo` at install time, and whatever narrower `PkgInfo`/
  `FvDepInfo`/`PkgInfo`-in-pkg-dep-linker shape a given consumer module declares for its own
  purposes), requiring `as DepInfo` casts at several call sites (e.g. pkg-installer.ts:187,
  353, 439, 1010).

## 4. What FTY/FJM work already fixed

- `lib/types/fyn-views.ts` was created specifically to fix cases where `Fyn`'s collaborators
  (dep linker, bin linker, installer, dep resolver) each declared their **own, incompatible**
  structural view of the same slice of `Fyn` - the file's header comment and its per-interface
  comments cite FJM-154 (structural incompatibility) and FJM-22 (drift) by name for
  `FynPkgsData`, `FynPkgDirs`, `FynpoGraph`. This is the same class of problem found in §3
  above, but for `Fyn`-view interfaces rather than package/dependency-record interfaces - it has
  not been extended to `PkgInfo`, `DepInfo`, `ResData`, `YarnLockData`, `DepItemRef`, or the
  pkg-dep-resolver.ts-vs-resolution.ts pairs.
- `lib/pkg-opt-resolver.ts`'s `OptDepData.meta` was changed to reuse the canonical `PackageMeta`
  type; its comment (lines 69-72) explicitly says it used to be re-declared as its own bag of
  fields, which made "the two descriptions of the same object incompatible (FJM-154)" - a
  direct, resolved instance of the exact pattern this audit is looking for.
- `dep-data.ts` and `dep-item.ts` (per the task's background) no longer use `any`; `DepItem`
  formally `implements DepItemRef` from dep-data.ts, and `PkgVersionInfo`/`KnownPackage` are
  the single canonical shape for resolved package/version records referenced from `dep-data.ts`,
  `resolution.ts`, and `installer.ts`.
- Symbol properties (`SEMVER`, `DEP_ITEM`, `RSEMVERS`, etc.) were formalized into typed
  accessor functions (`getSemver`/`setSemver`/etc.) in `lib/types/symbols.ts`, replacing raw
  `obj[SYMBOL]` access with type-checked helpers - this is unrelated to the shape-duplication
  question but was the other major axis of the FTY cleanup.
- `lib/types/installer.ts`'s `ResData` is explicitly marked `@deprecated Use ResolutionData from
  resolution.ts instead` - showing the author intended to retire it, but a *different*, live
  local `ResData` still exists in `lib/pkg-dep-linker.ts:35` (see §3), so the deprecation notice
  did not actually remove the duplicate-named shape from the codebase.

## 5. Verified dead code (2026-09-24)

Grepped `lib/` and `cli/` to confirm what's actually unused before any cleanup:

- `QueueDepthItem`, `PromiseItem`, `DepthInfoItem`, `DepthData`, `ResolveResult` exported from
  `lib/types/resolution.ts` (and re-exported from `lib/types/index.ts`) have **zero references
  outside `resolution.ts` itself** - `pkg-dep-resolver.ts` uses its own, unrelated,
  file-local interfaces of the same names instead.
- `lib/types/installer.ts`'s `@deprecated ResData` has **zero references anywhere**, including
  no re-export from `lib/types/index.ts`. `lib/pkg-dep-linker.ts`'s own local `ResData` (line 35)
  is a distinct, live interface that does not import it.

## 6. Resolved (2026-09-24)

§1-§5 above are the original snapshot and stay as written. This section records what the
cleanup commits (`4f4d8d73`, `f84d0cb7`, `65808535`) and their review follow-up changed.

**Goal.** Package and dependency data should end up with coherent, well-defined shapes and little
duplication. This is a direction, not a gate. Merge a duplicate when it removes a real mismatch
or a cast. Leave it when merging would mean reshaping runtime flow for a purely cosmetic win.

**Efficiency comes first.** These objects exist once per package version, and resolve and install
walk thousands of them. Type-level consolidation is free, because interfaces, aliases, and casts
compile away. Runtime changes are not free. Do not add copies, conversions, wrapper objects, or
adapter layers just to get a cleaner shape. Mutating one object in place is a deliberate choice.
All the changes in this section are type-only.

### Design principles

Apply OOD at the type level, where it costs nothing at runtime.

- **Lifecycle phases are a subtype chain.** One object gains fields as it moves through phases:
  `PkgVersionInfo` → `DepInfo` for the version record, and `PackageJson` → `PackageVersionMeta` →
  `InstallPkgJson` → `InstalledPkgJson` for its json. Each phase extends the one before. A new
  field goes on the phase that first sets it. Liskov holds by construction, because a later
  phase can always stand in for an earlier one.
- **Consumers depend on role interfaces (Interface Segregation).** A module that needs only a few
  fields declares a narrow view. That view is *derived* from the canonical type with `Pick`,
  never re-declared by hand. The canonical type is then a subtype of every view by construction,
  not by structural coincidence. `fyn-views.ts` already does this for `Fyn` itself. Name a view
  for its role (`BinLinkPkg`), never with a canonical name (`DepInfo`).
- **No escape-hatch index signatures.** `[key: string]: unknown` switches off the contract for the
  whole type. Keep one only where a shape really is open, such as raw registry json.
- **Data stays plain objects, and behavior lives in services.** Version records are serialized to
  the lock file and exist once per version. Wrapping them in classes would add an allocation and
  a serialization step. `DepItem` is a class because it owns real behavior, the semver analysis
  behind its getters.
- **Runtime fields may change when that's what coherence needs.** Type work alone cannot fix a
  field that is encoded inconsistently at runtime, such as a flag that is sometimes `true` and
  sometimes `1`. Changing the objects is allowed. Serialized fields are the exception: anything
  written to `fyn-lock.yaml` or into an installed `package.json` stays as it is for now, because
  existing installs already hold the old form. Changing one needs an agreed migration plan.
- **External shapes are boundary types.** `Packument` mirrors pacote. Relate it to `PackageMeta`
  through `extends` at the type level, not through a runtime adapter.

| Shape from §2/§3 | Outcome |
|---|---|
| `QueueDepthItem`, `PromiseItem`, `DepthInfoItem`, `DepthData`, `DepthResolving`, `ResolveResult` in `types/resolution.ts` | Deleted. `pkg-dep-resolver.ts`'s local versions are now the only ones. |
| `@deprecated ResData` in `types/installer.ts` | Deleted. |
| Local `ResData` in `pkg-dep-linker.ts` | Deleted. Its `per` field moved into the canonical `ResolutionData`, since `pkg-dep-resolver.ts` really writes `res.per`. |
| `YarnLockData` x2 | One declaration in `fyn.ts`. `pkg-dep-resolver.ts` type-imports it, like `FynpoData`. |
| `DepItemRef` in `fyn.ts` | Renamed `FynDepItemRef`, so it no longer collides with `dep-data.ts`'s `DepItemRef`. |
| `any` in `util/fyntil.ts` | Removed. `PkgJsonData` is `Partial<FynPackageJson>`. `DistInfo` became `InstallDistInfo`. `FynpoConfigData.config` is `FynpoConfig`. |
| `PkgInfo` + `FvDepInfo` in `pkg-dep-linker.ts` | Replaced by `DepInfo` / `PkgVersionInfo`. The dead `loadPkgDepData` method went with them. |
| `PkgInfo` in `fyn.ts` | The `pkg` parameter is `PkgVersionInfo`. The json read off disk is `InstalledPkgJson` (see below). |
| `PkgInfo` in `pkg-src-manager.ts` | The tarball path takes `PkgVersionInfo`. The manifest/pack path is `PkgManifestData`, built on `Partial<PackageVersionMeta>`. |
| `PkgInfo` in `cli/show-stat.ts` | Replaced by `PkgSummary`, exported from `pkg-stat-provider.ts`. |
| `DepInfo` in `pkg-bin-linker-base.ts` | Renamed `BinLinkPkg`, a `Pick` of the installer `DepInfo`. `BinList` and `DepSection` are now aliases of the canonical types. `privateBin` moved onto `DepInfo`, since bin linking sets it there at runtime. |
| `FetchPkg` / `ExtractPkg` | Both derived from `PkgVersionInfo` with `Pick`. The `Fyn` views now return `InstalledPkgJson` instead of `unknown`. The ad hoc re-cast in `pkg-dist-fetcher.ts` is gone. |
| `VersionPkgData` + `PkgVersion` | Both deleted. `pkg-dep-locker.ts` reads `KnownPackage.versions` as the `PkgVersionInfo` records they already are. |
| `PkgVersionInfo.fromLock` | Deleted. It was written once and never read. `fromLocked` on the meta is the live field for the same fact. |
| numeric `linked` on `PkgVersionInfo` / `DepInfo` | Deleted, with `DepData.cleanLinked()` and `eachVersion()`. Nothing ever incremented or read it, and the reset walked every version on each install. |
| `PkgVersionInfo.localType` | Deleted. It was never written. Resolution copies the link type into `local`. |
| `PkgData` + `PkgDataSymbols` | Deleted. Neither was used as a type anywhere. |
| `InstallDistInfo` | Deleted. `DepInfo.dist` inherits `PackageDist`, and `distIntegrity` takes `PackageDist`. |
| `DepItemRef.optFailed` | Narrowed to `number`. Every write is a number. |
| `local` doc comments | Corrected. The field holds a link type (`"hard"`, `"sym"`, `"sym1"`), not a path. |
| `PackageJson` vs `PackageVersionMeta` | One chain. `PackageVersionMeta` extends `Partial<PackageJson>` and keeps only what the registry and fyn add (`dist`, `deprecated`, resolve fields). Its 12 re-declared package.json fields are gone. |
| `FynPackageJson` | Deleted. It re-declared `InstallPkgJson`'s bookkeeping fields. `PkgJsonData` is now `Partial<InstallPkgJson & PackageRawInfoSymbols>`. `InstallPkgJson` drops its redundant `hasPI`/`fromLocked`, and `InstalledPkgJson` drops `gypfile`. All three are inherited now. |

### Decisions

- **The on-disk json in `loadJsonForPkg` is `InstallPkgJson`-shaped.** It is stored into
  `pkg.json`. pkg-installer later reads that same slot as `DepInfo.json: InstallPkgJson`. So
  `InstalledPkgJson` is `Partial<InstallPkgJson>` plus the raw-info symbol and the 3 fields only
  `loadJsonForPkg` sets (`_invalid`, `_origVersion`, `gypfile`). It is Partial because a
  package.json on disk may predate fyn's `_fyn` bookkeeping.
- **`FynPackageJson.hasPI` is `number`, not `boolean`.** Runtime always writes `1`
  (`pkg-dep-resolver.ts`, `pkg-dep-locker.ts`). `InstallPkgJson` and `PackageVersionMeta` already
  said `number`. The `boolean` was the only thing forcing `as unknown as PackageVersionMeta`
  casts in `fyn.ts` and in `pkg-src-manager.ts`'s `LocalMeta`. Both casts are gone.
- **`PkgSummary.version` is optional.** `findDependents` reports the app itself as
  `~package.json` with no version. `formatPkgId` and `_getPkgId` check for that name first.
- **`findPkgsById` keeps its own return type.** It returns full version records from
  `pkgs[name].versions`, not display summaries.

- **`InstalledPkgJson` lives in `types/installer.ts`**, next to `InstallPkgJson`. It is one phase of
  the json's subtype chain, and the dist fetcher, dist extractor, and opt resolver all use it.
- **`FetchPkg` requires only `name` and `version`.** pkg-opt-resolver also passes plain registry
  meta to `findPkgInNodeModules` and `putPkgInNodeModules`. So the other picked fields are
  `Partial`. The role interface describes every caller, not just the common one.
- **`retry` takes `() => T | PromiseLike<T>`.** It used to take aveazul's `Promise<T>`, so a native
  promise from an `async` method did not fit. The old `unknown` returns hid this.
- **The hand-written copies had wrong types.** `VersionPkgData` said `local?: boolean` and
  `hasPI?: boolean`, while runtime stores a string and `1`. It read `hasI` only through its index
  signature. Deriving from the canonical type fixes this kind of drift for good.

### Deferred: serialized fields

These are real inconsistencies, but each is written to `fyn-lock.yaml` or an installed
`package.json`. They stay as they are until a migration is agreed.

- **`top`** is `true` in memory and `1` in the lock. The lock value is write-only: loading
  discards it and top-ness is recomputed from the parent's depth.
- **`_hasShrinkwrap`** is `boolean` in memory and `number | boolean` in the lock. `pkg-dep-locker.ts`
  bridges the two with `Boolean()`.
- **`LockVersionMeta._valid`** is read but fyn never writes it. It may be meant for hand-marked
  entries.
- **`PackageDist.localPath`** is set on a local package's json dist. That json can reach the
  installed `package.json`, so it counts as serialized.
- **`FynConfig.centralStore` / `lockOnly` / `saveExact` / `fynlocal`** are declared `fyn` config
  keys in the user's `package.json` that fyn never reads. They are user-facing, so removing them
  is a product call.

### Still open, ranked by payoff

1. **`Packument` / `LocalMeta` (boundary type).** In `pkg-src-manager.ts` they overlap
   `PackageMeta`. `Packument` mirrors pacote's external shape, so a type-level `extends` is the
   most it needs.
2. **`FynpoConfig` location.** `util/fyntil.ts` type-imports it from `../fyn`. It is type-only,
   so there is no runtime cycle. Move it to `lib/types/` only when that area is touched anyway.

Not worth chasing:

- **One runtime object, several type names over its lifetime.** `PkgVersionInfo` grows into
  `DepInfo` in place, which forces `as DepInfo` casts in pkg-installer. Removing the casts would
  mean building a separate `DepInfo` per package, which costs an allocation and a copy for
  every version installed. The in-place mutation is the efficient design, and the casts
  describe it honestly. There are only 5 of them, so a helper that narrows the type at one
  point would add little.
- **A typed `DEP_ITEM` accessor.** `getDepItem` exists in `types/symbols.ts` but nothing calls it.
  Only 2 casts would go away.
