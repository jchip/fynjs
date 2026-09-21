# filter-scan-dir

[![License][license-image]][license-url]
[![build][build-image]][build-url]

[![Downloads][downloads-image]][downloads-url]

[![npm badge][npm-badge-png]][package-url]

Extremely fast recursive directory crawling and filtering for Node.js.
Returns a flat array of file paths.
It can scan 1 million files in about half a second with a warm OS cache and `fullStat: false`.
See [Performance](#performance) for the measured setup.

- Supports super fast concurrent mode in async version.

- **[API Docs]**
- **[Github]**

# Install

```bash
npm install --save filter-scan-dir
```

# Usage

```ts
import { filterScanDir, filterScanDirSync } from "filter-scan-dir";

// sync
console.log(filterScanDirSync({ cwd: "test" }));

// async
console.log(await filterScanDir({ cwd: "test" }));
```

- **[API Docs]**

# Filtering

| Option | Purpose |
| --- | --- |
| `ignoreDirs` | Skip exact directory basenames at every depth. Accepts a string or array. |
| `gitignore` | Caller-supplied parser for repository and nested `.gitignore` rules. Disabled when omitted. |
| `prefilter` | Reject entries before `lstat`. Requires `fullStat: true`. |
| `filterExt` | Include only matching extensions. |
| `ignoreExt` | Exclude matching extensions. |
| `filter` | Decide whether to include each file. |
| `filterDir` | Skip directories before scanning their children. |

`filter` and `filterDir` receive `(name, relativeDir, extras)`.
Return `true` to accept an entry or `false` to skip it.
Directories enter the output only with `includeDir: true`.
Return `{ stop: true }` to stop the scan.
With `grouping: true`, return a string to choose a result group.

Use `prefilter` when only some entries need full metadata:

```ts
const files = await filterScanDir({
  cwd: ".",
  fullStat: true,
  ignoreDirs: ["node_modules", ".git"],
  prefilter: (name, _dir, entry) => entry.isDirectory() || name.endsWith(".ts"),
  filter: (_name, _dir, { stat }) => stat.size < 100_000,
});
```

`prefilter` receives `(name, relativeDir, Dirent)` and runs synchronously.
Return `false` to reject an entry. Rejecting a directory skips its entire subtree.
`prefilter` with `fullStat: false` throws before scanning, regardless of `rethrowError`.

The order is `ignoreDirs`, `.gitignore` rules, `prefilter`, extension filters, `lstat`, then `filter` or `filterDir`.
Extension filters apply only to non-directory entries.
Early rejections avoid `lstat`, so rejected entries cannot report `lstat` errors.
`ignoreDirs` matches names, not paths or glob patterns. Symlinks are never followed.

Supply `gitignore: contents => ignore().add(contents)` with the caller's own `ignore` package
to read `.gitignore` files from the nearest ancestor repository
(a `.git` directory or file) through the scan root, then from each visited directory.
Without an ancestor repository, rules start at the scan root. Patterns keep their directory
scope, including anchored paths, directory-only patterns and negations. Ignored directories
are pruned before reading their metadata or children. An explicitly requested scan root
inside an ignored tree starts a fresh rule scope at the ignored ancestor, so its own files
and rules can still be scanned. `cwd` plus `prefix` determines that scan root.

This option works in sync and async scans with either `fullStat` mode. It reads rules anew
for each scan and follows the normal `rethrowError` setting for rule-file read errors.
It applies ignore patterns to all entries, including tracked files; it does not consult the
Git index, `.git/info/exclude`, or global Git excludes. `.git` is not automatically excluded;
use `ignoreDirs: ".git"` when needed. Default scans do not read ignore files.

The scanner has no parser dependency. Any parser returning a `GitignoreMatcher` can be used:
its `test(path)` method receives a POSIX path relative to that rule file, with a trailing `/`
for directories, and returns `{ ignored: boolean, unignored: boolean }`. Both values are
false when no rule matches; `unignored: true` explicitly overrides an ancestor's match.

# Performance

`fullStat: false` gets entry types from `readdir` as `Dirent` objects.
This avoids a separate `lstat` call for every file and directory entry.
In our warm-cache tests, it was **2.3× faster on the [fynmesh repo](https://www.fynmesh.win)** than `fullStat: true`.
It was **8.1× faster on the 1,000 × 1,000 synthetic tree**.

Use it when names and entry types are enough:

```ts
const files = await filterScanDir({ cwd: "src", fullStat: false });
```

Filter callbacks receive `Dirent` objects instead of `Stats` objects.
Sizes, timestamps, and permissions are unavailable.

The default concurrency is `50`.
Higher concurrency is not always faster. `concurrency: Infinity` removes the limit.
More concurrent reads can increase memory use. Benchmark your directory tree before changing it.
`filterScanDirSync` blocks the event loop.

Keep Dirent mode for filters that only need names or entry types:

```ts
const files = await filterScanDir({
  cwd: ".",
  fullStat: false,
  filterExt: [".js", ".ts"],
  ignoreDirs: ["node_modules", ".git"],
});
```

- `filterDir` can skip entire subtrees.
- Extension filters still read every visited directory. Rejected entries skip `lstat` in full-stat mode.
- Custom callbacks add work per entry.
- `sortFiles: true` adds sorting work per directory.

Use the default `fullStat: true` for full metadata.
The extra `lstat` calls can make scans much slower.
The cost is higher on cold caches or slow storage.

Scan times depend on storage, directory layout, and OS cache state.
Warm-cache measurements do not predict cold-cache performance.
Scanning lists entries without reading file contents.

## Example measurements

These are medians from seven warm-cache runs.
Both modes used concurrency `50`.
No filters or sorting were enabled. Symlinks were excluded.

Test system: Node.js 22.22.2 on macOS, Apple M4 Pro, 24 GB RAM.

| Tree | Files | Async `fullStat: false` | Async `fullStat: true` |
| --- | ---: | ---: | ---: |
| Synthetic: 1,000 directories with 1,000 empty files each | 1,000,000 | 551 ms | 4,483 ms |
| [fynmesh repo](https://www.fynmesh.win) with installed dependencies: 48,347 directories | 292,242 | 949 ms | 2,157 ms |

The fynmesh repo scan included `node_modules` and `.git`.
Its directory count includes the root.

# License

Copyright (c) 2022-2026 Joel Chen

Licensed under the [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0)

[npm-version-svg]: https://badge.fury.io/js/filter-scan-dir.svg
[package-url]: https://npmjs.com/package/filter-scan-dir
[license-image]: https://img.shields.io/npm/l/filter-scan-dir.svg
[license-url]: LICENSE
[build-image]: https://github.com/jchip/fynjs/actions/workflows/ci.yml/badge.svg
[build-url]: https://github.com/jchip/fynjs/actions/workflows/ci.yml
[downloads-image]: https://img.shields.io/npm/dm/filter-scan-dir.svg
[downloads-url]: https://npm-stat.com/charts.html?package=filter-scan-dir
[npm-badge-png]: https://nodei.co/npm/filter-scan-dir.png?downloads=true&stars=true
[api docs]: https://jchip.github.io/filter-scan-dir/modules.html#filterScanDir
[github]: https://github.com/jchip/fynjs/tree/main/packages/filter-scan-dir
