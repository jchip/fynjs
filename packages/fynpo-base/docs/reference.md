# @fynpo/base reference

`@fynpo/base` is the shared core of fynpo and fyn. It loads fynpo config files, discovers the packages of a monorepo, builds the local dependency graph with topological sort, and provides the file-hash helpers behind build caching. ESM only (`"type": "module"`), Node `^22.22.2 || ^24.15.0 || >=26.0.0`.

## Imports

```js
import { FynpoConfigManager, FynpoDepGraph, resolvePackagesConfig, caching } from "@fynpo/base";
import * as base from "@fynpo/base";
```

Everything is a named export from the package root. There is no default export. The only subpath is `@fynpo/base/package.json`.

Runtime exports: `getDepSection`, `makeDepStep`, `pkgId`, `pkgInfoId`, `PackageRef`, `FynpoDepGraph`, `FynpoConfigManager`, `FynpoConfigError`, `isFynpoConfigError`, `formatFynpoConfigError`, `resolvePackagesConfig`, `packageScope`, `outOfScopePackages`, `scanPatterns`, `includeFilter`, `makeGitignoreMatcher`, `posixify`, `writeJson`, `writeJsonSync`, `readJson`, `readJsonSync`, `readPkgJson`, `readPkgJsonSync`, `caching` (namespace: `readHashDigest`, `processInput`, `processLifecycleInput`, `processOutput`).

Type-only exports: `PackageBasicInfo`, `DEP_SECTIONS`, `PackageDepRef`, `PackageDepRelation`, `FynpoPackageInfo`, `FynpoPackages`, `FynpoTopoPackages`, `PackageDepData`, `ReadFynpoOptions`, `ConfigOptions`, `AutoSearchConfig`, `PackagesConfig`, `GitignoreMatcher`.

Not exported: the helpers in `minimatch-group` (`groupMM`, `deconstructMM`, `checkMmMatch`, `unrollMmMatch`, type `MMGroups`), the type `PackageRefType`, and the caching rule types (`CacheInputRule`, `CacheOutputRule`, `CacheBaseRule`, `FilesFilterPatterns`). The caching rule types appear in signatures but cannot be imported by name. The old discovery API (`PackageInfo`, `readFynpoPackages`, `makePkgDeps`) no longer exists.

## Config loading

### `FynpoConfigManager`

```ts
type ConfigOptions = {
  cwd?: string;
  configPath?: string;
  allowLernaWithoutFynpo?: boolean;
};

class FynpoConfigManager {
  constructor(opts?: ConfigOptions);
  load(): Promise<any>;
  loadSync(): any;
  get config(): any;
  get repoType(): string | undefined;
  get cwd(): string | undefined;
  get topDir(): string | undefined;
  get fileName(): string | undefined;
  get filePath(): string | undefined;
}
```

Finds and loads a fynpo (or lerna) config. `load()` and `loadSync()` return the loaded config object, or `undefined` when none was found. Both only load when no config is held yet, so after a successful load later calls return the same object. After a failed search (nothing found) they search again.

| option | type | default | behavior |
| --- | --- | --- | --- |
| `cwd` | `string` | `process.cwd()` | Where the upward search starts. Also the base for resolving a relative `configPath`. |
| `configPath` | `string` | none | Load exactly this file and skip the search. |
| `allowLernaWithoutFynpo` | `boolean` | none (falsy) | Accept a `lerna.json` that has no `fynpo` field. |

Getters:

| getter | value |
| --- | --- |
| `config` | the loaded config, `undefined` before loading or when none was found |
| `repoType` | `"fynpo monorepo"`, `"lerna monorepo with fynpo"`, or `"lerna monorepo"`. `undefined` when none was found |
| `cwd` | `options.cwd` |
| `topDir` | directory that holds the config file. `undefined` when the search found nothing |
| `fileName` | base name of the loaded file, such as `fynpo.config.js` |
| `filePath` | absolute path of the loaded file |

Search (when `configPath` is not set). Starting at `cwd`, for each directory, in this order:

1. If a file named `.no-fynpo` exists, stop the search. Nothing is loaded and `topDir` is `undefined`.
2. `fynpo.config.js`. The config is `module.default ?? module`.
3. `fynpo.config.json`.
4. `fynpo.json`.
5. `lerna.json`, accepted only if it has a truthy `fynpo` field or `allowLernaWithoutFynpo` is set. `repoType` is `"lerna monorepo with fynpo"` when `fynpo` is truthy, else `"lerna monorepo"`. A `lerna.json` that is rejected does not stop the search.

Then move to the parent directory. The search stops at the filesystem root or after 50 directories. Files that do not exist are skipped.

Explicit `configPath`:

- `topDir`, `fileName` and `filePath` are set from the resolved path before the file is read, even if the file turns out to be missing.
- A path ending in `.js`, `.cjs` or `.mjs` is loaded as code (`default ?? module`, `repoType` `"fynpo monorepo"`). If the JS file does not exist, `config` stays `undefined` and nothing is thrown.
- Any other extension is read as JSON. `repoType` is `"lerna monorepo"` when the file name is `lerna.json`, else `"fynpo monorepo"`. A missing JSON file throws the raw ENOENT error, not `FynpoConfigError`.

Sync versus async:

- `load()` imports JS configs with `optional-import` (works for ESM and CJS). `loadSync()` uses `require`, so an ESM-only config relies on the running Node supporting `require` of ESM.
- Errors are the same in both flavors.

Errors:

- A config file that exists but is invalid JSON throws `FynpoConfigError` (no `cause`).
- A JS config that throws while loading throws `FynpoConfigError` with `cause` set to the original error.
- A missing file is never an error during the search. It is skipped.
- Other JSON read failures (for example permissions) are also wrapped in `FynpoConfigError`, since only `ENOENT` is treated as absent.

### `FynpoConfigError`

```ts
class FynpoConfigError extends Error {
  readonly code: "FYNPO_BAD_CONFIG";
  readonly filePath: string;
  readonly reason: string;
  readonly cause?: Error;
  constructor(filePath: string, reason: string, cause?: Error);
}
```

`name` is `"FynpoConfigError"`. `message` is `Failed to load <filePath> - <reason>` when `cause` is given, else `Failed to read JSON file <filePath> - <reason>`. `reason` is the underlying error message.

### `isFynpoConfigError`

```ts
function isFynpoConfigError(err: unknown): err is FynpoConfigError
```

True when `err` is truthy and `err.code === "FYNPO_BAD_CONFIG"`. Prefer this over `instanceof`: fyn and fynpo each bundle their own copy of the class, so an error crossing between them is not an instance of the local class.

### `formatFynpoConfigError`

```ts
function formatFynpoConfigError(err: FynpoConfigError, cmdName: string): string
```

Returns a multi-line banner string (72 `=` bars, `file:` and `error:` lines). Does not print anything. `cmdName` is the CLI name shown in the text. With `err.cause` set, the title is `CONFIG FILE FAILED TO LOAD` and the banner includes the cause stack (or `String(cause)`). Without a cause, the title is `INVALID CONFIG FILE` and the text says the file is not valid JSON.

## Packages config

### `resolvePackagesConfig`

```ts
type AutoSearchConfig = {
  enable: boolean;
  respectGitignore: boolean;
  stopOnPackageJsonFound: boolean;
};

type PackagesConfig = {
  autoSearch: AutoSearchConfig;
  include: string[];
  exclude: string[];
  publishInclude: string[];
  publishExclude: string[];
};

function resolvePackagesConfig(packages?: unknown): PackagesConfig
```

Normalizes the raw `packages` value from a fynpo config into a fully populated `PackagesConfig`. Never throws.

Array form (`packages: ["packages/*"]`):

- `include` is the cleaned list. `publishInclude` is the same list with each entry prefixed `path:` unless it already starts with `id:`, `name:` or `path:`.
- `autoSearch` is `{ enable: true, respectGitignore: false, stopOnPackageJsonFound: true }`.
- `exclude` and `publishExclude` are `[]`.

Object form (also anything else, including `undefined`, which acts as `{}`):

| field | type | default | behavior |
| --- | --- | --- | --- |
| `autoSearch` | `boolean \| object` | on | `false` gives `{ enable: false, respectGitignore: false, stopOnPackageJsonFound: true }`. An object gives `enable: obj.enable !== false`, `respectGitignore: obj.respectGitignore === true`, `stopOnPackageJsonFound: obj.stopOnPackageJsonFound !== false`. Anything else (including `true`, `undefined`) gives `{ enable: true, respectGitignore: false, stopOnPackageJsonFound: true }`. |
| `include` | `string \| string[]` | `[]` | If auto-search is disabled and the cleaned list is empty, becomes `["packages/*"]`. |
| `exclude` | `string \| string[]` | `[]` | |
| `publishInclude` | `string \| string[]` | `[]` | Not prefixed in object form. Entries are `PackageRef` strings. |
| `publishExclude` | `string \| string[]` | `[]` | |

List cleaning: a bare string becomes a one-item list. Non-string and blank entries are dropped. Entries are trimmed. A non-array, non-object `packages` (for example a string) is treated as `{}`.

### `packageScope`

```ts
function packageScope(name: string): string | undefined
```

Returns the npm scope including `@` (for `@fynjs/x` returns `"@fynjs"`). Returns `undefined` for unscoped names, an empty name, or a name starting with `@` with no `/` after position 0.

### `outOfScopePackages`

```ts
function outOfScopePackages(scopes: unknown, names: string[]): string[]
```

Returns the names in `names` that are outside the given scopes (the ones a `--scope` option should exclude).

- `scopes` may be a string or array. Entries are trimmed, blanks dropped, and `@` is prefixed when missing.
- Returns `[]` when no usable scope is given.
- An unscoped name is always returned once any scope is given.

### `scanPatterns`

```ts
function scanPatterns(config: PackagesConfig): string[] | null
```

Returns `null` when `config.autoSearch.enable` is true (meaning scan the whole repo). Otherwise returns `config.include`, or `["packages/*"]` when `include` is empty. `include` alone never turns auto-search off.

### `includeFilter`

```ts
function includeFilter(config: PackagesConfig): string[]
```

Returns `config.include`. These patterns add nested paths as managed packages when auto-search is on, and restrict discovery when it is off.

## Gitignore

### `makeGitignoreMatcher`

```ts
type GitignoreMatcher = {
  ignores(relPath: string): boolean;
  hasRules: boolean;
};

function makeGitignoreMatcher(cwd: string): GitignoreMatcher
```

Builds a matcher from `<cwd>/.gitignore` and `<cwd>/.git/info/exclude`. Nested `.gitignore` files and the global excludes file are not read. Does not run git.

- Missing files (`ENOENT`, `ENOTDIR`) are skipped. Any other read error is thrown.
- When neither file exists (or both are empty strings), the returned matcher has `hasRules: false` and `ignores` always returns `false`. Otherwise `hasRules` is `true`.
- `ignores(relPath)` takes a repo-relative path. It returns `false` for empty, `"."`, absolute paths, and paths starting with `..`. It converts the platform separator to `/` and strips a leading `./`, then applies the rules (npm `ignore` semantics).

## Package graph

### `FynpoDepGraph`

```ts
class FynpoDepGraph {
  packages: FynpoPackages;
  depMapByPath: Record<string, PackageDepData>;
  resolvedCache: Record<string, string>;
  autoSearched: boolean;
  _options: ReadFynpoOptions;

  constructor(options?: ReadFynpoOptions);
  resolve(indirects?: boolean): Promise<void>;
  updateDepMap(): void;
  readPackages(): Promise<FynpoPackages>;
  addPackageByFile(pkgFile: string, management?: { managed?: boolean; nested?: boolean }): Promise<FynpoPackageInfo | undefined>;
  addPackage(pkgJson: Record<string, any>, pkgPath: string, pkgStr?: string, management?: { managed?: boolean; nested?: boolean }): FynpoPackageInfo | undefined;
  updateAuxPackageData(): void;
  resolvePackage(name: string, semver: string, fallbackToFirst?: boolean): FynpoPackageInfo;
  checkNoFynLocal(pkgInfo: FynpoPackageInfo, depName: string): boolean;
  addDepByPath(from: string, to: string, depSection: DEP_SECTIONS, indirectSteps?: string[]): void;
  addDepById(from: string, to: string, depSection: DEP_SECTIONS, indirectSteps?: string[]): void;
  addDepRelations(relations: PackageDepRelation[]): void;
  addDep(pkgInfo: FynpoPackageInfo, depPkg: FynpoPackageInfo, depSection: DEP_SECTIONS, indirectSteps?: string[]): boolean;
  checkCircular(pkgInfo: FynpoPackageInfo, depPkg: FynpoPackageInfo): boolean;
  getTopoSortPackagePaths(avoidCircs?: boolean): { noCircSorted: string[]; sorted: string[]; circulars: string[] };
  getTopoSortPackages(): FynpoTopoPackages;
  getPackageAtDir(dir: string): FynpoPackageInfo;
  getPackageByName(name: string): FynpoPackageInfo;
}
```

Typical use:

```js
const graph = new FynpoDepGraph({ cwd: topDir, packages: config.packages });
await graph.resolve();
const { sorted, circulars } = graph.getTopoSortPackages();
```

Constructor options:

```ts
type ReadFynpoOptions = {
  patterns?: string[];
  cwd?: string;
  noFynLocal?: string[];
  packages?: unknown;
};
```

| option | type | default | behavior |
| --- | --- | --- | --- |
| `cwd` | `string` | `process.cwd()` | Monorepo top dir. Package paths are relative to it. |
| `patterns` | `string[]` | none | Explicit scan patterns (minimatch). When non-empty they override `scanPatterns` and `include` from `packages`: scanning is limited to those patterns, auto-search is off, and `include` is not applied. `packages.exclude` still applies. |
| `packages` | `unknown` | none | Raw `packages` config, passed to `resolvePackagesConfig`. Drives discovery. |
| `noFynLocal` | `string[]` | none | Dependency names never resolved as local packages. |

Fields:

| field | meaning |
| --- | --- |
| `packages` | `{ byName, byPath, byId }`, see `FynpoPackages`. |
| `depMapByPath` | dep data per package path. Filled by `resolve()`. |
| `resolvedCache` | cache from `name@<semver>` to the resolved `name@version`. |
| `autoSearched` | set by `readPackages()`: `true` when the scan was an auto-search of the whole repo. `undefined` before. |

#### `resolve`

`resolve(indirects = false)`: if `packages.byName` is empty it calls `readPackages()`, then resolves direct local deps into `depMapByPath`. With `indirects: true` it also resolves indirect deps. Topological sort needs only direct deps.

Direct dep resolution looks at `dependencies` (`dep`), `devDependencies` (`dev`) and `optionalDependencies` (`opt`) of each package. `peerDependencies` are not resolved into the graph. A dependency name is local when some discovered package has that name. When several versions exist, the first one satisfying the semver wins, else the first in `byName` (highest version) is used. A dependency is skipped when `checkNoFynLocal` is true. Because a name match always links (falling back to the first version), a dep whose range matches no local version is still linked.

#### `updateDepMap`

Runs direct and then indirect dep resolution. Safe to call repeatedly. Use it after adding packages or relations by hand.

#### `readPackages`

Scans the repo and returns `this.packages`. Does not reset `packages`, so calling twice adds duplicate entries by name. Rules:

- The top dir `package.json` is never a package. A directory containing a `fynpo.json` is skipped. `node_modules` is never entered.
- With auto-search on (default), the whole repo is walked, and directories starting with `.` are skipped. With `stopOnPackageJsonFound` true, anything below a found package is skipped unless `include` patterns match it. A package found below another is `nested: true`, and is `managed` only if an `include` pattern matches it.
- With auto-search off, only paths matching the scan patterns (`include` or `["packages/*"]`, or `patterns`) are packages. Those are all `managed: true`, `nested: false`.
- `packages.exclude` patterns exclude directories and packages in both modes. With `respectGitignore` on and auto-search on, gitignored paths are skipped. Auto-search is the only mode that honors `respectGitignore`.
- A `package.json` with `"fynpo": false` or with no `name` is ignored.
- A `package.json` that is not valid JSON throws the `JSON.parse` error (not `FynpoConfigError`).
- Insertion order is lexical by `package.json` path. `updateAuxPackageData()` runs at the end.

`publishInclude` and `publishExclude` are not consulted by this class. They are for callers.

#### `addPackageByFile`

Reads `<cwd>/<pkgFile>`, parses it and calls `addPackage` with the posix directory of `pkgFile`. Does not call `updateAuxPackageData`. Throws on a missing file or invalid JSON.

#### `addPackage`

Adds one package to `packages.byName` and returns its `FynpoPackageInfo`.

- Returns `undefined` when `pkgJson.fynpo === false`.
- Throws an `assert` error `package at <pkgPath> doesn't have name` when there is no `name`.
- `pkgPath` must use `/`.
- `management.managed` is `true` unless set to `false`. `management.nested` is `false` unless set to `true`.
- It does not update `byPath` or `byId`. Call `updateAuxPackageData()` afterwards.
- `pkgDir` is `pkgJson.name` when the name is scoped and `pkgPath` ends with `/<name>` or equals it, else the last segment of `pkgPath`.

#### `updateAuxPackageData`

Rebuilds `byId` and `byPath` from `byName`. Sorts each `byName` list by version, newest first. On equal versions, managed packages come before unmanaged ones, then by path. For `byId`, a managed package replaces an unmanaged one with the same id. Otherwise the first in sort order wins.

#### `resolvePackage`

Looks up `name` in `byName` and returns the first version satisfying `semver`. If none satisfies and `fallbackToFirst` is `true` (default), returns the first (highest version) entry. Returns `undefined` when the name is unknown, or when nothing matches and `fallbackToFirst` is `false`.

#### `checkNoFynLocal`

Returns `true` when `depName` is in `options.noFynLocal`, or when the package's `pkgJson.fyn` has, in `dependencies`, `devDependencies` or `optionalDependencies`, an entry for `depName` that is `false` or a string containing `no-fyn-local`. Otherwise `false`.

#### `addDep`, `addDepByPath`, `addDepById`, `addDepRelations`

- `addDep` records the dependency in `depMapByPath[from].localDepsByPath[to.path]` and the reverse in `depMapByPath[to].dependentsByPath[from.path]`, then runs `checkCircular`. Returns `false` (no change) for a self dependency or an existing relation, `true` when added. `depMapByPath` entries must already exist for both packages (created by `resolve()`), else it throws a `TypeError`. `indirectSteps`, if given, is stored on both records.
- `addDepByPath` and `addDepById` look the packages up in `byPath` or `byId`. They do nothing when either is missing and return nothing.
- `addDepRelations` calls `addDepByPath` for each `PackageDepRelation`, using `fromPkg.path` and `onPkg.path`.

#### `checkCircular`

If `depPkg` already depends on `pkgInfo`, records `depPkg.path` in `depMapByPath[pkgInfo.path].pathOfCirculars` (no duplicates) and returns `true`. Otherwise returns `true` only when `depPkg` has a non-empty `pathOfCirculars`, else `false`.

#### `getTopoSortPackagePaths` and `getTopoSortPackages`

`getTopoSortPackagePaths(avoidCircs = false)` returns arrays of package paths. `getTopoSortPackages()` returns the same three lists as `PackageDepData` objects.

- Dependencies first: a package comes after all its local deps. Only `dep` and `dev` relations count. `opt` and `peer` are ignored.
- `noCircSorted`: packages that sort without cycles.
- `circulars`: paths still unsorted (part of or behind a cycle).
- `sorted`: all packages. When there are circulars, each gets `hasCircular = true` on its dep data, and the sort is redone ignoring relations to those packages.
- Requires `resolve()` to have filled `depMapByPath`. With no resolve, all lists are empty.
- Tie order is not specified beyond the above.

#### `getPackageAtDir`

Returns the package whose path equals `dir`. An absolute `dir` is made relative to `cwd`. Returns `undefined` when none.

#### `getPackageByName`

Returns the first entry in `byName[name]` (highest version), or `undefined`.

### Types

```ts
type PackageBasicInfo = {
  name: string;
  version: string;
  /** path from monorepo top dir, always `/`, unique per package */
  path: string;
};

type DEP_SECTIONS = "dep" | "dev" | "opt" | "peer";

type PackageDepRef = PackageBasicInfo & {
  depSection: DEP_SECTIONS;
  indirectSteps?: string[];
};

type PackageDepRelation = {
  fromPkg: PackageBasicInfo;
  onPkg: PackageBasicInfo;
  depSection: DEP_SECTIONS;
  indirectSteps?: string[];
};

type FynpoPackageInfo = PackageBasicInfo & {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  private: boolean;
  managed: boolean;
  nested: boolean;
  pkgDir: string;
  pkgStr: string;
  pkgJson: Record<string, unknown>;
};

type FynpoPackages = {
  byName: Record<string, FynpoPackageInfo[]>;
  byPath: Record<string, FynpoPackageInfo>;
  byId: Record<string, FynpoPackageInfo>;
};

type PackageDepData = {
  pkgInfo: FynpoPackageInfo;
  localDepsByPath: Record<string, PackageDepRef>;
  dependentsByPath: Record<string, PackageDepRef>;
  pathOfCirculars?: string[];
  hasCircular?: boolean;
};

type FynpoTopoPackages = {
  noCircSorted: PackageDepData[];
  sorted: PackageDepData[];
  circulars: PackageDepData[];
};
```

Notes:

- `FynpoPackageInfo` dependency maps and `private` are copied from `package.json` only when present, so they can be `undefined` despite the types.
- `pkgStr`, `pkgJson`, `managed` and `nested` are non-enumerable. They are readable but absent from `Object.keys`, spreads and `JSON.stringify`.
- `managed` means fynpo lifecycle and release commands manage the package. `nested` means it was found below another package during auto-search.
- `byName` lists are sorted newest version first after `updateAuxPackageData()`.
- `byId` keys are `name@version`.
- `DEP_SECTIONS` includes `"peer"`, but `resolve()` never produces `peer` relations. Callers may add them with `addDep`.

### `PackageRef`

```ts
class PackageRef {
  type: "id" | "path" | "name";
  value: string;
  regex?: RegExp;
  mm?: Minimatch;
  constructor(ref: string);
  parseRef(ref: string): void;
  match(pkgInfo: PackageBasicInfo): boolean;
}
```

Parses a string reference to a package and tests `PackageBasicInfo` against it.

Parsing (`parseRef`, called by the constructor):

- The string is split on `:`. With more than one part, the first part (trimmed) must be `id`, `path` or `name`, else it throws `package ref '<ref>' has unknown type '<x>' - must be 'id', 'path', or 'name'`. The value is the second part, trimmed. Anything after a second `:` is dropped.
- With no `:`, `type` is `id` when the value has an `@` at an index above 0 (for example `foo@1.0.0`, `@s/foo@1.0.0`), else `name`. A scoped name `@s/foo` is `name`.
- A value starting with `/` and with a later `/` at index above 1 becomes a `RegExp` (text between the slashes, flags after the last slash) stored in `regex`. An invalid regex throws the `RegExp` error.
- A `path` value that is not a regex becomes a `Minimatch` stored in `mm`.

Matching (`match`):

| type | tested against | with `regex` | without |
| --- | --- | --- | --- |
| `path` | `pkgInfo.path` | regex test | minimatch match |
| `id` | `name@version` | regex test | exact equality |
| `name` | `pkgInfo.name` | regex test | exact equality |

### `pkgId`

```ts
function pkgId(name: string, version?: string): string
```

Returns `name@version`, or just `name` when `version` is falsy.

### `pkgInfoId`

```ts
function pkgInfoId(info: PackageBasicInfo): string
```

`pkgId(info.name, info.version)`.

### `getDepSection`

```ts
function getDepSection(fullName: string): DEP_SECTIONS
```

Maps `dependencies`, `devDependencies`, `optionalDependencies`, `peerDependencies` (and the short names `dep`, `dev`, `opt`, `peer`) to the short form. Any other value returns `"dep"`.

### `makeDepStep`

```ts
function makeDepStep(name: string, version: string, sec: string): string
```

Returns `<name>@<version>(<sec>)`, the format of entries in `indirectSteps`.

## Utilities

```ts
const posixify: (path: string) => string
function writeJson(file: string, data: unknown): Promise<void>
function writeJsonSync(file: string, data: unknown): void
function readJson<T = any>(file: string): Promise<T>
function readJsonSync<T = any>(file: string): T
function readPkgJson(dir: string): Promise<Record<string, any>>
function readPkgJsonSync(dir: string): Record<string, any>
```

- `posixify` is the identity function on platforms where `path.sep` is `/`. Elsewhere it replaces every `\` with `/`.
- `writeJson` and `writeJsonSync` write `JSON.stringify(data, null, 2)` plus a trailing newline, using `fs.writeFile` semantics (overwrite).
- `readJson` and `readJsonSync` read UTF-8 and `JSON.parse`. They throw the raw fs error (for example `ENOENT`) or `SyntaxError`. They do not wrap errors in `FynpoConfigError`.
- `readPkgJson` and `readPkgJsonSync` read `<dir>/package.json`.

## Caching

### `caching`

```ts
import { caching } from "@fynpo/base";
```

Namespace export (`export * as caching`). Its members are not exported at the package root. Contents: `readHashDigest`, `processInput`, `processLifecycleInput`, `processOutput`.

Hashes are sha256, encoded `base64url`. File discovery uses minimatch patterns. Files are scanned under `cwd`, directories are not returned, and the result is sorted.

Rule types (not importable by name):

```ts
type FilesFilterPatterns = {
  include?: string | string[];
  exclude?: string | string[];
};
type CacheBaseRule = { minimatchOptions?: any };
type CacheInputRule = FilesFilterPatterns & CacheBaseRule & {
  npmScripts?: string | string[];
  includeEnv?: string | string[];
  includeVersions?: string | string[];
};
type CacheOutputRule = FilesFilterPatterns & CacheBaseRule & {
  filesFromNpmPack?: boolean;
};
```

Rules for patterns:

- A file is kept when it matches `include` and does not match `exclude`. With no `include`, no files match.
- `minimatchOptions` defaults to `{ dot: true }`. Passing it replaces the default entirely.
- `CacheOutputRule.filesFromNpmPack` is declared but not read by any code.

### `caching.processInput`

```ts
function processInput(args?: {
  cwd?: string;
  input: CacheInputRule;
  packageJson?: Record<string, string | unknown>;
  extra?: any;
}): Promise<{
  files: string[];
  data: {
    env: Record<string, string>;
    versions: Record<string, string>;
    npmScripts: Record<string, string>;
    fileHashes: Record<string, string>;
    extra: any;
  };
  hash: string;
}>
```

Computes the cache key of a build input.

- `files`: the sorted files under `cwd` matching `input.include` and not `input.exclude`, relative to `cwd`.
- `data.env`: the `process.env` entries named by `input.includeEnv`. `data.versions`: the `process.versions` entries named by `input.includeVersions`.
- `data.npmScripts`: the `scripts` entries of `packageJson` named by `input.npmScripts`. When `packageJson` is not passed, `<cwd>/package.json` is read.
- `data.fileHashes`: file name to sha256 of its contents, in `files` order.
- `data.extra`: `extra`, or `{}`.
- `hash`: sha256 (`base64url`) of `JSON.stringify(data)`.
- `cwd` is needed in practice. Without it, hashing a file path or reading `package.json` fails.
- Throws if a file cannot be read, or if `packageJson` is not passed and `<cwd>/package.json` is missing or invalid.

### `caching.processLifecycleInput`

```ts
function processLifecycleInput(args?: {
  cwd?: string;
  input: CacheInputRule;
  packageJson?: Record<string, string | unknown>;
}): Promise<{} | Awaited<ReturnType<typeof processInput>>>
```

Reads `packageJson` (or `<cwd>/package.json`). If none of the scripts named in `input.npmScripts` exist in its `scripts`, resolves `{}` (no `files`, `data` or `hash`). Otherwise returns the result of `processInput` for the same arguments. Callers must check for the empty object.

### `caching.processOutput`

```ts
function processOutput(args?: {
  cwd?: string;
  inputHash?: string;
  calcHash?: boolean;
  output: CacheOutputRule;
  preFiles?: string[];
}): Promise<{
  files: string[];
  data: { inputHash?: string; fileHashes: Record<string, string> };
  hash: string;
  access: number;
  create: number;
}>
```

Computes the output file list of a build, and optionally its hash.

| option | type | default | behavior |
| --- | --- | --- | --- |
| `cwd` | `string` | none | Directory to scan. Treat as required. |
| `inputHash` | `string` | none | Stored in `data.inputHash`. |
| `calcHash` | `boolean` | falsy | When true, hash every output file and set `hash`. Otherwise `hash` is `""` and `data.fileHashes` is `{}`. |
| `output` | `CacheOutputRule` | required | `include`, `exclude`, `minimatchOptions`. |
| `preFiles` | `string[]` | `[]` | Extra files to add. Falsy entries and entries matching `output.exclude` (checked at each directory level) are dropped. A `cwd` prefix is stripped. |

- `files` is the unique sorted union of scanned files and `preFiles`.
- `hash` (when `calcHash`) is sha256 (`base64url`) of `JSON.stringify({ inputHash, fileHashes })`.
- `access` and `create` are both the same `Date.now()` value.

### `caching.readHashDigest`

```ts
function readHashDigest(hash: import("crypto").Hash, encoding?: BufferEncoding): string
```

Finishes a Node `crypto.Hash` and returns its digest string. `encoding` defaults to `"base64url"`. It ends the stream (`hash.end()`), so the hash cannot be updated afterwards. On Node versions without `base64url`, it computes base64 and converts it.
