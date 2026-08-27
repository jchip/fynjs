# Release Modernization Review — fynjs monorepo

_Reviewed 2026-08-27 against `main` @ 2e37bedb. Scope: all 25 dirs under `packages/` (19 publishable, 6 private)._

## 1. Registry state

| package | local | npm latest | note |
|---|---|---|---|
| fyn | 2.1.6 | **1.1.46** | v2 parked on `v2` tag |
| fynpo | 2.1.6 | **1.1.49** | v2 parked on `v2` tag |
| @fynjs/cli-args | 2.4.5 | — | **never published** |
| @fynjs/run | 2.3.0 | — | **never published** (rename of @xarc/run) |
| check-pkg-new-version | 1.0.0 | — | **never published** |
| aveazul, @jchip/error, filter-scan-dir, @fynpo/base, fynpo-cli, item-queue, pkg-preper, publish-util, run-verify, string-array, unwrap-npm-cmd, visual-exec, visual-logger, xflight, check-pkg-new-version-engine | = | = | in sync |

Private / not published: `bluebird`, `pacote-jchip`, `@fynjs/create-monorepo`, `@fynjs/dual-mode-template`, `init-package`.

## 2. Blocking — packages currently ship broken type resolution

### 2.1 `.d.ts` files contain `.ts` import specifiers
`rewriteRelativeImportExtensions` rewrites emitted JS but **not** emitted declarations, so shipped `.d.ts` say:

```ts
export { Inflight } from "./inflight.ts";   // packages/item-queue/dist-cjs/index.d.ts
```

Consumers resolving this need `allowImportingTsExtensions`, which TS only permits with `noEmit` — so any consumer that builds gets an error.

Affected (10 of 18 dual-mode packages): `aveazul` (12 files), `check-pkg-new-version-engine` (8), `publish-util` (4), `visual-logger` (4), `check-pkg-new-version`, `@fynpo/base`, `item-queue`, `run-verify`, `unwrap-npm-cmd`, `visual-exec` (2 each).

`cli-args` is the only package that patches it, via a build step that is **macOS-only** and will silently no-op on Linux CI:

```
find dist-cjs dist-esm -name '*.d.ts' -exec sed -i '' 's/\.ts"/"/g' {} ;
```

(GNU sed reads `''` as the script argument → the command fails or edits nothing on ubuntu runners.)

### 2.2 No `.d.cts` — CJS consumers get no types under node16/nodenext
Every dual-mode package is `"type": "module"` and points `exports.require.types` at `dist-cjs/index.d.ts`. In a `type: module` package a `.d.ts` is an **ESM** declaration, so TS under `moduleResolution: node16|nodenext|bundler` either mis-types or drops the CJS entry entirely. The correct artifact is `dist-cjs/index.d.cts`. Count of `.d.cts` files across the whole repo: **0**.

### 2.3 `moduleResolution: "Node"` (node10) in the shared tsconfig
Self-inconsistent with shipping an `exports` map — the build never validates the resolution mode consumers actually use, which is why 2.1/2.2 went unnoticed.

### 2.4 Missing `types` condition in `exports`
These fall back to sibling-`.d.ts` inference, which compounds 2.2: `aveazul`, `check-pkg-new-version`, `check-pkg-new-version-engine`, `@jchip/error`, `string-array`, `unwrap-npm-cmd`, `xflight`, `@fynjs/dual-mode-template`. The other ten already use the correct `{ types, default }` nested form — adopt that everywhere.

## 3. Blocking — first-publish failures

- **`@fynjs/cli-args`** has `publishConfig: { "tag": "next" }` with **no `access: "public"`**. First publish of a scoped package without it → `402 Payment Required`. (`@fynjs/run`, `@fynpo/base`, `@jchip/error` all set it correctly.)
- **`@fynjs/run`** has no `build` and no `prepublishOnly`; it publishes hand-written `lib/`. Confirm that is intended before the first `@fynjs` publish.
- Publish ordering: `@fynjs/cli-args` must land before `fyn`/`fynpo` (already noted in memory).

## 4. Tarball hygiene — every dual-mode package ships junk

Measured over the 18 built `dist-cjs` dirs:

- **`tsconfig.cjs.tsbuildinfo` shipped in all 18.** Build cache in the published tarball.
- **Orphaned `*.js.map` in all 18** (10 in aveazul, 15 in cli-args, 6 in @fynpo/base…). `ts2mjs --remove-source` removes the `.js` but leaves the old `.js.map`; nothing references them.
- **Sourcemaps are dead weight.** `tsconfig` sets `sourceMap: true`, `src/` is not in `files`, and `sourcesContent` is absent — e.g. `item-queue/dist-cjs/index.cjs.map` has `sources: ["index.js"]`, a file that no longer exists. Either drop maps from the tarball or turn on `sourcesContent` (and add `declarationMap` only if `src/` ships).
- **Dead `.npmignore`** alongside a `files` array (`files` wins): `item-queue`, `run-verify`, `string-array`, `unwrap-npm-cmd`, `visual-logger`. Two sources of truth, one inert.
- **Missing `LICENSE` file** despite an SPDX `license` field: `check-pkg-new-version`, `check-pkg-new-version-engine`, `item-queue`, `publish-util`, `run-verify`, `visual-exec`, `visual-logger`.

## 5. No release automation

`.github/workflows/` contains only `ci.yml`. There is **no release/publish workflow** — publishing is a local `fynpo publish` with a long-lived npm token.

Modernization worth doing, in order of payoff:

1. **npm Trusted Publishing (OIDC)** — GitHub Actions publishes with a short-lived token; no `NPM_TOKEN` secret at all. Configure per package on npmjs.com, then publish from a `release.yml` job with `permissions: { id-token: write }`.
2. **Provenance** — `npm publish --provenance` (or `publishConfig.provenance: true`) attaches a signed build attestation. Free once (1) is in place; visible as the "Provenance" badge on npm.
3. **`publint` + `@arethetypeswrong/cli` gate in CI** — these catch §2 and §4 automatically. Run per package in `ci:check`; this is the single highest-value addition.
4. **Retire `publish-util` prepack/postpack** where it only exists to strip devDeps — modern npm honors `files` + `exports` directly. It is also applied inconsistently: `check-pkg-new-version`, `check-pkg-new-version-engine`, `visual-exec`, `xflight`, `@fynjs/run` have no `prepack`, the rest do.

### CI workflow is itself stale
```yaml
- uses: actions/checkout@v2      # v5 current
- uses: actions/setup-node@v2    # v6 current, and no cache:
  node: ["22", "24", "26"]       # correct as of the >=22 floor
```
(Node 26 released April 2026 and goes Active LTS Oct 2026 — this matrix entry is fine. An earlier draft of this note wrongly called it unreleased.) With the floor now at `>=22.0.0` the matrix covers it, though floating `"22"` tests 22.latest, not 22.0 — pin the boundary if you want the floor itself verified. `npm i -g fyn@v2` in CI is a symptom of §6.

## 6. The `latest` tag decision

`npm i fyn` today installs **1.1.46**, not 2.1.6. Same for `fynpo`. `fynpo.json` pins both to the `v2` tag and `publishConfig.tag: "v2"` reinforces it. If v2 is the intended stable line, `latest` should move to it as part of this release — that is a **behavior change for every consumer** and needs your call before anything else in §5 matters.

## 7. Metadata drift (low risk, easy sweep)

| issue | packages |
|---|---|
| `registry.npmjs.com` vs `.org` (root `.npmrc` says `.org`) | `.com`: fyn, fynpo, @fynpo/base, @jchip/error, filter-scan-dir, publish-util, @fynjs/run · `.org`: pkg-preper, unwrap-npm-cmd, visual-logger |
| no `publishConfig` at all | aveazul, check-pkg-new-version(+engine), item-queue, run-verify, string-array, visual-exec, xflight |
| missing `repository.directory` | @fynjs/run, fynpo-cli, @fynjs/create-monorepo |
| ~~stale `engines`~~ | **RESOLVED** — unified to `>=22.0.0` across all 25 packages, see §10 |
| no `sideEffects` field anywhere | all 18 dual-mode packages (add `"sideEffects": false`) |
| license outliers | pkg-preper is `Artistic-2.0`; vendored `bluebird` fork is marked `UNLICENSED` (upstream is MIT); `pacote-jchip` has no license field |

## 8. Recommended baseline

Fix `packages/dual-mode-template` first — it is the pattern all 18 copy, and today it carries §2.1–2.4 too. Target shape:

```jsonc
{
  "type": "module",
  "exports": {
    ".": {
      "import": { "types": "./dist-esm/index.d.ts",  "default": "./dist-esm/index.js" },
      "require": { "types": "./dist-cjs/index.d.cts", "default": "./dist-cjs/index.cjs" }
    },
    "./package.json": "./package.json"
  },
  "files": ["dist-cjs", "dist-esm", "LICENSE"],
  "sideEffects": false,
  "engines": { "node": ">=22.12.0" },
  "publishConfig": { "access": "public", "registry": "https://registry.npmjs.org/", "provenance": true }
}
```

with `moduleResolution: "NodeNext"`, no `.tsbuildinfo`/orphan-map leakage, and `publint && attw --pack` in `prepublishOnly`. Then re-template the other 17 and drop the per-package `sed` hack.

## 9. Suggested order

1. Decide §6 (`latest` → v2?) — gates everything downstream.
2. Fix `dual-mode-template` to §8; add `publint` + `attw` to `ci:check` so §2/§4 stay fixed.
3. Roll the template across the 17 dual-mode packages; patch runs of `.d.ts`/`.d.cts` emission properly instead of `sed`.
4. Add `@fynjs/cli-args` `access: public`; publish cli-args → @fynjs/run → check-pkg-new-version.
5. Add `release.yml` with OIDC trusted publishing + provenance; refresh `ci.yml` actions and node matrix (20, 22, 24).
6. Metadata sweep (§7).

## 10. Decision log — Node floor (2026-08-27)

**Minimum Node is `>=22.12.0`, uniform across all 25 packages** (private ones included). Folded into the next release.

Revised same-day from an initial `>=22.0.0`. The floor moved to 22.12.0 because that is where unflagged `require(esm)` lands, which is the precondition for going ESM-only (§11). At `>=22.0.0` an ESM-only package throws `ERR_REQUIRE_ESM` for any CJS consumer; at `>=22.12.0` `require()` of an ESM package just works.

Previous state was five different floors: `^20.17.0 || >=22.9.0` (fyn, fynpo), `>=20` (19 packages), `>=18.0.0` (aveazul), `>=12` (filter-scan-dir), and none at all (bluebird, @fynjs/create-monorepo, pacote-jchip). Node 20 reached EOL 2026-04-30.

`fyn`/`fynpo` previously declared `^20.17.0 || >=22.9.0`, inherited from their npm-CLI dependency generation (@npmcli/arborist@9, pacote@21, cacache@20, npm-registry-fetch@19, make-fetch-happen@15, npm-packlist@10, @npmcli/run-script@10). `>=22.12.0` now sits above that, so the earlier concern about `engines` understating the real floor is resolved.

`.github/workflows/ci.yml` matrix pinned to `["22.12", "24", "26"]` — the floating `"22"` entry tested 22.latest and never verified the floor itself. Node-version claims in the `aveazul`, `@fynjs/cli-args`, and `xflight` READMEs updated to match. Root `package.json` intentionally has no `engines` (private workspace root).

## 11. Direction — ESM-only (decided 2026-08-27, not yet implemented)

The dual ESM/CJS build is being retired in favour of ESM-only across the 18 dual-mode packages. Two findings made this cheap:

- **`fyn` and `fynpo` webpack-bundle everything and strip `dependencies` at pack time** (`publishUtil.remove: ["dependencies"]` for fyn; all-but-four for fynpo). The published tarballs are self-contained bundles, so all 18 packages are build-time deps consumed through webpack, which handles ESM natively. The largest internal consumer is indifferent to module format.
- **Zero top-level await** across all 123 source files. TLA is what makes an ESM module permanently un-`require`-able (`ERR_REQUIRE_ASYNC_MODULE`); nothing here trips it.

Combined with the 22.12.0 floor, `require()` of these packages keeps working for CJS consumers, so this is not the hostile break ESM-only used to be.

What it removes: one of the two `tsc` builds per package, the `ts2mjs` dependency and step, the `.d.cts` gap (§2.2), the `.ts`-specifier bug in 10 packages' declarations (§2.1), the macOS-only `sed` hack, and half of every tarball. `exports` collapses to a single path.

**Versioning**: `unwrap-npm-cmd` (149k downloads/mo) and `string-array` (139k/mo) are the only packages with meaningful external traffic and get an explicit **major bump** to signal the change — or a minor bump for any package whose major is 0. Both are currently 1.x, so both go to 2.0.0.

Out of scope: `@fynjs/run` is CJS-only today and must keep loading arbitrary user `xrun.js`/`xclap.js` task files, so it is treated separately from the 18. The CLIs (`fyn`, `fynpo`, `fynpo-cli`, `@fynjs/create-monorepo`) are format-invisible to users.
