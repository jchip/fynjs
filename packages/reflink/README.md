# @fynjs/reflink

Native copy-on-write file cloning for Node.js, built with [napi-rs].

fyn uses it to replicate packages from its central store into `node_modules`. A clone
shares disk blocks with its source until either side is written, so it costs almost no
space or time.

## Usage

```js
import { cloneFile, cloneFiles, cloneDir } from "@fynjs/reflink";

// one file
const cloned = await cloneFile("/store/pkg/index.js", "/app/node_modules/pkg/index.js");

// many files, in parallel
const stats = await cloneFiles("/store/pkg", "/app/node_modules/pkg", [
  "package.json",
  "lib/index.js"
]);
// => { cloned: 2, linked: 0, copied: 0 }

// a whole directory in one call (APFS only)
if (!(await cloneDir("/store/pkg", "/app/node_modules/pkg"))) {
  // fall back to cloneFiles
}
```

## How files are placed

Each file goes through these steps until one works:

1. Remove the destination.
2. Try a copy-on-write clone.
3. Hardlink, if the caller passed `hardlink: true`.
4. Copy, unless the caller passed `copyFallback: false`.

Removing first matters. A clone or copy writes through an existing destination, which
would corrupt any other path hardlinked to the same file.

## API

### `cloneFile(src, dest)` / `cloneFileSync(src, dest)`

Clone `src` to `dest`, replacing `dest`. Falls back to a copy. Returns `true` if the file
was cloned. The async version runs on the libuv thread pool.

### `cloneFiles(srcDir, destDir, files, hardlink?, copyFallback?)` / `cloneFilesSync(...)`

Clone `files`, given as paths relative to `srcDir`, into `destDir` in parallel. Parent
directories are created as needed. It fails on the first error.

- `hardlink` (default `false`): hardlink a file that can't be cloned.
- `copyFallback` (default `true`): set to `false` to fail instead of copying.

Returns a `CloneStats` object: `{ cloned, linked, copied }`. The async version runs on a
dedicated pool of up to 4 threads, so it doesn't compete with Node's own fs calls.

### `cloneDir(src, dest)`

Clone the directory `src` to `dest` with a single `clonefile(2)` call. `dest` must not
exist, but its parent must. Resolves `false` on anything other than APFS, so the caller
can fall back to `cloneFiles`.

## Platforms

Prebuilt binaries ship as separate platform packages for macOS, Linux (glibc and musl),
and Windows, on x64 and arm64.

Clones work on filesystems that support them, such as APFS, Btrfs, XFS, and ReFS.
Elsewhere, files are hardlinked or copied as described above.

## Building from source

Inside the fynjs monorepo, the native module builds on install when `cargo` is
available. Without Rust, the build is skipped and fyn uses its JS clone path instead.

```sh
fyn run build        # release build
fyn run build:debug  # debug build
fyn test
```

## License

Apache-2.0

[napi-rs]: https://napi.rs
