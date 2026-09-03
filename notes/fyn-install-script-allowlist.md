# Install-script allowlist for fyn

Design for bringing fyn to npm 12 parity on install-time lifecycle scripts, plus the two things
npm does not do: a monorepo-wide allowlist, and an explicit exemption for workspace-local
packages.

Tracked as FPM-82. Blocked on FPM-81, which is now fixed.

**Status: shipped, all three stages** — FPM-81, FPM-83, FPM-84, FPM-85, FPM-86, FPM-87.
`"review"` is now the default: nothing runs an install script without an approval, workspace
packages excepted. `--script-policy=source` is the opt-out. *Open questions* below records how
each was answered in the build, and *Migration* what the flip actually looked like.

## Why now

npm 12 (July 2026) flipped install scripts from run-by-default to opt-in. The reasoning is that
`preinstall`/`install`/`postinstall` are the single largest code-execution surface in the
ecosystem: installing a package runs its author's code before you have read a line of it, and a
compromised release reaches every machine that installs it. The mechanism shipped in npm 11.10.0
as opt-in flags before becoming the default.

fyn already blocks scripts from git/URL sources (FPM-41, FPM-47). It does not block them for
registry packages, which is the vector npm 12 is actually about.

## What npm ships

Storage is a field in the consuming project's `package.json`:

```json
{
  "allowScripts": {
    "canvas": "5.0.1",
    "sharp": true,
    "malware": false
  }
}
```

| value | meaning |
|---|---|
| `true` | any version of this package may run install scripts |
| `"1.2.3"` | only this version |
| `false` | explicit denial; survives `--all` and cannot be reversed by `approve` |

Approval is pinned to the reviewed version by default, so a later release re-enters review.
`--no-allow-scripts-pin` writes name-only entries instead.

| command | effect |
|---|---|
| `npm install-scripts approve <pkg>` (alias `npm approve-scripts`) | add entries |
| `npm install-scripts deny <pkg>` | write `false` |
| `npm install-scripts ls` (`--allow-scripts-pending`) | read-only list of packages awaiting review |
| `npm install-scripts prune` | drop entries for packages no longer installed |

Related config: `allow-scripts` (comma-separated CLI/npmrc override), `allow-scripts-pin`
(boolean, default true), and the separate `allow-git` / `allow-remote` enums
(`all` | `none` | `root`, both defaulting to `none` in v12).

Two behaviors worth copying deliberately:

- **`ignore-scripts` wins.** With `ignore-scripts=true` set, nothing runs and the allowlist is
  not consulted. npm treats this as a footgun serious enough to document, because a stale
  `.npmrc` silently defeats a correct allowlist ([npm/cli#9450]).
- **Approval does not retroactively run anything.** Approving a package does not execute its
  scripts; you must reinstall. The allowlist is a gate on future installs, not a queue.

### Where npm falls short

`npm approve-scripts` is **unaware of workspaces and does not support `-w`**. In a monorepo the
guidance is to hand-maintain one allowlist at the workspace root. There is also no documented
exemption for workspace-local packages — the code you are writing yourself is reviewed by the
same mechanism as code you downloaded. Both are exactly the requirements for fyn, so this is
where the design stops mirroring and starts deciding.

## What fyn has today

`packages/fyn/lib/util/lifecycle-script-policy.ts`. The model is **source-based**, not universal:

```
registry semver (^1.2.3)          -> no urlType     -> trusted, all scripts run
npm: alias                        -> urlType "npm"  -> trusted, all scripts run
local file:/link: under the root  -> inherits root  -> trusted, all scripts run
github:/git+*/http(s) tarball     -> urlType set    -> DENIED unless allowlisted
```

`evaluateScriptPolicy()` returns `{trusted, urlType, allowAll, allowed, key, topLevel}` and
`isScriptAllowed(policy, name)` gates each script. Config lives in the consuming
`package.json`:

| key | shape | default |
|---|---|---|
| `fyn.allowScripts` | `{ "name@spec": true \| "*" \| "script" \| ["preinstall", …] }` | `{}` |
| `fyn.allowTopLevelScripts` | `true` \| `"*"` \| script name \| `string[]` | `false` |
| `fyn.enforceRegistryDeps` | boolean — transitive deps must come from a registry | `true` |

Keys match on **either** the requested spec or the resolved version
(`makeAllowKeys` → `foo@github:user/repo` and `foo@2.3.0`), and values are richer than npm's:
a per-script list, not just a boolean.

Enforcement points, both already funneling through the policy:

- `lib/pkg-installer.ts:640` — `preinstall`, `install`, `postinstall` during install
- `lib/pkg-opt-resolver.ts:225` — `preinstall` during optional-dep probing

`lib/util/registry-dep-policy.ts` is fyn's analogue of `allow-git`/`allow-remote`, driven by
`fyn.enforceRegistryDeps` and already defaulting to on for transitive deps.

## The gap

fyn's trust boundary is *provenance*: where the package came from. npm 12's is *review*: whether
a human approved this exact code. A malicious `postinstall` in a compromised release of an
ordinary registry dependency — the actual attack of the last several years — is `trusted: true`
in fyn today and runs unconditionally.

Closing it means registry packages stop being automatically trusted, which is a default change
and therefore an owner decision, not one this design makes. See *Migration*.

## Design

### D1 — the allowlist stays in `package.json`

The brief said "a JSON config file, unless npm has the same, then follow npm". npm's storage
*is* JSON, in `package.json`. fyn already uses `package.json` for `fyn.allowScripts`. So: no new
per-project file.

The reason to care beyond consistency is that a separate `fyn-allow-scripts.json` would be a
fourth place install behavior comes from, after `package.json`, `.fynrc` and CLI flags, and the
allowlist has to be reviewed in the same diff as the dependency change that provoked it. A
lockfile bump and its approval belong in one commit.

`.fynrc` is deliberately not an option: it is INI, it cascades from `$HOME`, and a
user-global file that silently re-enables scripts for every project on the machine is the
failure mode this feature exists to prevent. Machine-level config may *tighten* (an
`ignore-scripts` equivalent), never loosen.

### D2 — entry schema, a superset of npm's

Keep `fyn.allowScripts` and accept npm's value forms alongside fyn's:

```json
{
  "fyn": {
    "allowScripts": {
      "sharp": true,
      "canvas": "5.0.1",
      "esbuild@0.28.2": ["postinstall"],
      "malware": false
    }
  }
}
```

| value | meaning | origin |
|---|---|---|
| `true` / `"*"` | all install scripts, any version | fyn + npm |
| `["preinstall"]` / `"postinstall"` | only these scripts | fyn |
| `"5.0.1"` | all scripts, only this version | npm |
| `false` | explicit denial, wins over everything | **new**, from npm |

> As built, this grew a fifth form — `{ semver, scripts }`, each field optional — which is what
> `approve` writes. See *What shipped* for why. Every form in this table is still read.

`false` is the one genuinely missing primitive. `normalizeAllowEntry` currently treats any
non-`true` non-string as absent, so a `false` is silently ignored rather than denying — and
"denial survives a blanket approve" is the property that makes an `--all` workflow safe at all.
It must be checked before the wildcard and before `allowTopLevelScripts`.

Version-pinned keys already work through `makeAllowKeys`; the npm `"pkg": "1.2.3"` form is the
same information with the version on the value side, and folds into the same accumulator.

### D3 — policy mode, so the default change is a decision and not a surprise

Add `fyn.scriptPolicy`:

| mode | registry packages | git/URL packages |
|---|---|---|
| `"source"` | trusted (run) | allowlist required |
| `"review"` | allowlist required | allowlist required |
| `"off"` | nothing runs, allowlist not consulted | nothing runs |

`"source"` is today's behavior and stays the default until the owner decides otherwise;
`"review"` is npm 12 parity; `"off"` is npm's `ignore-scripts`, and like npm's it takes
precedence over the allowlist rather than being overridden by it.

A mode is better than a boolean because there are three states and the third one — "off" — is
the one people reach for in CI. Naming it in the same enum makes the precedence obvious instead
of leaving it as the trap npm documents.

### D4 — fynpo: one allowlist for the whole monorepo

The allowlist belongs in `fynpo.json` (or `fynpo.config.json` / `fynpo.config.js`, all three
already resolved by `FynpoConfigManager`), under the existing `fyn.options` block:

```json
{
  "fyn": {
    "options": {
      "scriptPolicy": "review",
      "allowScripts": { "sharp": true, "esbuild@0.28.2": ["postinstall"] }
    }
  },
  "packages": ["packages/*"]
}
```

One allowlist for the repo, reviewed once. Twenty packages that all depend on `esbuild` should
not each carry an approval, and a per-package allowlist would mean twenty places to audit and
twenty chances for one to drift permissive.

Precedence, tightest wins for denials and most specific wins for approvals:

```
fynpo.json fyn.options   (repo-wide baseline)
  <- package.json fyn.*  (may narrow, may add its own deps)
  <- CLI flags           (one-off, never persisted)
```

with the rule that **a `false` at any level is final**. A package cannot approve what the repo
denied. Without that, the monorepo-wide setting is advisory.

**This depends on FPM-81.** `lib/fyn.ts:486` reads `_fynpo.fyn.options`, but `loadFynpo()`
returns `{config, dir, graph, indirects}` — the config is at `_fynpo.config.fyn.options`. The
merge is a no-op today and this repo's own `sourceMaps`/`layout` settings have never applied.
That channel has to work, with CLI precedence fixed, before anything is built on it.

### D5 — local packages are exempt

Workspace-local packages default to fully enabled, in every mode including `"review"`.

`getSourceUrlType()` already walks `item.parent` so a local dep inherits the trust of its
nearest non-local ancestor: a fynpo sibling anchored at the root is trusted, while a local path
declared *by* a git package stays untrusted. That existing rule is the exemption; under
`"review"` it must be preserved explicitly rather than falling out of "registry = trusted",
which no longer holds.

The justification is that an allowlist is a review gate on code you did not write. Monorepo
source is already reviewed — by the PR that changed it. Making a developer run `approve-scripts`
after editing a sibling package's `postinstall` teaches them to approve without reading, which
costs the feature its meaning.

`fynpo.json` gets `fyn.options.reviewLocalPackages: true` for repos that want the strict
reading, off by default.

### D6 — CLI

Mirror npm's names so muscle memory transfers:

| fyn | npm |
|---|---|
| `fyn install-scripts ls` / `fyn install --allow-scripts-pending` | `npm install-scripts ls` |
| `fyn install-scripts approve <pkg>` | `npm approve-scripts <pkg>` |
| `fyn install-scripts deny <pkg>` | `npm install-scripts deny <pkg>` |
| `fyn install-scripts prune` | `npm install-scripts prune` |
| `--allow-scripts=<a,b>` | same |
| `--no-allow-scripts-pin` | same |

In a fynpo repo `approve` writes to `fynpo.json` by default and `--local` targets the package's
own `package.json` — the reverse of npm, which has no repo-level target at all.

Reporting is the one place fyn is already ahead and should not regress. `_warnBlockedScripts`
(`lib/pkg-installer.ts:681`) warns per package with the scripts it skipped and prints the exact
JSON to paste, including the `allowTopLevelScripts` shortcut when the package is a direct
dependency. npm's tracker shows what the alternative costs ([npm/cli#9562]): scripts skipped
quietly, and `approve-scripts` then unable to see the package to approve it.

Two changes, both consequences of `"review"` mode rather than defects today:

- The remediation hint is `logger.verbose`, so in a normal run you see that scripts were blocked
  but not how to allow them. It should print at the same level as the warning.
- Per-package warnings are right when a handful of git deps are blocked. Under `"review"` every
  native registry dependency blocks, and N warnings become scrollback. Aggregate into one
  end-of-install summary, and let `install-scripts ls` emit the same set as data (`--json`) so
  `approve` can consume it.

### D7 — integration points

The chokepoints exist; the work is mostly in the policy module.

| file | change |
|---|---|
| `lib/util/lifecycle-script-policy.ts` | `false` denial; `scriptPolicy` mode; keep local-trust walk under `"review"` |
| `lib/fyn.ts` | `scriptPolicy` getter; merge fynpo allowlist (after FPM-81) |
| `lib/pkg-installer.ts:640` | unchanged shape; `_warnBlockedScripts` promoted to a summary, hint off `verbose` |
| `lib/pkg-opt-resolver.ts:225` | unchanged shape |
| `cli/main.ts` | `install-scripts` command, `--allow-scripts*` flags |

`lib/util/registry-dep-policy.ts` already covers `allow-git`/`allow-remote` via
`fyn.enforceRegistryDeps` and needs nothing here.

## Rejected alternatives

**A separate `fyn-allow-scripts.json`.** Diverges from npm for no benefit, adds a fourth
configuration source, and separates an approval from the dependency change that caused it.

**Allowlist in `.fynrc`.** INI, and it cascades from `$HOME` — a machine-global file that
loosens policy for every project is the failure this feature prevents.

**Per-package allowlists in a fynpo repo.** N copies of the same approval, N places to audit,
and the least careful one wins.

**Hashing script bodies instead of pinning versions.** Strictly better security — it survives a
republish under the same version — but it needs a place to store hashes, a way to refresh them,
and diverges from npm's model. Worth revisiting if npm moves that way.

**Making `"review"` the default now.** Would break every existing install with a native
dependency on upgrade. Belongs to a major, with the summary output shipped at least one minor
earlier so people can see what would break.

## Migration — done

`"review"` is the default as of FPM-87. It landed as a **minor on v3**, not a major: the
feature is new and unreleased, so there is no installed base whose behavior it breaks.

Two decisions made at the flip, both the owner's:

**`fyn.allowTopLevelScripts` is `"source"`-only.** It exists because a direct dependency you
typed yourself is more trusted than a transitive one — a provenance argument, which is exactly
what `"review"` stops accepting. Left applying, a stale `allowTopLevelScripts: true` would
exempt every direct dependency from the new default, silently, which would be the widest hole
in it. Under `"source"` it means what it always did.

**An unapproved install script stops the install rather than being skipped.** Skipping is what
the stages before this did, and it is right when blocking is exceptional — a git dep or two.
Once review is the default, a skipped `install` script means a native package that did not
build, and finding that out at runtime is worse than finding it out now. So:

- **On a terminal**, fyn lists what wants to run and asks: all / select / none. An approval is
  written to `package.json` (or the monorepo's `fynpo.json`) and the scripts it just allowed are
  queued — the install continues, no second run needed.
- **Anywhere else** — CI, a pipe, a git hook — there is nobody to ask, so the install fails with
  the list, the `approve` command, and `--script-policy=source`. Approvals belong in the repo,
  committed like a lockfile.
- **`"source"` keeps warning and continuing.** It is the documented opt-out, and an opt-out that
  also fails your CI is not one.

The staging that got here, for the record:

1. `scriptPolicy` accepted, defaulting to `"source"`. `false` denials honored. No behavior change.
2. `install-scripts ls`, the end-of-install summary, and `--allow-scripts-pending`, so a project
   could see what it would need to approve. Still no behavior change.
3. `"review"` becomes the default, with `--script-policy=source` as the escape hatch.

## Open questions, as answered

**Does a `"1.2.3"` value mean exact version or a range?** Range, via `semverUtil.satisfies`, so
`"5.0.1"` and `"^5.0.0"` both work and the exact form behaves as npm documents. The ambiguity
this raised — a string value could be a script name or a version — is resolved by classifying
the string: one of `preinstall`/`install`/`postinstall` is a script name, anything
`Semver.validRange` accepts is a version constraint, and anything else falls back to a script
name so existing configs keep working. `"*"` means all scripts either way, so the two readings
agree there.

**Should `fyn.allowTopLevelScripts` survive `"review"` mode?** No — it is `"source"`-only, decided
at the stage 3 flip where it belonged. See *Migration*.

**Does the allowlist belong in the lockfile too?** Still open, still a separate design. What
shipped instead is the install config (`.fyn.json`): each install records what it blocked and,
with `--allow-scripts-pending`, what `"review"` would have blocked, so `install-scripts ls` can
list it without re-resolving. That is a cache of the last install, not a fail-closed gate —
`--frozen-lockfile` refusing an unreviewed change still needs the lockfile.

## What shipped

| design | where | ticket |
|---|---|---|
| D1 allowlist in `package.json` | unchanged | — |
| D2 entry schema, `false` denial, npm version pins | `lib/util/lifecycle-script-policy.ts` | FPM-83 |
| D3 `scriptPolicy` modes | same, plus the `Fyn.scriptPolicy` getter | FPM-83 |
| D4 fynpo-wide allowlist, scope precedence | `lib/fyn.ts` getters, `mergeAllowScripts` | FPM-84 |
| D5 local packages exempt | `isLocalSource`, `reviewLocalPackages` | FPM-83 |
| D6 CLI and reporting | `lib/install-scripts.ts`, `lib/util/script-policy-report.ts`, `cli/main.ts` | FPM-85, FPM-86 |
| D7 integration points | `lib/pkg-installer.ts`, `lib/pkg-opt-resolver.ts` | FPM-84 |
| blocker: fynpo options channel | `Fyn.mergeFynpoOptions` | FPM-81 |
| stage 3: `"review"` by default, prompt or fail | `InstallScripts.review`, `PkgInstaller._reviewBlockedScripts` | FPM-87 |

Three decisions the build had to make that the design left implicit:

- **The fynpo merge is key-by-key, not `_.merge`.** An option the user set on the command line
  (`_cliSource[key] !== "default"`) is skipped, and `cwd`/`initCwd` are never taken from a
  monorepo config — a repo-wide setting that relocated the install would change which
  package.json is being installed. The four script-policy keys are excluded from that generic
  merge entirely, because they have their own rules: allowlists union across scopes with a
  denial final, and the mode may only be tightened by a package.
- **The entry shape is an object, keyed by bare package name.** An approval carries two
  independent constraints, and putting them both in the key (`pkg@^1.2.3`) makes the key do two
  jobs: it has to be re-parsed to find the package name — around the `@` of a scope — and
  widening a range means deleting one key and adding another. So fyn writes

  ```json
  { "sharp": { "semver": "^0.34.4", "scripts": ["install"] } }
  ```

  with **either field optional**: no `semver` approves every version, no `scripts` approves
  every install script. One package is one entry, and approving a second version widens that
  entry's `semver` into `"^0.34.4 || ^1.0.0"` rather than adding a near-duplicate.

  The cost is that a single entry cannot say "these scripts for that range, those for this one";
  when two approvals differ, both the range and the script list are unioned. That is a real
  loosening, and it is the price of one entry per package.

  Everything else is still *read* — `true`, `"install"`, `["install"]`, npm's `"1.2.3"`, and a
  range or spec in the key. A key's range is matched against the resolved version, so
  `sharp@^0.34.0` covers `0.34.4`; a key spec that is not a semver range (`github:user/repo#v1`)
  is matched literally against the requested spec, since there is no version to range over. That
  range matching is new — key lookup used to be exact — and it is what makes the hand-written
  forms behave the way anyone would expect.

- **Approvals are scoped to a release line, not pinned to one version.** `approve` writes
  `^<reviewed version>`, so patches within the line do not churn the allowlist, and a jump past
  it comes back for review. `--no-allow-scripts-pin` omits `semver` entirely. An exact pin is
  still expressible by hand — `{ "semver": "0.34.4" }` — it is just not what `approve` writes.
- **`--allow-scripts-pending` answers the review question without switching to it.** The
  installer evaluates each package a second time under `"review"` and records what would need
  approval, while the install still runs under the mode in effect. That is stage 2 of the
  migration made concrete: a project can see the cost of `"review"` before paying it.

## Sources

- [Preparing for npm v12: install scripts and non-registry sources become opt-in](https://github.com/orgs/community/discussions/198547)
- [npm-install-scripts](https://docs.npmjs.com/cli/v12/commands/npm-install-scripts/)
- [npm-approve-scripts](https://docs.npmjs.com/cli/v11/commands/npm-approve-scripts/)
- [npm config reference](https://docs.npmjs.com/cli/v12/using-npm/config)
- [npm/cli#9450 — allowScripts ignored when ignore-scripts=true][npm/cli#9450]
- [npm/cli#9562 — npm ci rejects a package approve-scripts cannot see][npm/cli#9562]

[npm/cli#9450]: https://github.com/npm/cli/issues/9450
[npm/cli#9562]: https://github.com/npm/cli/issues/9562
