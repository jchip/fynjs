# V8 startup snapshot for fyn (2026-10-03, parked)

fyn's repeat install is mostly startup. We tried a V8 startup snapshot to skip loading the bundle.
It works and saves about 35 ms, but only when node starts with `--snapshot-blob`, and shipping it
has open blockers. The work is parked. The cheaper wins found on the way are listed at the end.

## Where startup time goes

Repeat install on alotta-files, copy mode, main build. Minimum of 20-30 interleaved runs.

| Step | ms |
|---|---|
| bare `node -e 0` | 27 |
| import the bundle, run nothing | 82 |
| full repeat install | 125 |

Loading the 4 MB bundle costs about 56 ms on top of bare node, even with the compile cache. About
34 ms is the bundle's own module init, spread over many small modules. About 29 ms is node loading
builtins that the bundle pulls in.

## Results

| Launch | ms |
|---|---|
| current ESM bin | 125 |
| snapshot, `node --snapshot-blob` directly | 89.5 |
| snapshot via a `#!/bin/sh` exec launcher | 98 |
| snapshot via a node relauncher | 118 |

The snapshot replaces most of the bundle load. An npm bin starts as `#!/usr/bin/env node` and can't
pass `--snapshot-blob`. Relaunching node costs about 29 ms, which erases the gain. A sh launcher
keeps about 27 ms of it, but doesn't work on Windows. A SEA binary avoids the launcher but means
shipping a node binary per platform.

## What it took to build

- **A CJS bundle.** Node 24 only snapshots a CJS entry script, which may only `require` builtins.
  `import()` fails inside a snapshot, both at build time and after restore. rolldown builds fyn as
  CJS without trouble. chalker no longer uses top-level await, so that old blocker is gone.
- **An `import.meta` stand-in.** CJS output replaces `import.meta` with `{}`. Its one use is
  `@fynpo/base` passing it to optional-import. The stand-in must act like the real
  `import.meta.resolve`, including the `ERR_MODULE_NOT_FOUND` code.
- **No unserializable objects at load.** V8 aborts with "CheckGlobalAndEternalHandles failed" (or
  hangs) on any of these. Each one found in fyn had to become lazy:
  - `tls`, even just required. `https` pulls it in, and so does a `tls` import that rolldown hoists
    from http-proxy-agent.
  - `Intl` objects. string-width, wrap-ansi and slice-ansi each create an `Intl.Segmenter` at load.
  - Signal handlers. The `lockfile` package calls signal-exit at load, and `lib/util/base-util.ts`
    imports it eagerly.
  - Also unsafe, but not found at load: crypto hash objects and zlib streams.
- **A `dist`-like location.** The bundle reads `../package.json` from `__dirname` at load.

The snapshot entry also needs a stand-in `module`/`exports`, and the restored main must put a
script path back into `process.argv[1]`.

## Blockers to ship it

- **State baked in at build time.** chalk runs `isatty(1)` and reads `FORCE_COLOR`/`NO_COLOR` at
  load, so color support would be frozen when the snapshot is built. Other modules read env at load
  too, such as lockfile (`NODE_DEBUG`) and invariant (`NODE_ENV`). The whole bundle needs an audit.
- **fynpo JS/MJS config loading** uses `import()`, which can't run in a snapshot. It would need
  `require(esm)` instead.
- **The blob is tied to the exact node binary.** It is 18.6 MB and must be built per node version,
  for example lazily on first run.
- **The launcher**, as above.

## Cheaper wins found on the way

These need no snapshot. Together they could save an estimated 15-25 ms on every fyn command.

- **Hoisted builtins.** rolldown turns every builtin `require` into a top-level import, even inside
  lazy CJS wrappers. The 22 builtins at the top of the bundle cost about 21 ms together. `tls`,
  `net`, `dns`, `zlib`, `readline` and `child_process` aren't needed for a no-change install.
  `requireHttpAtRuntimePlugin` already defers `http`/`https` this way and could cover them.
- **pkg-preper imports cacache at load,** with glob behind it, for one `tmp.withTmp` call. That
  costs about 5 ms.

## Reproducing

The experiment scripts are not committed. To rebuild them:

1. Build CJS: a rolldown config that spreads `rolldown.config.mjs` with `format: "cjs"`, a
   `__fynRequire` banner, and `transform.define` mapping `import.meta` to the stand-in.
2. Make the entry: prepend the `module`/`exports` stand-in and a `process.on` wrapper that defers
   `SIG*` handlers to `v8.startupSnapshot.addDeserializeCallback`. Make `tls` and the segmenters
   lazy. Append `v8.startupSnapshot.setDeserializeMainFunction(() => run())`.
3. Build: `node --snapshot-blob fyn.blob --build-snapshot snap-entry.cjs` from a dir beside
   `packages/fyn/package.json`. Run a builder with a timeout, since a bad handle can hang it.
4. Run: `node --snapshot-blob fyn.blob install ...`. Node's own flags, like `--version`, must come
   before the blob args or node takes them.
