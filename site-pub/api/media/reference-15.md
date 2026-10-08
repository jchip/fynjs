# pkg-preper reference

`pkg-preper` builds a pacote `dirPacker` for directories that did not come from the npm registry (for example git dependencies). If the directory's `package.json` has a `prepare` script, it calls your `installDependencies` callback first, then packs the directory into a gzipped tarball using `npm-packlist` and `tar`. ESM only (`"type": "module"`). Runtime dependencies: `cacache`, `npm-packlist`, `tar`.

## Imports

```js
import PkgPreper from "pkg-preper";
import { PkgPreper } from "pkg-preper";
```

```ts
import type { PkgPreperOptions, Manifest, PackageJson, InstallDependenciesCallback } from "pkg-preper";
```

The default export and the named export `PkgPreper` are the same class. There are no subpaths (only `pkg-preper/package.json`).

Runtime exports: `default` (the class), `PkgPreper`.

Type-only exports: `PkgPreperOptions`, `Manifest`, `PackageJson`, `InstallDependenciesCallback`.

Not exported: the internal `readPkgJson` helper. Instance fields `_tmpDir` and `_installDependencies` are TypeScript `private`.

## `PkgPreper`

```ts
class PkgPreper {
  constructor(options: PkgPreperOptions);
  packDirectory(mani: Manifest, dir: string, target: string): Promise<void>;
  depDirPacker(manifest: Manifest, dir: string): PassThrough;
  getDirPackerCb(): (manifest: Manifest, dir: string) => PassThrough;
}
```

The constructor only stores `tmpDir` and `installDependencies`. It validates nothing and touches no files. Missing or wrong-typed options fail later, when a method uses them.

### Types

```ts
interface PkgPreperOptions {
  tmpDir: string;
  installDependencies: InstallDependenciesCallback;
}

type InstallDependenciesCallback = (dir: string, message: string) => Promise<any>;

interface Manifest {
  _resolved?: string;
  [key: string]: any;
}

interface PackageJson {
  name?: string;
  version?: string;
  scripts?: { prepare?: string; [key: string]: string | undefined };
  [key: string]: any;
}
```

| option | type | default | behavior |
| --- | --- | --- | --- |
| `tmpDir` | `string` | none, required | Used as a cacache root. Scratch dirs are created at `<tmpDir>/tmp/<prefix>...` (see side effects). `tmpDir` itself and `<tmpDir>/tmp` are created if missing. |
| `installDependencies` | `(dir, message) => Promise<any>` | none, required | Called by `depDirPacker` only when `package.json` has a truthy `scripts.prepare`. It must install dependencies (with dev) and run the prepare script. The resolved value is ignored. A rejection fails the pack. |

`Manifest` is a pacote manifest. Only `_resolved` is read, and only for the message text. `PackageJson` is the parsed `package.json` of `dir`. It is only used for `scripts.prepare`, `name`, and as the `package` field of the packlist tree stub.

## `packDirectory(mani, dir, target)`

```ts
packDirectory(mani: Manifest, dir: string, target: string): Promise<void>
```

Packs `dir` into a tarball at `target`. It does not run the prepare step. It resolves with `undefined`.

| parameter | type | behavior |
| --- | --- | --- |
| `mani` | `Manifest` | Unused. Accepted for signature compatibility. |
| `dir` | `string` | Package directory. Must contain a parseable `package.json`. Used as tar `cwd`. |
| `target` | `string` | Output tarball path. Its basename names the temp file. Its parent directory must already exist. An existing file is replaced. |

Steps:

1. Reads `<dir>/package.json` and parses it (`JSON.parse` of the trimmed text).
2. Creates a scratch dir `<tmpDir>/tmp/packing<random>` through `cacache.tmp.withTmp`.
3. Builds a minimal stand-in for an arborist node: `{ path: dir, package: <parsed json>, isProjectRoot: true, edgesOut: new Map() }`, and calls `npm-packlist` on it. File selection therefore follows npm rules: the `files` field, `.npmignore`, `.gitignore` fallback, and always-included files such as `package.json`. `edgesOut` is empty, so bundled dependencies are not discovered from the dependency graph.
4. Calls `tar.create` with the file list, each entry prefixed with `./` so node-tar does not treat a leading `@` specially. Tar options: `file` is `<scratch>/<basename(target)>`, `cwd: dir`, `prefix: "package/"`, `portable: true`, `gzip: true`, `mtime` fixed to `1985-10-26T08:15:00.000Z`. Entries land under `package/` in the archive. Output is deterministic for the same file content.
5. Renames the scratch tarball to `target` with `fs.rename`, then removes the scratch dir (`withTmp` cleans up on success and on failure).

Side effects on disk: creates `<tmpDir>`, `<tmpDir>/tmp` and a scratch dir under it (scratch dir removed afterwards, the parent dirs remain), and writes `target`. Reads `dir` files. Nothing inside `dir` is modified.

Errors (all as promise rejections, never sync throws):

- Missing or unreadable `<dir>/package.json`: the `fs` error (`ENOENT` and so on).
- Invalid JSON: `SyntaxError` from `JSON.parse`.
- `npm-packlist`, `tar` or cacache failures: passed through.
- `fs.rename` failure, including `EXDEV` when `tmpDir` and `target` are on different filesystems (no copy fallback), or a missing parent directory of `target`.

## `depDirPacker(manifest, dir)`

```ts
depDirPacker(manifest: Manifest, dir: string): PassThrough
```

The pacote `dirPacker` implementation. It returns a `PassThrough` stream right away and does the work asynchronously. The stream carries the gzipped tarball bytes.

Sequence:

1. Reads `<dir>/package.json`.
2. If `pkg.scripts && pkg.scripts.prepare` is truthy, awaits `installDependencies(dir, message)` where `message` is `` `preparing gitdep package ${pkg.name} from ${manifest._resolved}` ``. With no `name` or `_resolved` the text contains `undefined`. An empty-string `prepare` counts as absent.
3. Emits the custom event `"prepared"` on the stream. This happens whether or not a prepare script existed or `installDependencies` was called.
4. Creates a scratch dir `<tmpDir>/tmp/pacote-packing<random>`, calls `packDirectory(manifest, dir, <scratch>/package.tgz)`, then pipes that file into the stream with `stream/promises.pipeline` (this ends the stream when the file is fully read).
5. Any failure in steps 1 to 4 is caught and reported with `stream.emit("error", err)`.

Events and consumption:

- `"prepared"`: emitted once, after dependencies are installed (if needed) and before packing starts. It carries no arguments. Attach the listener synchronously after the call, as the first await boundary is reading `package.json`.
- `"error"`: emitted for read, parse, install, pack and pipe failures. Attach an `"error"` listener, or Node throws on an unhandled `"error"` event.
- Data and `"end"`: the normal stream events after packing succeeds. No bytes are written before the tarball is fully built, so nothing streams until packing completes.
- The scratch dir is removed when the pipeline finishes or fails.

Side effects on disk: whatever `installDependencies` does in `dir` (typically creates `node_modules` and build output there), plus the scratch dirs described above. Because the install runs before `packDirectory`, files created by the prepare script are packed if packlist selects them.

Quirks:

- The error is emitted with `emit`, not `destroy`. If the failure came from `pipeline`, `pipeline` has already destroyed the stream with that error, so listeners can see the error and the stream can already be closed.
- The `installDependencies` return value is ignored. The callback's own failure is the only signal.
- `"prepared"` is emitted before packing, so a `"prepared"` event does not mean packing succeeded.

## `getDirPackerCb()`

```ts
getDirPackerCb(): (manifest: Manifest, dir: string) => PassThrough
```

Returns `(m, d) => this.depDirPacker(m, d)`. The arrow keeps `this` bound, so the result can be passed detached, for example as the `dirPacker` option of `pacote`. Each call returns a new closure. It has no side effects.

```js
const preper = new PkgPreper({ tmpDir, installDependencies });
await pacote.tarball(spec, { dirPacker: preper.getDirPackerCb() });
```
