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
