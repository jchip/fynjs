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

## Conventions

- Issue IDs referenced here are tracked in the task system, not in this repo.
  `FPO-*` is fynjs-fynpo, `FPM-*` is fynjs-fyn, `FJM-*` is fynjs-modern.
- Cross-cutting **policy decisions** (module format, Node floor, publish rules) live in
  `release-modernization-review.md`. Do not rewrite a dated decision section — append a dated
  correction section beneath it so the history stays readable.
- Record the *why* — decisions and their rejected alternatives. The code says what it does;
  these notes say why it does it that way.
