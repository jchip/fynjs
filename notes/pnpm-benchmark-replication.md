# Replicating pnpm's install benchmark (2026-09-24)

pnpm.io/benchmarks says a clean install of its `alotta-files` fixture takes npm 45.5s and pnpm 12
4.39s. That is a 10x gap on work that is mostly network. We ran pnpm's own harness locally, added
fyn, and varied the network link to see where the gap comes from.

**Short version.** The rig is honest, but its 50 ms round trip amplifies npm's serial requests. At a
realistic 15 ms, npm vs pnpm 11 is 1.5x. pnpm 12's published cold-install numbers did not reproduce
on this Mac, because its store writes every file twice on APFS. fyn in copy mode is the fastest clean
install here at 15 ms. fyn's current numbers, which beat pnpm 12 on every row but repeat, are in
[fyn-install-perf.md](fyn-install-perf.md).

## Setup

- Harness: `pnpm/benchmarks` at `b3f578f`, with local edits in
  [pnpm-benchmark-harness.patch](pnpm-benchmark-harness.patch).
- Machine: Apple M4 Pro, 14 cores, 24 GB, macOS on APFS. Node 24.19.0 (pinned by the harness).
- Fixture: `alotta-files` only, about 1.46k packages and 290-310 MB of `node_modules`.
- Managers: npm 12.1.0, pnpm 11.27.1, pnpm 12.6.0, and fyn 3.1.10 from the working tree.
- Registry: every manager installs from the same local pnpr registry behind `latencyProxy.js`. The
  proxy paces the whole link (not per connection) and models TCP slow start.
- Flags: npm gets `--no-audit --no-fund --ignore-scripts --legacy-peer-deps`. fyn gets
  `--script-policy=off --no-audit --progress=none`. Every cache is pinned inside the fixture's
  `cache/` dir, so the "clean" rows start cold.

## Results

Times in seconds. Most cells are one sample. A second full run at 50 ms matched the first within
about 5%, except pnpm 12's clean install, which ranged 13.5-16.5s across three runs.

**Clean install (no cache, no lockfile, no `node_modules`)**

| Link | npm | pnpm 11 | pnpm 12 | fyn, 15 sockets | fyn, 64 sockets |
|---|---|---|---|---|---|
| published * (CI, 50 ms / 200 Mbps) | 45.5 | 8.17 | 4.39 | - | - |
| 50 ms / 200 Mbps | 32.6 | 9.79 | 13.5 | 12.6 | **8.06** |
| 15 ms / 200 Mbps | 14.1 | 9.17 | 15.4 | **8.01** | 8.60 |
| 15 ms / 50 Mbps | 25.1 | 17.4 | 20.5 | 16.8 | 17.1 |

\* pnpm.io's own published number, not a local run. fyn was never in that benchmark, hence the `-`.

**All scenarios at 15 ms / 200 Mbps**

| Scenario | npm | pnpm 11 | pnpm 12 | fyn |
|---|---|---|---|---|
| clean | 14.1 | 9.17 | 15.4 | 8.01 |
| lockfile | 5.20 | 8.54 | 13.9 | 6.08 |
| cache | 6.46 | 5.93 | 2.52 | 5.56 |
| cache + lockfile | 4.54 | 5.10 | 2.10 | 4.60 |
| repeat (all warm) | 0.83 | 0.31 | 0.04 | 0.34 |
| update | 2.55 | 2.24 | 1.51 | 2.10 |

**All scenarios at 50 ms / 200 Mbps**

| Scenario | npm | pnpm 11 | pnpm 12 | fyn, 15 sockets | fyn, 64 sockets |
|---|---|---|---|---|---|
| clean | 32.6 | 9.79 | 13.5 | 12.6 | 8.06 |
| lockfile | 8.11 | 8.58 | 14.1 | 7.64 | 5.44 |
| cache | 6.50 | 5.83 | 2.44 | 5.51 | 5.53 |
| cache + lockfile | 4.54 | 4.97 | 2.27 | 4.39 | 4.71 |
| repeat (all warm) | 0.82 | 0.29 | 0.04 | 0.35 | 0.34 |
| update | 2.74 | 2.21 | 1.66 | 2.38 | 2.21 |

fyn's repeat rows in both tables predate a fix to its change check, which was walking the harness's
in-project cache. fyn's repeat install is now 0.15s at both latencies.

## What the benchmark shows, and what it doesn't

- **The 50 ms link is the headline's lever.** npm dropped from 32.6s to 14.1s when the round trip went
  from 50 ms to 15 ms. That is about 530 round trips on its critical path. pnpm 11 barely moved
  (9.79s to 9.17s), because it downloads tarballs while resolution is still running.
- **At low bandwidth everyone converges.** At 50 Mbps all managers are bandwidth-bound, and npm vs
  pnpm 11 is 1.44x.
- **The page only shows npm next to pnpm.** The harness also measures Yarn and Bun, but pnpm.io leaves
  them off. pnpm's own README claims only "up to 2x faster than npm and Yarn classic."
- **pnpm 12's cold installs did not reproduce on macOS, and we measured why.** Every row that downloads
  tarballs took 13-16s here, at any latency. Its warm-cache rows really are fast (about 2.1-2.5s).
  See "Why pnpm 12's cold installs are slow on macOS" below.
- **The harness's "no lockfile, warm `node_modules`" rows test nothing.** npm keeps
  `node_modules/.package-lock.json` and pnpm keeps `node_modules/.pnpm/lock.yaml`, so for them the
  lockfile never went away. pnpm.io does not publish those rows. We decided the real "warm tree, no
  lock data at all" case is too rare to optimize for.
- **pnpm 12's warm rows skip the install entirely.** `node_modules/.pnpm-workspace-state-v1.json`
  holds a `lastValidatedTimestamp`. If `package.json` hasn't changed since then, pnpm 12 prints
  "Already up to date" in a few ms, even when both lockfiles were deleted. It does not recreate them.
  So "everything warm: 15ms" measures a timestamp check, not an install.

## Why pnpm 12's cold installs are slow on macOS

We timestamped each install and counted requests in pnpr's access log. The fixture's tarballs hold
about 42k files, 79 MB compressed, which is about 3.2s of link time at 200 Mbps.

| pnpm 12 at 50 ms | clone (default) | copy | packuments | tarballs |
|---|---|---|---|---|
| clean | 16.5 | 11.7 | 1,149 | 1,345 |
| lockfile | 14.1 | 11.2 | 0 | 1,345 |
| cache + lockfile | 2.17 | 5.74 | 0 | 0 |
| cache | 2.76 | 6.44 | 0 | 0 |

- **The network is not the problem.** `trustLockfile` is honored: the lockfile row fetches zero
  packuments. Resolution adds only about 2.4s. npm and fyn fetch the same 1,345 tarballs in 5.4-8.6s.
- **Every file is written twice.** A cold install writes each file into the content-addressed store,
  then again into the virtual store. npm and fyn write each file once. One pass of 42k files costs about
  4.5-5.7s on this Mac, so two passes cost about 11s. That is the copy-mode number.
- **Per-file clones make the second pass slower, not faster.** The default clones each file into the
  virtual store, which cost about 3s more than plain copies. That fits pnpm's note that APFS caps
  per-file `clonefile` near 6k files/s.
- **Warm installs flip it.** With the store built, clone mode is one directory `clonefile` per package
  (2.2s). Copy mode rewrites all 42k files (5.7s).
- **On Linux the second pass is nearly free.** pnpm hardlinks first there, which is why the published CI
  numbers look so much better.

## How pnpm gets its speed

- **High network concurrency.** The source uses `clamp(workers * 3, 64, 96)` in both pnpm 11 and 12,
  which is 64 on this machine. The docs still say 16-64. `maxsockets` defaults to 3x that.
- **No hardlinks on macOS.** `packageImportMethod: auto` tries clone, then hardlink, then copy on macOS.
  Linux goes hardlink first. We confirmed it: pnpm's files in `node_modules` have link count 1 and
  a different inode from the store.
- **Native clones.** pnpm 11 clones file by file through the `@reflink/reflink` native addon, not
  Node's `fs`. pnpm 12 (Rust) clones a whole package directory with one `clonefile(2)` call
  (`crates/deps-restorer/src/dir_clone_cache.rs`).
- **APFS facts from pnpm's source.** Per-file `clonefile` tops out around 6k files/s however many
  threads issue it. `link` scales negatively with threads (pnpm issue 14231). A directory clone is one
  syscall for the whole tree, about 20x cheaper. Apple's man page discourages cloning directories and
  recommends `copyfile(3)`, which clones file by file.

## fyn's socket count

**`--concurrency` sets the registry socket pool.** fyn passes it through to pacote as `maxSockets`.
A bug had kept it from reaching pacote at all; fixing that is what let more sockets help.

**The default is 32.** It recovers most of 64's gain on a slow link and costs nothing on a fast one.
Seconds, one sample per cell, from a late-September build:

| Copy | 15 ms clean | lockfile | cache | cache + lockfile | 50 ms clean | lockfile | cache | cache + lockfile |
|---|---|---|---|---|---|---|---|---|
| 15 sockets | 7.74 | 5.16 | 5.46 | 4.27 | 13.00 | 8.08 | 5.36 | 5.43 |
| **32 sockets** | **7.15** | 5.24 | 5.37 | 4.34 | 8.46 | 5.34 | 5.42 | 4.36 |
| 64 sockets | 7.20 | 5.45 | 5.67 | 4.63 | **7.92** | 5.29 | 5.38 | 4.43 |

| Clone only | 15 ms clean | lockfile | cache | cache + lockfile | 50 ms clean | lockfile | cache | cache + lockfile |
|---|---|---|---|---|---|---|---|---|
| 15 sockets | 9.35 | 7.12 | 2.63 | 1.66 | 12.75 | 7.73 | 2.58 | 1.65 |
| **32 sockets** | 9.13 | 7.05 | 2.79 | 1.68 | 10.44 | 7.29 | 2.85 | 1.77 |
| 64 sockets | **8.89** | 7.25 | 2.65 | 1.68 | **9.73** | 7.70 | 2.70 | 1.79 |

- **At 50 ms, 32 gets most of 64's gain** on clean installs: about 90% for copy (13.0s → 8.46s) and
  about three quarters for clone only (12.75s → 10.44s).
- **At 15 ms, 32 costs nothing.** Every row is within noise of 15 sockets or better. 64 was slightly
  worse there on copy's lockfile and warm-cache rows.
- **64 stays an opt-in** for high-latency links. pnpm uses 64, and npm uses 15.

**Benchmarking fyn needs `--no-audit`.** Audit is on by default, like npm. The harness disables it for
npm, so fyn needs the same flag to be comparable.

## Reproducing

1. Build fyn: `fyn run build` in `packages/fyn`. The harness runs `packages/fyn/bin/fyn.mjs` through a
   shim. Set `LOCAL_FYN_BIN` to point elsewhere.
2. Clone `pnpm/benchmarks`, check out `b3f578f`, and apply the patch.
3. Move `results/` aside and create an empty one. The published number is the minimum of all recorded
   samples, so upstream CI samples would mix with local ones.
4. Run `pnpm install`, then `pnpm run benchmark`. Knobs:
   - `BENCH_RTT_MS` (default 50) and `BENCH_MBPS` (default 200) set the link.
   - `BENCH_ONLY=fyn,fyn_cc64` limits which managers run. Keys: `npm`, `pnpm11`, `pnpm12`,
     `pnpm12_copy` (pnpm 12 with `packageImportMethod: copy`), `fyn`, `fyn_cc32`, `fyn_cc64`,
     `fyn_afd` (`--always-fetch-dist`), `fyn_central`, `fyn_central_hardlink` (hardlink only),
     `fyn_central_clone` (clone only), `fyn_central_clone_cc32`, `fyn_central_clone_cc64`,
     `fyn_central_clone_afd`, and `fyn_default` (no store setting, so fyn picks its platform
     default). Rows without a socket count use fyn's default, now 32.
5. To see what each install fetched, run `node count-requests.mjs <run log> <pnpr.log>`. The script is
   in the patch. The run log carries `# t-start`/`# t-end` stamps, and pnpr's log lives under the run's
   temp dir at `pnpr/server/pnpr.log`.
6. Samples land in `results/<manager>/<version>/alotta-files-pnpr.yaml`, and the summary in
   `local-results.json`. Each manager takes a few minutes: 3 untimed warm-ups, the timed scenarios, a
   re-warm, and the update row.
