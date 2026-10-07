# publish-util reference

`publish-util` prunes `package.json` before `npm pack` and restores it afterwards, so the published manifest drops dev-only and non-standard fields. It ships four bins and a small JS API. ESM only (`"type": "module"`), Node `^22.22.2 || ^24.15.0 || >=26.0.0`.

## Imports

```js
import { prePackObj, prePack, postPack, npmPublish, getPackInfo } from "publish-util";
import * as publishUtil from "publish-util";
```

Everything is a named export of the package root. There is no default export. Subpaths: only `publish-util/package.json`.

Runtime exports: `prePackObj`, `prePack`, `postPack`, `npmPublish`, `getInfo`, `getPackInfo`, `loadInfo`, `writePkgFile`, `metaFileOf`, `extractFromObj`, `removeFromObj`, `renameFromObj`, `keepStandardFields`, `utils`.

Type-only exports: `PrePackConfig`, `NpmPublishOptions`, `PackageInfo`, `SaveMeta`, `ExtractSpec`, `RemoveSpec`, `RenameSpec`.

`utils` is the whole `utils.ts` module as a namespace. It holds every utils export above plus `withPackLock`, which has no named export at the root: use `utils.withPackLock`.

Importing the root has no side effects. `prePack`, `postPack` and `npmPublish` only run when called. The bins call them.

## Bins

| Bin | Runs | Purpose |
| --- | --- | --- |
| `publish-util-prepack` | `prePack()` | save and prune `package.json` |
| `publish-util-prepublishonly` | `prePack()` | identical file body to `publish-util-prepack` |
| `publish-util-postpack` | `postPack()` | restore `package.json` |
| `do-publish` | `npmPublish()` | pack with pruned manifest, then publish the tarball |

Each bin is a shebang stub that imports from `dist/` and calls the function without `await` or `catch`. `publish-util-prepublishonly` does not run any prepublishOnly logic. It performs the prepack prune. The only visible difference is the `process.argv[1]` basename, which prefixes log lines.

### Lifecycle wiring

```json
{
  "scripts": {
    "prepack": "publish-util-prepack",
    "postpack": "publish-util-postpack"
  }
}
```

- npm runs `prepack`, packs the files, then runs `postpack`.
- A `prepack` that does other work can chain it: `"prepack": "npm run build && publish-util-prepack"`.
- The package's own `postinstall` script (`node dist/postinstall.js || true`) adds both scripts to the consumer's package.json at install time. See the postinstall section.
- `npm publish` uploads the packument before `prepack` runs, so the pruned manifest is not what the registry shows. `do-publish` exists for that: it runs `npm pack` first, then publishes the tarball.

### `publish-util-prepack`

Calls `prePack()`. Exits 1 on any error inside its try block, after logging `<bin name> failed` and the error to stderr.

### `publish-util-postpack`

Calls `postPack()`. Exits 1 on any error, after logging `<bin name> failed` and the error to stderr.

### `do-publish`

Calls `npmPublish()` with defaults (`exit: true`, `silent: false`). See `npmPublish` for flags and behavior. Its exit code is the process exit code.

## Which package.json is used

`prePack` and `postPack` find the manifest with `getPackInfo()`. `INIT_CWD` is never used for these. Resolution order:

1. `PUBLISH_UTIL_PKG_DIR` env var: `<resolved dir>/package.json`. Logs `publish-util: using <file> from PUBLISH_UTIL_PKG_DIR`. Skips the name and version checks below.
2. `npm_package_json` env var, if that file exists.
3. `<cwd>/package.json` if it exists, otherwise the nearest `package.json` found upward from cwd.

Checks after loading (not applied with `PUBLISH_UTIL_PKG_DIR`):

- `npm_package_name` set and different from the manifest `name`: throws, refusing to touch the file. The message suggests `PUBLISH_UTIL_PKG_DIR`.
- `npm_package_version` set and different from the manifest `version`: `console.warn` only.

Throws `publish-util: no package.json found for this package (looked in <where>)` when no file is found. `<where>` is the cwd, the resolved override dir, or the text `env npm_package_json`.

## Backup, metadata and lock files

All three live in `os.tmpdir()` and are derived from the package name. In the name, every `@` and `/` is replaced by `_` (a manifest without `name` uses `unknown`).

| File | Path | Content |
| --- | --- | --- |
| backup | `<tmpdir>/package-util-<n>_pkg.json` | byte copy of the original manifest |
| metadata | `<backup>.meta.json` | JSON `SaveMeta` |
| lock | `<backup>.lock` | empty file, existence is the lock |

Example for `@scope/pkg`: `<tmpdir>/package-util-_scope_pkg_pkg.json`, with `.meta.json` and `.lock` appended to that full name.

The prefix is `package-util-`, not `publish-util-`. Names that sanitize to the same string share the same files (`@a/b` and `_a_b`).

### Lock behavior (`withPackLock`)

- Creates the lock with `open(lockFile, "wx")` (exclusive create). On `EEXIST` it waits 10 ms and retries, up to 1000 attempts (about 10 seconds plus I/O time).
- Any error other than `EEXIST` is thrown immediately.
- After 1000 failed attempts it throws `publish-util: timed out waiting for pack lock <lockFile>`.
- The lock is closed and unlinked in a `finally` after the action, so a normal run or a thrown error releases it.
- A process killed while holding the lock (SIGKILL, power loss) leaves the `.lock` file. Every later `prepack` or `postpack` for that package name then fails with the timeout error until the file is deleted. The lock holds no pid and there is no stale detection.
- The lock is held only during the prepack or postpack action. A finished prepack leaves backup and metadata in place for postpack but no lock.

To clear the timeout error after an interrupted prepack, delete the `.lock` file. Then check whether the manifest is still pruned and whether the backup and `.meta.json` still exist. See "Interrupted run states" below.

## `prePack()`

```ts
function prePack(): Promise<void>
```

Steps, in order:

1. `getPackInfo()` finds and reads the manifest. This call is outside the try block: a failure rejects the promise and the bin ends through an unhandled rejection, not through `process.exit(1)` with the `failed` log.
2. Reads `pkg.publishUtil` as the `PrePackConfig` (`{}` when absent). Unless `config.silent`, logs `<bin> saveFile <backup> pkgFile <manifest>`.
3. Inside `withPackLock(backup)`:
   - Reads the metadata file. If it parses, a pack is already active:
     - Throws `publish-util: <meta.pkgFile> is already using backup <backup>` when `meta.pkgFile` differs from the resolved manifest.
     - Otherwise sets `activePacks = (activePacks ?? 1) + 1`, rewrites the metadata, returns. The manifest is not touched and nothing else runs.
   - If the metadata file is missing or unparsable: writes the original bytes to the backup (overwriting any existing backup), then writes metadata `{ pkgFile, name, version, pid, ts, activePacks: 1 }` as 2-space JSON plus newline. Metadata is written after the backup, so metadata present implies backup present.
   - Runs `prePackObj(pkg, config)` on the parsed manifest, then writes it back as `JSON.stringify(pkg, null, 2)` plus a trailing newline.
4. On any error from step 2 or 3: logs `<bin> failed` and the error, then `process.exit(1)`.

The manifest is rewritten through `writePkgFile` (same inode, hardlinks preserved).

## `postPack()`

```ts
function postPack(): Promise<void>
```

1. `getPackInfo()` runs inside the try block, so resolution errors exit 1 with `<bin> failed`.
2. Inside `withPackLock(backup)`: reads the metadata (missing or unparsable gives `undefined`).
   - If metadata exists and `activePacks > 1`: decrements it, rewrites the metadata, returns. The manifest is not restored.
   - Otherwise `target = meta.pkgFile || resolved pkgFile`. The path recorded by prepack wins over the resolved one. When they differ, logs `<bin> restoring <target> as recorded by prepack, not <resolved>`.
   - Logs `<bin> saveFile <backup> pkgFile <target>`. This log is unconditional because postpack does not read `publishUtil.silent`.
   - Reads the backup bytes, writes them to `target`, unlinks the backup, then unlinks the metadata (errors on the metadata unlink are ignored).
3. On any error, including a missing backup (ENOENT): logs `<bin> failed` and the error, `process.exit(1)`.

A backup from an older publish-util has no metadata. Then `activePacks` counts as 1 and the resolved path is the restore target.

Concurrent packs of one package name share one backup. Each prepack increments `activePacks` and only the last postpack restores.

### Interrupted run states

- Killed while the lock is held: stale `.lock`, see Lock behavior.
- Killed after prepack finished but before postpack: backup and metadata remain and the manifest is pruned. The next `prepack` finds the metadata, raises `activePacks` to 2 and leaves the manifest alone. The following `postpack` only decrements to 1, and a second `postpack` restores. Deleting the metadata file instead makes the next prepack back up the already pruned manifest over the old backup. To recover the original, keep the backup and copy it over the manifest by hand, or run `postpack` until it restores.
- `postpack` with no backup present: throws ENOENT, exit 1, manifest untouched.

## `prePackObj(pkg, config?)`

```ts
function prePackObj(pkg: Record<string, unknown>, config?: PrePackConfig): void
```

Mutates `pkg` in place. No file access; only `console.log`. Steps, in order:

1. `renameFromObj(pkg, config.rename)`.
2. If `config.keep`: `keepObj = extractFromObj(pkg, config.keep)`. Taken after rename and before remove.
3. If `config.remove`: `removeFromObj(pkg, config.remove)`.
4. `delete pkg.publishUtil`.
5. Unless `config.removeExtraKeys === false`: deletes every top level key not in `keepStandardFields`. Unless `silent`, logs `removed non-standard fields: <keys>` plus a hint. Nothing is logged when no key was removed.
6. If `scripts.postpack` is falsy and `config.autoPostPack !== false`: sets `scripts.postpack = "publish-util-postpack"`, creating `scripts` if needed. Unless `silent`, logs a notice. `scripts` is read after step 3, so a `remove` that deleted `scripts.postpack` or all of `scripts` triggers the re-add.
7. If `scripts.prepack === "publish-util-prepack"` (exact string): deletes it. `scripts` is the object read in step 6, so this does nothing if `scripts` did not exist then. A `prepack` such as `npm run build && publish-util-prepack` is kept.
8. If `keepObj`: `lodash.merge(pkg, keepObj)`. This runs last, so `keep` restores fields that `remove`, `removeExtraKeys` or step 7 deleted. `merge` skips `undefined`, so keeping a key that does not exist adds nothing.

`workspaces` is not in `keepStandardFields`, so step 5 removes it unless it is kept or `removeExtraKeys` is `false`.

### `PrePackConfig`

```ts
interface PrePackConfig {
  rename?: RenameSpec;
  keep?: ExtractSpec;
  remove?: RemoveSpec;
  removeExtraKeys?: boolean;
  autoPostPack?: boolean;
  silent?: boolean;
}
```

`prePack` reads it from the `publishUtil` field of package.json. `publishUtil` itself is deleted from the output.

| Option | Type | Default | Behavior |
| --- | --- | --- | --- |
| `rename` | `RenameSpec` | none | rename fields before keep and remove |
| `keep` | `ExtractSpec` | none | fields restored after all removal |
| `remove` | `RemoveSpec` | none | fields to delete |
| `removeExtraKeys` | `boolean` | on (any value except `false`) | delete top level non-standard fields |
| `autoPostPack` | `boolean` | on (any value except `false`) | add `scripts.postpack` when missing |
| `silent` | `boolean` | `false` | suppress `prePack` and `prePackObj` logs. `postPack` ignores it |

### `keepStandardFields`

```ts
const keepStandardFields: string[]
```

Top level keys that survive `removeExtraKeys`:

`name`, `version`, `description`, `keywords`, `homepage`, `bugs`, `license`, `author`, `contributors`, `funding`, `files`, `main`, `browser`, `bin`, `man`, `directories`, `repository`, `scripts`, `config`, `dependencies`, `devDependencies`, `peerDependencies`, `peerDependenciesMeta`, `bundledDependencies`, `bundleDependencies`, `optionalDependencies`, `engines`, `os`, `cpu`, `libc`, `private`, `publishConfig`, `module`, `type`, `types`, `typings`, `typesVersions`, `sideEffects`, `exports`, `imports`, `unpkg`, `jsdelivr`.

`devDependencies` is kept by default. Drop it with `remove: ["devDependencies"]`. `workspaces` is deliberately absent.

## Spec types and helpers

```ts
type RenameSpec = Record<string, string | string[]>;
type RemoveSpec = (string | Record<string, RemoveSpec>)[];
type ExtractSpec = (string | Record<string, ExtractSpec>)[];
```

String entries in `RemoveSpec` and `ExtractSpec` are a key name or a regex written `"/<source>/<flags>"`. A string that starts with `/` and splits on `/` into exactly 3 parts is a regex (`new RegExp(parts[1], parts[2])`) tested with `String.match` against the object's own keys. Any other string (including one with more slashes, such as `/a/b/c`) is a literal key. An invalid regex throws `SyntaxError`. Object entries reach into a nested key: `{ "scripts": ["test", "/^pre/"] }`.

### `renameFromObj(obj, rename?)`

```ts
function renameFromObj(obj: Record<string, unknown>, rename?: RenameSpec): void
```

For each key in `rename`: reads `lodash.get(obj, key)` (dot paths allowed). If the value is not `undefined` and the target is truthy, it `unset`s the old path and `set`s the target path (a string or a path array). A missing source or empty target is skipped.

### `removeFromObj(obj, fields)`

```ts
function removeFromObj(obj: Record<string, unknown>, fields: RemoveSpec): void
```

Deletes matching keys. Nested object entries recurse into `obj[key]`. Throws `TypeError` when that nested key does not exist (for example `{ "scripts": ["test"] }` on a manifest with no `scripts`), because the recursion runs on `undefined`. In `prePack` that exits 1.

### `extractFromObj(obj, fields, output?)`

```ts
function extractFromObj(
  obj: Record<string, unknown>,
  fields: ExtractSpec,
  output?: Record<string, unknown>
): Record<string, unknown>
```

Copies matching keys into `output` (default `{}`) and returns it. Leaf values are copied by reference. A nested entry on a missing or falsy value copies that value, on a primitive copies it, and on an object builds a new instance of the same constructor (arrays stay arrays) and recurses. A literal key that does not exist yields `output[key] = undefined`.

## `npmPublish(options?)`

```ts
interface NpmPublishOptions {
  exit?: boolean;
  silent?: boolean;
}

function npmPublish(options?: NpmPublishOptions): Promise<number>
```

| Option | Type | Default | Behavior |
| --- | --- | --- | --- |
| `exit` | `boolean` | `true` | call `process.exit(code)` in `finally`. When `false`, resolves with the code (0 or 1) |
| `silent` | `boolean` | `false` | suppress the `Restoring <file>` and `publishing args:` logs |

`do-publish` runs this. Arguments come from `process.argv.slice(2)`. Steps:

1. Installs a no-op `SIGINT` listener so the parent survives Ctrl-C while children handle it.
2. `getInfo()` finds the manifest from `INIT_CWD` or cwd (it does not use `getPackInfo`).
3. Extracts flags from argv. Only the space-separated form is recognized, so `--tag=x` is passed through untouched:
   - `--dry-run`: boolean, removed from argv, not forwarded.
   - `--tag <tag>`: forwarded as `--tag <tag>`. A missing value fails an assert (`--tag must specify a tag`).
   - `--access <public|restricted>`: forwarded. Any other value, or none, fails an assert naming the allowed values.
   - A failed assert is thrown before the try block. The promise rejects, no restore runs, and the `SIGINT` listener stays.
4. Tarball name: `<name with @ removed and / replaced by ->-<version>.tgz` in the package dir (`unknown` and `0.0.0` as fallbacks).
5. Sets `process.env.BY_PUBLISH_UTIL = "1"` (never unset) and `chdir`s to the package dir.
6. If `scripts.prepublish` exists: warns on stderr that it is deprecated, removes it from the manifest object, marks the manifest changed.
7. If `--dry-run`: deletes `scripts.prepare`, marks changed.
8. If changed: writes the modified manifest as `JSON.stringify(pkg, null, 2)` (no trailing newline).
9. If `scripts.prepublishOnly`: runs `npm run prepublishOnly`.
10. Deletes any existing tarball, then runs `npm pack`. That triggers the package's `prepack` and `postpack`.
11. If `scripts.publish`: runs `npm run publish`.
12. Not dry-run: runs `npm publish [--tag t] [--access a] <tarball> <remaining argv>`. Dry-run: prints `dry-run <tgz> args: [...]` and publishes nothing, though `npm pack` already ran.
13. `finally`: if the manifest was changed in step 6 to 8, writes the original bytes back (errors ignored). Then restores cwd, removes the SIGINT listener, deletes the tarball, and calls `process.exit(code)` when `exit` is true.

Child commands run with `stdio: "inherit"`, through a shell on Windows. A non-zero child exit rejects with `<cmd> <args> exited with code <n>`.

Failure: any error inside the try is logged as `publish failed!` plus the error and the code becomes 1. If the error message contains `SIGINT`, it prints a blank line instead. A signal-killed child gives `exited with code null`, which does not contain `SIGINT`, so that branch is not reached by child failures.

## `getInfo(cwd?)`

```ts
function getInfo(cwd?: string): Promise<PackageInfo>
```

`cwd` defaults to `process.env.INIT_CWD || process.cwd()`. Finds the nearest `package.json` upward with `find-up`, then calls `loadInfo`. Throws `No package.json found starting from directory: <cwd>`. Not safe for pack-time scripts, use `getPackInfo`.

## `getPackInfo(cwd?)`

```ts
function getPackInfo(cwd?: string): Promise<PackageInfo>
```

`cwd` defaults to `process.cwd()`. Resolution and checks are in "Which package.json is used". Used by `prePack` and `postPack`.

## `loadInfo(pkgFile)`

```ts
function loadInfo(pkgFile: string): Promise<PackageInfo>
```

Reads and parses the manifest at the given path. Throws the filesystem error or `SyntaxError` for a missing or invalid file. Computes the backup path from the manifest `name`.

### `PackageInfo`

```ts
interface PackageInfo {
  pkgDir: string;                 // dirname of the manifest
  pkg: Record<string, unknown>;   // parsed manifest
  pkgData: Buffer;                // raw bytes as read
  tmpDir: string;                 // os.tmpdir()
  saveName: string;               // package-util-<n>_pkg.json
  saveFile: string;               // <tmpDir>/<saveName>, the backup
  pkgFile: string;                // manifest path
}
```

### `SaveMeta`

```ts
interface SaveMeta {
  pkgFile: string;
  name?: string;
  version?: string;
  pid: number;
  ts: string;          // ISO timestamp
  activePacks?: number;
}
```

Contents of the `.meta.json` file. Only `pkgFile` and `activePacks` are read back. `pid`, `ts`, `name` and `version` are informational.

### `metaFileOf(saveFile)`

```ts
const metaFileOf: (saveFile: string) => string
```

Returns `${saveFile}.meta.json`.

### `utils.withPackLock(saveFile, action)`

```ts
function withPackLock<T>(saveFile: string, action: () => Promise<T>): Promise<T>
```

Runs `action` while holding `${saveFile}.lock`. Behavior is under Lock behavior. Reachable only through the `utils` namespace.

## `writePkgFile(file, content)`

```ts
function writePkgFile(file: string, content: string | Buffer): Promise<boolean>
```

Returns `true` if it wrote, `false` if the file already had identical bytes.

- File missing or unreadable: plain `writeFile`.
- Otherwise opens `r+` (no truncate), writes the new bytes at offset 0, then truncates to the new length. A shorter replacement is first padded with spaces to the old length in the same write. The inode is kept, so fyn hardlinks into `node_modules` see the change.
- Errors from `open`, `write` or `truncate` propagate.

## postinstall

`dist/postinstall.js` is not exported. The package's own `postinstall` script runs it as `node dist/postinstall.js || true`, so a non-zero exit never fails an install.

- Reads `INIT_CWD`. If unset, logs `publish-util postinstall: no INIT_CWD env - skipping` and returns.
- `getInfo(INIT_CWD)` finds the nearest manifest upward. Failure here is outside the try block and becomes an unhandled rejection, which `|| true` swallows.
- For `prepack` and `postpack`: if `scripts.<name>` is absent, sets it to `publish-util-prepack` or `publish-util-postpack`. If it exists and does not contain that string, warns on stderr and leaves it. An existing script that contains it is kept silently.
- Writes the manifest as `JSON.stringify(pkg, null, 2)` plus newline through `writePkgFile`. Identical bytes mean no write. A manifest with other formatting (not 2-space, or no trailing newline) is reformatted even when no script was added.
- Write errors are logged and swallowed.
- It runs for any install of this package, as a dependency or devDependency.

## Environment variables

| Variable | Read by | Effect |
| --- | --- | --- |
| `PUBLISH_UTIL_PKG_DIR` | `getPackInfo` | directory of the manifest to use. Disables the name and version checks |
| `npm_package_json` | `getPackInfo` | manifest path, used when the file exists |
| `npm_package_name` | `getPackInfo` | must equal the manifest name, else throws |
| `npm_package_version` | `getPackInfo` | mismatch logs a warning only |
| `INIT_CWD` | `getInfo` default, postinstall | start dir for manifest lookup. Never used by prepack or postpack |
| `BY_PUBLISH_UTIL` | set by `npmPublish` to `"1"` | read by the repo's own `check.js` guard, which is not shipped (not in `files`) |

## Mismatches with README

- README says `scripts.prepublishOnly` is removed automatically when it equals `publish-util-prepublishonly`. The code never touches `prepublishOnly`. It deletes `scripts.prepack` when it equals exactly `publish-util-prepack`.
- README shows `"prepack": "npm run build && publish-util-prepack"`. The code only drops a `prepack` that is exactly `publish-util-prepack`, so the chained form stays in the published manifest.
- README says `postpack` cannot be removed. In code it is only re-added when missing and `autoPostPack` is not `false`. With `autoPostPack: false`, a `remove` of it sticks.
- README does not mention the backup, metadata and lock files, `activePacks`, `PUBLISH_UTIL_PKG_DIR`, or the manifest name check.
- README says the standard fields are those in the npm docs plus `module`. The code uses an explicit list (`keepStandardFields`) that also has `libc`, `typings`, `typesVersions`, `sideEffects`, `exports`, `imports`, `unpkg`, `jsdelivr`.
