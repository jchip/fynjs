# Stale workspace manifests, and why `fynpo run` warns about them

Covers FJM-64. Explains why an installed `package.json` goes stale by design, why we detect it
rather than prevent it, and why the comparison is as narrow as it is.

## The failure

Edit a workspace package's `package.json`, then run something in a consumer without
re-bootstrapping, and the consumer keeps resolving against the *old* manifest.

This first bit us when FJM-63 moved 18 packages from `dist-cjs`/`dist-esm` to `dist`.
`packages/xarc-run/node_modules/string-array/package.json` still said
`"main": "dist-cjs/index.cjs"` while the source had moved to `./dist/index.js`. `@fynjs/run` went
from 305 passing tests to multiple suites failing on 10s and 15s timeouts.

The failures were silent. A spawned child died on an unresolvable require and the parent simply
waited for a timeout. Nothing in the output named the package, or even suggested module
resolution. `fynpo bootstrap` fixed it completely — which is exactly what makes it hard: the fix
is trivial once you know, and there is nothing pointing you there.

## Why the installed copy is a snapshot (and stays one)

fyn never keeps a link for `package.json`. It hardlinks the manifest in with the rest of the pack
tree, then immediately unlinks it and writes a fresh physical file, because it stamps `_from` and
`_id` into every installed manifest — see `_savePkgJson` in `packages/fyn/lib/pkg-installer.ts`.
The short-circuit guard above that branch can never match for a local package, since `_from`/`_id`
are added before the comparison.

So the installed manifest is a **copy by design**, refreshed only when install runs. There is no
severed link and no linking bug.

### Symlinking it instead was considered and rejected

Two reasons, both still current:

1. **The stamping blocks it.** fyn needs a writable manifest for `_from`/`_id`, and reads `_id`
   back as a staleness marker (`fyn.ts` sets `_invalid` on mismatch and triggers `moveToFv`).
   Symlinking would write those fields into the workspace source. It would first require moving
   them to the `package-fyn.json` sidecar that `fynTil.readPkgJson` already merges — the TODO in
   `pkg-installer.ts` points at this.

2. **Live propagation is the wrong goal.** Most manifest edits (`dependencies`, `version`, `bin`)
   need fyn to *do work* before a consumer can honor them. A symlink would propagate the
   declaration instantly while the installed tree stayed unchanged — a consumer reading a manifest
   that declares a dependency which was never fetched. That trades a coherent-but-stale
   `node_modules` for an incoherent one, and makes the failure *less* obvious. Only `exports`
   changes would benefit.

**Staleness is not the bug. Silence is.** So we detect and report, and change no linking behavior.

## What the detector compares

`packages/fynpo/src/utils/check-stale-local-deps.ts`, called from `Run.exec()` before dispatch —
the run is what hangs, so the warning has to come first. It warns and never fails: failing here
would block editing a manifest mid-session.

Two narrowing decisions carry the whole design.

### 1. Only locally-linked copies

A workspace package name can also resolve to a *registry* package of the same name at a different
version. In this monorepo, both cases exist:

- `bluebird` is pinned off local resolution in aveazul via `fyn.devDependencies.bluebird: false`,
  so the installed copy is the real npm bluebird
- `xarc-run` resolves `xaa@^1` from npm while the workspace holds `xaa@2.0.0`

Diffing either against the workspace source reports a large fake change. So a pair is only
compared when `dist.fullPath` matches the source dir, or `_id` carries the `-fynlocal` marker.
Measured on this monorepo: 111 linked pairs, 3 registry copies correctly skipped.

### 2. Only resolution-relevant fields

Not a full manifest diff. fyn writes a **reduced** manifest for installed packages —
`devDependencies`, `prettier` and `publishUtil` dropped, `scripts` trimmed to lifecycle entries,
`dist`/`_fyn`/`_from`/`_id` added. A full compare reports all of that as change: measured, it
flagged ~100 of 114 pairs, burying the real signal.

`RESOLUTION_FIELDS` is therefore the set a consumer actually resolves against — `main`, `module`,
`browser`, `exports`, `imports`, `types`, `typings`, `bin`, `type`, `version`, `engines`, and the
three runtime dependency maps. With both narrowings, the same scan reported exactly 2 genuinely
stale pairs and no false positives.

Results group by the stale **source** package, not by consumer: one package linked into ten
consumers is one problem with one fix, and should read as one line.

## Deliberate non-goals

- **`fynpo bootstrap` does not warn.** It is the command that fixes the condition; warning there
  is noise.
- **Not wired into fyn itself.** The symptom appears when running scripts, which is `fynpo run`.
  Detecting at install time would mean warning at the moment the problem is being resolved.
- **`files`, `sideEffects` and `scripts` are not compared.** They do not affect how a consumer
  resolves a linked local package, and `scripts` is trimmed by fyn anyway.
