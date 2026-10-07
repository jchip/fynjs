# filter-scan-dir reference

`filter-scan-dir` recursively scans a directory and returns a flat array of matching paths, or a record of arrays when grouping is on. It has a sync and an async form, filter callbacks, ignore rules, and a concurrent async walker. It has no runtime dependencies. The package is ESM (`"type": "module"`) with a CJS shim.

## Imports

```js
// ESM
import { filterScanDir, filterScanDirSync } from "filter-scan-dir";
```

```js
// CJS
const filterScanDir = require("filter-scan-dir");
const { filterScanDirSync } = require("filter-scan-dir");
```

Runtime exports: `filterScanDir`, `filterScanDirSync`. The ESM build has exactly these two named exports. It has no default export and no subpaths (only `filter-scan-dir/package.json`).

The CJS entry (`index.cjs`) loads the ESM build with `require` and returns the `filterScanDir` function itself, with the module's named exports copied onto it. So `require("filter-scan-dir")` is callable, and `.filterScanDir` and `.filterScanDirSync` also exist on it. Node must support `require(esm)` (`engines` is `^22.22.2 || ^24.15.0 || >=26.0.0`).

Type-only exports: `Options`, `GroupingOptions`, `GroupingResult`, `FilterCallback`, `FilterResult`, `FilterInfo`, `ExtrasData`, `GitignoreParser`, `GitignoreMatcher`.

Not exported: the `GitignoreRules` class and the path helpers (internal).

## `filterScanDirSync` and `filterScanDir`

```ts
function filterScanDirSync(options?: string): string[];
function filterScanDirSync(options: GroupingOptions<true>): GroupingResult;
function filterScanDirSync(options: GroupingOptions<false>): GroupingResult;
function filterScanDirSync(options: GroupingOptions): GroupingResult;
function filterScanDirSync(options: Options<true>): string[];
function filterScanDirSync(options: Options<false>): string[];
function filterScanDirSync(options?: Options): string[];

function filterScanDir(options?: string): Promise<string[]>;
function filterScanDir(options: GroupingOptions<true>): Promise<GroupingResult>;
function filterScanDir(options: GroupingOptions<false>): Promise<GroupingResult>;
function filterScanDir(options: GroupingOptions): Promise<GroupingResult>;
function filterScanDir(options: Options<true>): Promise<string[]>;
function filterScanDir(options: Options<false>): Promise<string[]>;
function filterScanDir(options?: Options): Promise<string[]>;
```

Both walk the tree starting at `join(cwd, prefix)` and return the collected paths. The sync form blocks the event loop. The async form returns a promise and can read directories concurrently.

- `options` as a string is shorthand for `{ cwd: options }`.
- No argument means `{}`: scan `process.cwd()`.
- Return type is `GroupingResult` when `grouping: true` is in the options, otherwise `string[]`. At runtime any truthy `grouping` enables grouping; the types only accept `true`.
- The user's options object is not mutated. Options are copied over defaults with `Object.assign`.
- Options set explicitly to `undefined` override the default (see Quirks).
- `filterScanDir` calls option validation before it returns a promise, so an invalid option combination throws synchronously instead of rejecting.

### What gets scanned

- Each directory is read once. Non-directory entries are processed first, then subdirectories one by one, depth first.
- Entries are classified with `lstat` (or `Dirent` when `fullStat: false`). Symlinks are never followed, and a symlink to a directory counts as a non-directory entry.
- Non-directory entries (regular files, symlinks, sockets, and so on) go to `filter`. Directory entries go to `filterDir`. `filter` is never called for a directory and `filterDir` never for a file.
- The scan root itself is never reported or filtered. Only its entries are.
- With default options, symlinks are skipped before `filter` is called (see `includeSymlink`).

### Options

`Options<FullStat>` fields. All are optional.

| option | type | default | behavior |
| --- | --- | --- | --- |
| `cwd` | `string` | `process.cwd()` | Directory to scan. The legacy key `dir` is read as a fallback when `cwd` is falsy (not in the types). Unless `pathSep` is set as an own property, backslashes in `cwd` are replaced with `/`. |
| `prefix` | `string` | `""` | Sub-path scanned below `cwd`. The walk starts at `join(cwd, prefix)`. It appears in the returned paths (`dirFile`, `extras.path`) and in `fullFile`. Entries are not made relative to it. A trailing separator in `prefix` produces a doubled separator in results (`a//y.ts`). |
| `prependCwd` | `boolean` | `false` | Return `extras.fullFile` instead of `extras.dirFile`. The legacy key `includeRoot`, when present as an own property, takes precedence over `prependCwd` (even if `undefined`, which gives `false`). `includeRoot` is not in the types. |
| `sortFiles` | `boolean` | `false` | Sort the entries of each directory by name (plain `<`/`>` string comparison) before processing. Only sorts within one directory. Without it, order is whatever `readdir` returns. |
| `includeDir` | `boolean` | `false` | Add directory entries to the result, when `filterDir` accepts them and does not set `skip: true`. Also makes symlinks reach `filter` (see `includeSymlink`). Directory names have no trailing separator. |
| `includeSymlink` | `boolean` | `false` | A symlink entry (file or directory target) is skipped before `filter` unless `includeSymlink` is truthy or `includeDir` is truthy. Symlinks that pass are handled as non-directory entries and never descended. |
| `maxLevel` | `number` | `Infinity` | Zero-based depth limit for descending. `0` scans only the entries directly in the scan root: subdirectories are still passed to `filterDir` and can be listed with `includeDir`, but are not read. `1` also reads their children, and so on. |
| `fullStat` | `boolean` | `true` | `true`: call `fs.lstat` for each accepted entry, `extras.stat` is `fs.Stats`. `false`: use `readdir` `Dirent` objects as `extras.stat`, with no `lstat` calls. This is much faster, but there is no size, time or mode. |
| `concurrency` | `number` | `50` | Async only, ignored by the sync form. Maximum directories being read (`readdir` plus its `lstat` calls) at the same time. A directory waiting for its children does not hold a slot. Values `<= 1` (including `0`, negatives and `NaN`) walk serially. `Infinity` removes the limit. Also bounds how many child walks are started at once per directory. |
| `rethrowError` | `boolean` | `false` | Throw errors instead of swallowing them. See Errors. |
| `filter` | `FilterCallback` | none (accept all) | Called for each non-directory entry that passed early filtering. See Filter callback. |
| `filterDir` | `FilterCallback` | none (accept all) | Called for each directory entry that passed early filtering. Controls both listing (`includeDir`) and descending. |
| `ignoreDirs` | `string \| string[]` | none | Directory basenames to skip at every depth. Exact name match, not a path or glob. The skipped directory is not stat-ed, not passed to `filterDir`, not listed, and not read. Applies only to entries that `readdir` reports as directories, so a symlink named like an ignored dir is not matched. The scan root is not checked. |
| `gitignore` | `GitignoreParser` | none (disabled) | Parser factory that turns on `.gitignore` handling. See Gitignore. |
| `prefilter` | `(file: string, path: string, entry: Dirent) => boolean` | none | Synchronous check on the `Dirent` before `lstat`. Return a falsy value to drop the entry. Dropping a directory prunes its whole subtree. Called for files and directories. `path` is the same relative directory string as `extras.path`. Throws `TypeError("prefilter requires fullStat: true")` when `fullStat` is `false`. |
| `ignoreExt` | `string \| string[]` | none | Extensions to drop. Applied to non-directory entries only. |
| `filterExt` | `string \| string[]` | none | Keep only these extensions. Applied after `ignoreExt`, non-directory entries only. |
| `pathSep` | `string` | `"/"` (`path.posix.sep`) | Separator used to join `dirFile` and `fullFile`. See Quirks before changing it. An empty string falls back to `"/"`. |

`GroupingOptions<FullStat>` is `Options<FullStat>` plus `grouping: true`.

Type notes:

- `Options<false>` requires `fullStat: false` in the literal and gives callbacks a `Dirent` stat. `Options<true>` and the default `Options` give `Stats` or a union of both (the callback type is distributive over `boolean`).
- `FilterCallback<Stat>` is typed with `Stat` selected by `FullStat`, but the walkers choose the actual stat object at runtime from `fullStat`.

### Extension filters

- `ignoreExt` and `filterExt` accept a string or array. Each value is normalized: `"*.js"` becomes `".js"`, `"js"` becomes `".js"`, `".js"` stays. Empty or falsy values are dropped.
- An entry's extension is the text from the last `.` onward, when that `.` is not at index 0. `a.test.js` has `.js`. `.rc` and `noext` have the extension `""`.
- Comparison is exact and case sensitive.
- `ignoreExt` runs first. If `filterExt` is non-empty, entries whose extension is not listed are dropped. An entry with extension `""` is always dropped by a non-empty `filterExt`, because empty values are removed from the list. You cannot select extensionless or dotfile names with `filterExt`.
- Extension filters run on the `Dirent` name before `lstat`, so a rejected entry never calls `filter` and cannot raise an `lstat` error.

### Early filter order

For each entry, the checks run in this order and the first failing check drops it:

1. `ignoreDirs` (directories only)
2. `gitignore`
3. `prefilter`
4. `ignoreExt` and `filterExt` (non-directories only)
5. `lstat` (when `fullStat` is `true`)
6. symlink skip (non-directories only, see `includeSymlink`)
7. `filter` or `filterDir`

Steps 1 to 4 run only when at least one of `gitignore`, `prefilter`, `ignoreDirs`, `ignoreExt` or `filterExt` is set. In that case `readdir` is called with `withFileTypes: true`. `fullStat: false` also uses `withFileTypes`.

### Filter callback

```ts
type FilterCallback<Stat extends Dirent | Stats = Dirent | Stats> = (
  file: string,
  path: string,
  extras: ExtrasData<Stat>,
) => FilterResult;

type FilterResult = boolean | string | FilterInfo;

type FilterInfo = {
  group?: string;
  skip?: boolean;
  stop?: boolean;
  formatName?: string;
};

type ExtrasData<Stat extends Dirent | Stats = Dirent | Stats> = {
  file: string;
  path: string;
  stat: Stat;
  fullFile: string;
  dirFile: string;
  ext: string;
  noExt: string;
  files: (string | Dirent)[];
};
```

Arguments:

- `file`: entry name.
- `path`: directory that contains the entry, relative to `cwd`, joined with `pathSep`, and starting with `prefix`. It is `""` for entries in the root when `prefix` is empty.

`ExtrasData` fields:

| field | value |
| --- | --- |
| `file` | entry name |
| `path` | same as the second argument |
| `stat` | `fs.Stats` from `lstat` when `fullStat` is `true`, else the `Dirent` |
| `fullFile` | `join(cwd, path)` (normalized by `path.join`) joined with `file` by `pathSep`. It is relative if `cwd` is relative. |
| `dirFile` | `path` joined with `file`. If `path` is `""` or `"."`, it is `file`. |
| `ext` | from the last `.` (kept) when that `.` is not at index 0, else `""` |
| `noExt` | `file` without `ext` |
| `files` | the names in the directory. With `fullStat: false`, these are the `Dirent` objects. With `fullStat: true` they are strings. |

`files` holds all entries in the directory, including ones rejected by early filters. It is sorted when `sortFiles` is set. The callbacks must treat it as read-only because it is shared.

Return values:

| return | effect |
| --- | --- |
| `false`, `undefined`, `null`, `0`, `""` (any falsy) | Skip the entry. A skipped directory is not listed and not descended. |
| `true` | Accept. The entry goes to the `files` group. A directory is also descended. |
| non-empty `string` | With `grouping` on, accept and put the entry in the group with that name. With `grouping` off, accept into the plain result as with `true`. |
| object (`FilterInfo`) | Any object is truthy so it accepts the entry unless `skip === true`. See below. |
| any other truthy value | Accepted like `true`. |

`FilterInfo` fields, read only from object returns:

- `skip`: only the exact value `true` skips. For a file, skip means not added. For a directory, skip means not added and not descended (a directory with `skip: true` is never read). Returning a falsy `skip` or none adds the entry.
- `stop`: when `true`, halts the whole scan. The entry that returned `stop` is still added unless `skip: true` is also set. Sync scans stop at once. Async scans stop starting new work. Reads already in flight finish, but no entry is added after the stop flag is set. Result so far is returned (not an error).
- `group`: group name for the entry. It is honored for objects even when `grouping` is off (see Quirks).
- `formatName`: when not `undefined`, this string is added to the result instead of `dirFile` or `fullFile`. `prependCwd` is ignored for that entry. An empty string is accepted.

Callback rules:

- Callbacks are called synchronously and their return value is not awaited. A function returning a Promise returns a truthy object, so everything is accepted (see Quirks).
- Directories are passed to `filterDir` after all non-directory entries of the same parent were processed. A directory's entries are processed only after `filterDir` returns for it.
- `filter` and `filterDir` return values are not required to be a `FilterInfo`. `boolean` and `string` are enough.

### Result

- Without grouping: `string[]`. Empty array when nothing matches or when an error was swallowed.
- With grouping: `GroupingResult`.

```ts
type GroupingResult = { files: string[] } & Record<string, string[]>;
```

The `files` array is always present, and holds entries with no group (a `true` return, no `group`, or `""`). Other group keys exist only when at least one entry was added to them. A group named `files` merges with the default group. The returned object is a plain object (a copy of the internal null-prototype record).

Each entry is one of: `dirFile` (default), `fullFile` (`prependCwd`), or `formatName`. Directories are added as the same kind of string, without a trailing separator, when `includeDir` is true.

Without grouping, the result is the `files` group only. Any entry placed in another group by a `{ group }` object is dropped from the output.

### Ordering

- Sync scan, and async with `concurrency <= 1`: deterministic for a given `readdir` order. Within a directory, non-directory entries come first, in `readdir` order (name order with `sortFiles`). Then each subdirectory: the directory entry itself (if `includeDir`), followed by everything inside it (depth first), before the next sibling directory.
- `readdir` order is the file system's order. It is not guaranteed to be sorted without `sortFiles`.
- `sortFiles` sorts each directory separately. It does not sort the final array.
- Async with `concurrency > 1`: sibling subdirectories are read concurrently, so entries from different directories can interleave. Order across directories is not deterministic. Sort the result yourself if you need stable output.

### Symlinks

- Never followed. `lstat` or `Dirent` reports a symlink as a symlink, so a link to a directory is not descended even with `includeDir`.
- By default (`includeDir` and `includeSymlink` both falsy), every symlink is skipped before `filter`: links to files as well as links to directories.
- When `includeSymlink` or `includeDir` is true, symlinks are passed to `filter` as ordinary entries. A returned symlink to a directory is reported as a file entry.
- Dangling symlinks are not an error. With `fullStat: true`, `lstat` reads the link itself.

### Gitignore

```ts
type GitignoreMatcher = {
  test(path: string): { ignored: boolean; unignored: boolean };
};
type GitignoreParser = (contents: string) => GitignoreMatcher;
```

The package bundles no parser. `gitignore` is a function that receives the text of one `.gitignore` file and returns a matcher. `matcher.test(p)` gets a POSIX path (`/` separated) relative to the directory of that `.gitignore`, with a trailing `/` for directories. It returns `{ ignored, unignored }`. Both should be `false` when no pattern matches. The result shape matches the object returned by `ignore().add(contents).test(p)` from the `ignore` package, so `gitignore: contents => ignore().add(contents)` works.

Rules:

- Disabled when `gitignore` is not set. Nothing is read.
- At the scan root (`join(cwd, prefix)`, resolved to absolute), the loader walks up looking for a directory that contains `.git` (file or directory, tested with `existsSync`). It loads `.gitignore` from that directory down to the scan root, outermost first. If no `.git` is found up to the filesystem root, only the scan root's own `.gitignore` is loaded.
- Each visited subdirectory then adds its own `.gitignore` after its parent's rules.
- A missing `.gitignore` (`ENOENT`) or a path component that is a file (`ENOTDIR`) is ignored. Any other read error (for example `EISDIR`, `EACCES`) and any error thrown by the parser follow the `rethrowError` rules.
- Rules are applied in order, later ones override earlier ones. A match with `ignored: true` ignores the entry. A match with `unignored: true` re-includes it. If a scan root is itself ignored by an ancestor's rules, the rule set restarts at that root, so the scan can proceed inside an ignored tree.
- Ignored directories are pruned, so their children are never read. A `.gitignore` is not consulted for a pruned directory, so negations cannot re-include a file under an ignored directory (only the matcher rules decide).
- `.git` is not excluded automatically. Use `ignoreDirs: ".git"`.
- Git's index, `.git/info/exclude` and global excludes are not read.
- Works in sync and async scans and with either `fullStat` mode. Each `.gitignore` is read with `readFileSync` or `fs.promises.readFile` to match the scan type.
- Symlinks to directories are tested as non-directories (no trailing `/`), because the `Dirent` is not a directory.

### Errors

Defaults swallow errors. Any error inside one directory's processing (`readdir`, `lstat`, a `.gitignore` read or parse, or a callback throw) aborts the rest of that directory: its remaining entries and subdirectories are not processed. Entries added before the error stay in the result. Other directories continue.

A missing `cwd` or `prefix` returns an empty result.

With `rethrowError: true`:

- Sync: the first error propagates out of `filterScanDirSync` unchanged. Partial results are lost.
- Async: the first error is recorded and the scan stops. In-flight directories finish, then the returned promise rejects with the original error. Later errors are dropped.

Never swallowed, regardless of `rethrowError`:

- `prefilter` with `fullStat: false` throws `TypeError("prefilter requires fullStat: true")` from both functions before any scanning. The async form throws synchronously rather than returning a rejected promise.
- Errors reading options (for example a getter that throws) also throw directly.

`stop: true` is not an error and returns the partial result.

### Quirks

Each of these follows from the code as written.

- **Explicit `undefined` options override defaults.** `Object.assign` copies own keys that are `undefined`.
  - `{ maxLevel: undefined }` never descends: `level < undefined` is false, so only root entries are listed.
  - `{ concurrency: undefined }` walks serially, as `undefined > 1` is false.
  - `{ prefix: undefined }` makes `path.join` throw inside the walk. Without `rethrowError` the error is swallowed and the result is empty. With it, the `TypeError` is thrown.
  - `{ fullStat: undefined }` is safe: it is normalized to `true`.
- **`pathSep` other than the platform separator breaks scanning on POSIX.** `fullFile` is built with `pathSep` and passed to `lstat`, so `pathSep: "|"` with `fullStat: true` makes every `lstat` fail (swallowed, empty result). Nested directory paths are also built with `pathSep` and read again with `path.join`, so with `fullStat: false` recursion stops after depth 1.
- **Object `group` without `grouping`.** `filter: () => ({ group: "g" })` without `grouping: true` returns `[]`: the entries are stored in group `g` and the result only returns `files`.
- **Async callbacks.** `filter: async () => false` accepts every entry, since a Promise is a truthy object with no `skip`.
- **Trailing separator.** `cwd: "t/"` with `prependCwd: true` gives `t//.rc`. `prefix: "a/"` gives `a//y.ts`.
- **`filterExt` cannot select extensionless or dotfile names.** `filterExt: ".rc"` does not match a file named `.rc`.

### Examples

```js
// recursive, sorted, with groups
const r = filterScanDirSync({
  cwd: "src",
  sortFiles: true,
  grouping: true,
  filter: (file, path, { ext }) => (ext === ".ts" ? "ts" : ext === ".js" ? "js" : false),
});
// r = { files: [], ts: [...], js: [...] }
```

```js
// fast scan: Dirent only, skip noisy dirs, async
const files = await filterScanDir({
  cwd: ".",
  fullStat: false,
  ignoreDirs: ["node_modules", ".git"],
  filterExt: [".js", ".ts"],
});
```

```js
// stop at the first match
const found = filterScanDirSync({
  cwd: ".",
  filter: (file) => (file === "package.json" ? { stop: true } : false),
});
```
