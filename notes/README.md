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

## Conventions

- Issue IDs referenced here are tracked in the task system, not in this repo.
  `FPO-*` is fynjs-fynpo, `FPM-*` is fynjs-fyn, `FJM-*` is fynjs-modern.
- Cross-cutting **policy decisions** (module format, Node floor, publish rules) live in
  `release-modernization-review.md`. Do not rewrite a dated decision section — append a dated
  correction section beneath it so the history stays readable.
- Record the *why* — decisions and their rejected alternatives. The code says what it does;
  these notes say why it does it that way.
