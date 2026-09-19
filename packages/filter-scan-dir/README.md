# filter-scan-dir

[![License][license-image]][license-url]
[![build][build-image]][build-url]

[![Downloads][downloads-image]][downloads-url]

[![npm badge][npm-badge-png]][package-url]

Recursively scan and filter directory for a flat array of files.

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
| `filterExt` | Include only matching extensions. |
| `ignoreExt` | Exclude matching extensions. |
| `filter` | Decide whether to include each file. |
| `filterDir` | Skip directories before scanning their children. |

Callbacks receive `(name, relativeDir, extras)`.
Return `true` to accept an entry or `false` to skip it.
Directories enter the output only with `includeDir: true`.
Return `{ stop: true }` to stop the scan.
With `grouping: true`, return a string to choose a result group.

# Performance

`fullStat: false` was **2.3× faster on fynmesh** than full-stat mode in our warm-cache tests.
It was **8.1× faster on the 1,000 × 1,000 synthetic tree**.
Use it when names and entry types are enough:

```ts
const files = await filterScanDir({ cwd: "src", fullStat: false });
```

Filter callbacks receive `Dirent` objects instead of `Stats` objects.
Sizes, timestamps, and permissions are unavailable.
This avoids an `lstat` call for every file and directory entry.

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
  filterDir: (name) => name !== "node_modules" && name !== ".git",
});
```

- `filterDir` can skip entire subtrees.
- `filterExt` still reads every visited directory. It does not avoid stats in full-stat mode.
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
| fynmesh with installed dependencies: 48,347 directories | 292,242 | 949 ms | 2,157 ms |

The fynmesh scan included `node_modules` and `.git`.
Its directory count includes the root.

# License

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
