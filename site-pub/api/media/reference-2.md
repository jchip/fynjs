# @fynjs/reflink reference

`@fynjs/reflink` is a native Node addon (Rust, napi-rs) that places files with copy-on-write clones. fyn uses it to replicate packages from its store into `node_modules`. ESM only (`"type": "module"`). Requires Node `^22.22.2 || ^24.15.0 || >=26.0.0` (`engines`).

## Imports

```js
import { cloneFile, cloneFileSync, cloneFiles, cloneFilesSync, cloneDir } from "@fynjs/reflink";
import * as reflink from "@fynjs/reflink";
```

All exports are named exports from the package root. There is no default export. Subpaths: only `@fynjs/reflink/package.json`.

Runtime exports: `cloneFile`, `cloneFileSync`, `cloneFiles`, `cloneFilesSync`, `cloneDir`, `__napiBindingTarget`.

Type-only export: `CloneStats`.

There is no `cloneDirSync`. `__napiBindingTarget` is loader metadata, see "Binary selection".

Importing the package loads the native binding at import time. If no binding can be loaded, the import throws (see "Binary selection").

## Placement algorithm

Used by `cloneFile`, `cloneFileSync`, `cloneFiles` and `cloneFilesSync`. Per file, in order:

1. Remove `dest` (`fs::remove_file`). `NotFound` is ignored. Any other error is returned (for example removing a directory fails).
2. Try a reflink (crate `reflink-copy` 0.1.30, see "Platform mechanisms"). This step is skipped only when copy fallback is on and an earlier reflink in the same call already failed (see below).
3. If hardlink is on, `fs::hard_link(src, dest)`. A hardlink failure is swallowed, and placement continues.
4. If copy fallback is on, `fs::copy(src, dest)`. Otherwise the reflink error is returned.

Step 1 exists because clone and copy write through an existing destination, which would corrupt other paths hardlinked to the same inode. Each placement result is one of cloned, linked or copied.

Per-call "reflink disabled" flag: the first failed reflink in a call clears a shared flag. With copy fallback on, later files in that call skip the reflink attempt and go to hardlink or copy. With copy fallback off, every file still tries the reflink. The flag lives for one call only. It is not shared across calls.

Source symlinks: `reflink-copy` on macOS calls `clonefile` without `CLONE_NOFOLLOW` for files, so a symlink `src` is followed and `dest` becomes a regular file (observed on macOS). The same call falls back to `fs::copy`, which also follows symlinks.

## `cloneFileSync(src, dest)` and `cloneFile(src, dest)`

```ts
function cloneFileSync(src: string, dest: string): boolean
function cloneFile(src: string, dest: string): Promise<boolean>
```

Places one file with hardlink off and copy fallback on. Returns `true` when the file was cloned, `false` when it was copied.

- `dest` is removed first, then replaced.
- The parent directory of `dest` is not created. A missing parent fails with `No such file or directory (os error 2)`.
- `cloneFile` runs on the libuv thread pool (`AsyncTask`). `cloneFileSync` blocks the calling thread.
- Throws or rejects with a `GenericFailure` error on failure (see "Errors").
- Passing a non-string argument throws `StringExpected`.
- When `src` and `dest` are the same path, `dest` (which is `src`) is removed first, then the clone fails, so the source file is deleted. Observed: `cloneFile(p, p)` rejects with ENOENT and `p` no longer exists.
- On macOS a directory `src` is cloned as a tree by `clonefile`, and the call returns `true` (observed). On Linux and Windows a non-regular-file `src` fails the reflink with `InvalidInput` ("the source path is not an existing regular file"), then falls back to `fs::copy`, which also fails.

## `cloneFilesSync(...)` and `cloneFiles(...)`

```ts
function cloneFilesSync(
  srcDir: string,
  destDir: string,
  files: Array<string>,
  hardlink?: boolean | null,
  copyFallback?: boolean | null
): CloneStats

function cloneFiles(
  srcDir: string,
  destDir: string,
  files: Array<string>,
  hardlink?: boolean | null,
  copyFallback?: boolean | null
): Promise<CloneStats>

interface CloneStats {
  cloned: number;  // placed with a copy-on-write clone
  linked: number;  // hardlinked because a clone was not possible
  copied: number;  // fell back to a full copy
}
```

Places each entry of `files` from `srcDir/<file>` to `destDir/<file>`, in parallel.

| argument | type | default | behavior |
| --- | --- | --- | --- |
| `srcDir` | `string` | required | Base directory for sources. |
| `destDir` | `string` | required | Base directory for destinations. |
| `files` | `string[]` | required | Paths relative to both directories, joined with `Path::join`. An empty array returns `{cloned:0, linked:0, copied:0}` and creates nothing. |
| `hardlink` | `boolean \| null \| undefined` | `false` | Hardlink a file that could not be cloned. Positional argument, not an option object. `null` and `undefined` both mean `false`. |
| `copyFallback` | `boolean \| null \| undefined` | `true` | `false` makes a file that cannot be cloned or hardlinked fail with the reflink error instead of copying. `null` and `undefined` both mean `true`. |

Behavior:

- Parent directories of every destination are collected into a set and created with `create_dir_all` before any file is placed. This phase is sequential. If it fails, the error names only the directory (`mkdir <dir>`).
- Placement then runs in parallel on a pool owned by the addon (rayon). Pool size is `min(available_parallelism, 4)`, threads named `reflink-<i>`. The pool is created lazily on first use and lives for the process.
- Fails on the first error. Files already placed before the failure are left in place. The returned error is the first one the parallel reduction surfaces. Which file reports first is not deterministic.
- The three counters sum to `files.length` on success.
- `cloneFilesSync` blocks the calling thread until the pool finishes (`pool.install`). `cloneFiles` returns a promise, uses the same pool (`pool.spawn`) and never occupies a libuv thread.
- Non-array `files` throws `ArrayExpected`. Non-string elements or arguments throw a conversion error such as `StringExpected`.
- Mode: on Linux the crate copies the source permissions to the new file. On macOS `clonefile` keeps the mode (the test suite checks `0o755` survives for `cloneFile` and `cloneDir`).

Path safety: entries are joined without any check. An absolute entry, or one containing `..`, can resolve `dest` outside `destDir`, including onto the source file itself. Step 1 of the placement algorithm then deletes that file. Pass only trusted, normalized relative paths.

Duplicate entries in `files` are placed concurrently onto the same destination. The call can succeed, with an unreliable cloned versus copied split (observed with 8 copies of the same name: `{cloned:1, copied:7}`).

## `cloneDir(src, dest)`

```ts
function cloneDir(src: string, dest: string): Promise<boolean>
```

Clones the directory `src` to `dest` with one `clonefile(2)` call. APFS clones the tree in the kernel, so there are no per-file syscalls. Async only. Runs on the addon pool.

- macOS: calls `clonefile(src, dest, CLONE_NOFOLLOW)` (flag `0x0001`, defined locally). The flag means a symlink passed as `src` is itself cloned, not followed.
- `dest` must not exist and its parent must exist. Nothing is created or removed for you.
- Resolves `true` when cloned.
- Resolves `false` when `clonefile` fails with `ENOTSUP` or `EXDEV` (a filesystem that cannot clone, or `src` and `dest` on different volumes). No fallback is done here. The caller should fall back to `cloneFiles`.
- Any other `clonefile` error rejects. Examples observed: `dest` exists gives `File exists (os error 17)`, missing `src` or missing parent of `dest` gives `No such file or directory (os error 2)`. A `src` that is a regular file is cloned, since `clonefile` accepts files.
- A path containing a NUL byte rejects with `file name contained an unexpected NUL byte`.
- Linux and Windows: the function body is a stub. It always resolves `false` without touching the filesystem and without validating arguments.
- Does not use hardlinks or copy, and returns no `CloneStats`.

```js
if (!(await cloneDir(storeDir, destDir))) {
  await cloneFiles(storeDir, destDir, relativeFiles);
}
```

## `__napiBindingTarget`

```ts
const __napiBindingTarget: 'native' | 'wasm32-wasi' | 'wasm32-wasip1'
```

Reports which artifact the loader loaded. `'native'` for a native `.node` addon, otherwise the WASI flavor. This package builds no WASI artifact (`napi.targets` has none), so it is `'native'` in normal use.

## Errors

Every failure from the Rust side is a Node `Error` with `code` `GenericFailure`. The message is built as:

```
<io error text>: <target> (<errno or ErrorKind>)
```

- `<target>` is `src -> dest` for placement and `cloneDir`, or `mkdir <dir>` for the parent-creation phase of `cloneFiles` and `cloneFilesSync`.
- `<errno or ErrorKind>` is the raw OS error number when there is one, otherwise the Rust `ErrorKind` name, for example `InvalidInput`.
- Example: `No such file or directory (os error 2): /a/src -> /a/dest (2)`.

Argument type errors have their own codes (`StringExpected`, `ArrayExpected`).

When cloning is unsupported or fails on a file:

| call | result |
| --- | --- |
| `cloneFile`, `cloneFileSync` | Silent copy fallback. Return value `false`. Error only if the copy fails too. |
| `cloneFiles`, `cloneFilesSync`, copy fallback on (default) | Hardlink if `hardlink`, else copy. Counted in `linked` or `copied`. No error. |
| `cloneFiles`, `cloneFilesSync`, `copyFallback: false` | The reflink error is thrown (or the call rejects) for the first file that cannot be cloned or hardlinked. |
| `cloneDir` on macOS | Resolves `false` for `ENOTSUP` or `EXDEV`, rejects otherwise. |
| `cloneDir` off macOS | Always resolves `false`. |

A missing `src` is not reported as a clone failure. It is a copy failure (`ENOENT`) when copy fallback is on, or the reflink `ENOENT` when it is off.

## Platform mechanisms

The file clone is `reflink_copy::reflink` from crate `reflink-copy` 0.1.30 (`Cargo.lock`). The `src` and `dest` filesystem must support block sharing, and both must normally be on the same filesystem.

| OS | Mechanism | Filesystems | Notes |
| --- | --- | --- | --- |
| macOS | `clonefile(2)` with `CLONE_NOOWNERCOPY` | APFS | Directories and symlinks are accepted by `clonefile`. Fails with ENOTSUP on non-APFS volumes. Works as `cloneDir` with `CLONE_NOFOLLOW`. |
| Linux (and Android) | `ioctl(FICLONE)` through `rustix::fs::ioctl_ficlone` | Btrfs, XFS (with reflink), others that implement FICLONE | The crate opens `src`, creates `dest` with `O_EXCL` (`create_new`), clones, then copies the source permissions. On failure `dest` is removed. Not atomic. |
| Windows | `FSCTL_DUPLICATE_EXTENTS_TO_FILE` | ReFS (Windows Server, Dev Drive) | The crate creates `dest` with `create_new`, marks it sparse, and requires the source cluster size to be 4K or 64K. The crate documents this path as untested and possibly buggy. Not atomic. |
| other | not supported (`ErrorKind::Unsupported`) | none | Falls back as described in "Errors". |

On Linux and Windows the crate maps any reflink failure on a non-regular-file `src` to an `InvalidInput` error with the message "the source path is not an existing regular file: ...".

`dest` is created with `O_EXCL` semantics on all three platforms, which is why placement removes `dest` first.

The Rust crate pulls `libc` on unix only, used for `clonefile` in `cloneDir`.

## Binary selection

`index.js` is the napi-rs generated loader. It runs at import time. Order of work:

1. If env `NAPI_RS_FORCE_WASI` is `true` or `error`, or `NAPI_RS_WASI_FLAVOR` is non-empty, the WASI chain is tried (`./reflink.wasi.cjs`, then package `@fynjs/reflink-wasm32-wasi`). `NAPI_RS_WASI_FLAVOR` must be `wasm32-wasi` or the import throws. With `NAPI_RS_FORCE_WASI=error` or a flavor set, a missing WASI binding throws and no native fallback is tried. This package ships no WASI artifact.
2. Otherwise `requireNative()` runs. If env `NAPI_RS_NATIVE_LIBRARY_PATH` is set, only that path is required, and no platform lookup happens.
3. Otherwise the loader picks by `process.platform` and `process.arch`. For each target it first tries a local file `./reflink.<platform>-<arch>[-<abi>].node` next to `index.js`, then the package `@fynjs/reflink-<platform>-<arch>[-<abi>]`.
4. A package version other than the loader's own (`0.1.0`) throws only when env `NAPI_RS_ENFORCE_VERSION_CHECK` is set and not `0`.
5. If nothing loads, the import throws `Cannot find native binding. npm has a bug related to optional dependencies ...`, with `cause` set to a chain of the individual load errors. An unsupported OS or arch adds `Unsupported OS: <platform>, architecture: <arch>` to that chain.

Targets this package builds (`napi.targets`) and the matching platform packages:

| platform / arch | local file and package suffix |
| --- | --- |
| macOS x64 | `darwin-x64` |
| macOS arm64 | `darwin-arm64` |
| Linux x64 glibc | `linux-x64-gnu` |
| Linux arm64 glibc | `linux-arm64-gnu` |
| Linux x64 musl | `linux-x64-musl` |
| Linux arm64 musl | `linux-arm64-musl` |
| Windows x64 | `win32-x64-msvc` |
| Windows arm64 | `win32-arm64-msvc` |

Selection details:

- macOS tries `darwin-universal` first, then the arch specific one.
- Linux picks `-musl` or `-gnu` with `isMusl()`: reads `/usr/bin/ldd` for `musl`, else `process.report` (glibc runtime version or musl shared objects), else runs `ldd --version`.
- Windows x64 picks `win32-x64-gnu` instead of `-msvc` when Node reports `shlib_suffix === 'dll.a'` or `node_target_type === 'shared_library'`. No `-gnu` binary is built by this package.
- The loader also has branches for targets this package does not build (android, freebsd, win32-ia32, linux arm, loong64, riscv64, ppc64, s390x, openharmony). Those would only load if a binary or package of that name existed.
- In the monorepo, `prepare.mjs` builds the addon with `napi build --platform --release --esm` when `cargo` exists, producing `reflink.<platform>-<arch>.node` in the package directory. Without `cargo`, the build is skipped, no binary exists, and importing the package throws. Consumers (fyn) must handle that import failure themselves.
- The `files` list in `package.json` includes `reflink.*.node` for local packing. Under `npm pack` or `npm publish` (detected by `npm_command`), `prepack.mjs` removes the `.node` entries from `files` and adds `optionalDependencies` on `@fynjs/reflink-<platformArchABI>` for every target, at the package version. A published install therefore gets the binary from the matching platform package.

## Native threading

- `cloneFile` uses the libuv thread pool.
- `cloneFiles` and `cloneDir` use the addon's own rayon pool, capped at 4 threads (more threads slow APFS down from directory contention, per the source comment).
- `cloneFilesSync` blocks the JS thread while the same pool works.
