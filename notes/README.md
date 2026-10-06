# notes

Design and planning documents for the fynjs monorepo. Read this first for context on what
lives here.

These are working documents, not user-facing docs. Anything user-facing belongs in a package's
own `README.md`. Stale documents move to `notes/archive/`.

## Documents

| Document | What it covers |
|---|---|
| [fynpo-package-discovery-and-jurisdiction.md](fynpo-package-discovery-and-jurisdiction.md) | How fynpo decides which packages exist and which it manages — the `packages` config, auto-search, and the publish veto (FPO-17) |
| [publish-package-filter.md](publish-package-filter.md) | The publish allow/deny filter and `PackageRef` matching |
| [fyn-local-exports-plan.md](fyn-local-exports-plan.md) | fyn local package `exports` handling |
| [dot-f-dir-update.md](dot-f-dir-update.md) | The `.f` store directory layout |
| [release-modernization-review.md](release-modernization-review.md) | Review of the release pipeline, and the home of the **ESM-only policy** — §11 is the dated decision, §12 the 2026-09-05 correction with the current per-package state and remaining exceptions |
| [stale-local-manifest-detection.md](stale-local-manifest-detection.md) | Why an installed `package.json` goes stale by design, and how `fynpo run` warns instead of hanging (FJM-64) |
| [fyn-install-script-allowlist.md](fyn-install-script-allowlist.md) | Install-script allowlist — design and what shipped: npm 12 parity, the fynpo-wide allowlist, and why workspace-local packages are exempt (FPM-82) |
| [fynjs-fetch-design.md](fynjs-fetch-design.md) | Design & architecture for `@fynjs/fetch` — zero-dependency hardened HTTP client on Node core fetch, failure modes, socket leak protection, retries, and consumer integration |
| [run-verify-api-redesign.md](run-verify-api-redesign.md) | Corrected design centered on the sequential step pipeline, unified expected errors, and defer coordination |
| [run-verify-frv5-audit-2026-09-08.md](run-verify-frv5-audit-2026-09-08.md) | Retro for the withdrawn FRV-3/4/5 work: disposition, the evidence table for future runtime changes, verification runs, and two defects found in callback inference |
| [run-verify-assessment.md](run-verify-assessment.md) | Independent review: what the library is worth against modern Node, the source-text inference flaw, ranked API improvements, why a frontier model misread the API, and measured results from a chain-typing prototype |
| [run-verify-explicit-api-proposal.md](run-verify-explicit-api-proposal.md) | Proposed explicit `.step` chain API built as a facade over the positional runtime: design constraints, verified prototype results, coexistence instead of migration, the `xrun.spec.js` trial, and rejected alternatives |
| [run-verify-migration-findings.md](run-verify-migration-findings.md) | What converting existing packages' tests to run-verify found — the anti-pattern catalog (assert-inside-callback, catch-only assertions, unguarded intercept cleanup) and real defects vs. style-parity churn, per package: `xarc-run`, `munchy`, `xsh`, `item-queue` |
| [xsh-shelljs-exec-analysis.md](xsh-shelljs-exec-analysis.md) | Why ShellJS synchronous `exec` uses temporary files, measured overhead, and the decision to move `xsh.exec` to Node and remove `$` |
| [pnpm-benchmark-replication.md](pnpm-benchmark-replication.md) | Running pnpm's install benchmark locally with fyn added, at several link settings: where pnpm's 10x headline comes from, how pnpm gets its speed (concurrency, APFS clones), and fyn's socket-count default. Harness edits in [pnpm-benchmark-harness.patch](pnpm-benchmark-harness.patch) |
| [fyn-install-perf.md](fyn-install-perf.md) | fyn install performance: final Mac and Linux numbers, peak memory against npm and pnpm, copy vs hardlink vs clone on APFS, how an install splits between the main thread and fs workers, every change kept with its measured benefit, every experiment dropped and why, and what's still open |
| [pnpm12-macos-perf.md](pnpm12-macos-perf.md) | Why pnpm 12's installs are 2x slower than pnpm 11 on macOS: it isn't the benchmark rig, and the cause is a 14-thread rayon pool creating files on APFS. `RAYON_NUM_THREADS=4` gets cold installs from 18s to 10.5s |
| [fyn-fetch-stack-research.md](fyn-fetch-stack-research.md) | What it would take to swap the HTTP layer under `pacote` (`minipass-fetch`, `make-fetch-happen`) for a wrapper on Node's built-in fetch, who depends on what, why `sigstore` is loaded but unused, and the decision to keep the current stack |
| [fyn-v8-startup-snapshot.md](fyn-v8-startup-snapshot.md) | Parked experiment: a V8 startup snapshot of fyn's bundle cuts a repeat install from 125 ms to 90 ms, but only when node starts with `--snapshot-blob`. What it took to build, the blockers to ship it (baked-in state, launcher, per-node blob), and cheaper startup wins found on the way |
| [docs-site-plan.md](docs-site-plan.md) | Plan for the site at `fynjs.pages.dev`: a landing page plus one AI-readable `reference.md` per package, served with `llms.txt`. Why TypeDoc was dropped, the reference format, the `site/` build, and publishing through the `cf-pages` branch |
| [fyn-data-shapes-audit.md](fyn-data-shapes-audit.md) | Audit of fyn's package/dependency data shapes now that `tsc` is clean - every place `PkgInfo`/`DepInfo`/`ResData`/`YarnLockData`/etc. are independently re-declared instead of shared, confirmed-dead exports in `lib/types/resolution.ts`, and what the FJM-154 precedent already fixed vs. what's still fragmented. §6 holds the goal (coherent shapes, never at the cost of runtime efficiency), what was resolved, and the ranked open items |
| [fyn-cache-misses-after-fetch-changes.md](fyn-cache-misses-after-fetch-changes.md) | Follow-up ticket material: where fyn now misses its cache after packuments stopped going into cacache and store tarballs skipped it (older fyn sharing a cache, store turned off, offline), leftover disk use, and fix options |
| [blog-node-perf/](blog-node-perf/) | Blog post for Hashnode: Rust vs Node.js for a package manager, tuning fyn on pnpm benchmarks. `post.md` for Hashnode, `index.html` for review, `build-figures.mjs`, which draws the SVG figures from the perf numbers, a memory probe, and a probe for cloning freshly written files |

## Conventions

- Issue IDs referenced here are tracked in the task system, not in this repo.
  `FPO-*` is fynjs-fynpo, `FPM-*` is fynjs-fyn, `FJM-*` is fynjs-modern.
- Cross-cutting **policy decisions** (module format, Node floor, publish rules) live in
  `release-modernization-review.md`. Do not rewrite a dated decision section — append a dated
  correction section beneath it so the history stays readable.
- Record the *why* — decisions and their rejected alternatives. The code says what it does;
  these notes say why it does it that way.
