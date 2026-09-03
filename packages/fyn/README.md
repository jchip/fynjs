# fyn

[![NPM version][npm-image]][npm-url]
[![Apache 2.0 License][apache-2.0-blue-image]][apache-2.0-url]
[![Build Status][build-image]][build-url]

**fyn** is the package manager for [fynpo], a zero setup monorepo manager for node.js.

It treats your disk as a registry so you can develop, publish, and test all your packages using local copies directly.

## Quick Start

Interested in giving it a quick test? Just install and run it on your project:

```sh
npm i -g fyn
cd <your-project>
fyn
```

Want to add a package on your local disk as a dependency to your project? Do this:

```sh
fyn add ../another-package
```

To see detailed stats about any package, use the `stat` command:

```sh
fyn stat lodash
```

- It can read and use some settings from your `.npmrc`.
- It can use `npm-shrinkwrap.json` or `package-lock.json` files.

## Configuring fyn

fyn options can be listed in help:

```sh
fyn --help
```

fyn loads config from `CWD/.fynrc`, `CWD/.npmrc`, `~/.fynrc`, and `~/.npmrc` in this specified order, from highest to lowest priority.

From `.npmrc`, only fields `registry`, `@<scope>:registry`,`email`, and `_auth` are read.

`.fynrc` file can be an [ini] or `YAML` format. For the `YAML` format, the first line must be `---`.

Below is an `YAML` example, with all the options set to their default values:

```yml
---
registry: https://registry.npmjs.org
"@scope:registry": https://registry.custom.com
offline: false
forceCache: false
lockOnly: false
progress: normal
logLevel: info
production: false
centralStore: false
```

Or as an ini:

```ini
registry=https://registry.npmjs.org
@scope:registry=https://registry.custom.com
offline=false
forceCache=false
lockOnly=false
progress=normal
logLevel=info
production=false
centralStore=false
```

### Local source exports (`fyn.localExports`)

A package can expose local development directories by declaring them in its
`package.json`:

```json
{
  "name": "@acme/ui",
  "fyn": {
    "localExports": {
      "src": "./src"
    }
  }
}
```

Values are producer-relative directories. The merged `package-fyn.json` may
override this configuration; `false` disables either one named export or the
entire `localExports` field.

When the package is a fynpo package or resolves from a `file:`, `link:`, or
explicit filesystem path dependency, fyn creates each live directory link at
`<dir>/<package>/<export>` in the consuming package, where `<dir>` defaults to
`_fyn`; the example above creates `_fyn/@acme/ui/src`. Registry, Git, and URL
dependencies never create local exports, even if their package metadata declares
them.

#### Configuring the export directory

The export directory is owned and configured by the **consuming** package, in
its `package.json` (or merged `package-fyn.json`) `fyn` section:

```json
{
  "fyn": {
    "localExportsDir": "_fyn",
    "localExportsDirs": {
      "@acme/ui": "_ui",
      "tools": "vendor/tools"
    }
  }
}
```

- `localExportsDir` sets the default directory for all producers; it defaults to
  `_fyn` when omitted.
- `localExportsDirs` overrides the directory per producer package name.

With the example above, `@acme/ui` exports land under `_ui/@acme/ui/...` and
`tools` under `vendor/tools/tools/...`, while every other producer uses the
`_fyn` default. Directories must be relative paths inside the consumer; absolute
paths, `..` escapes, `node_modules`, `.git`, and nested export directories are
rejected. Producers cannot choose where their exports are written.

Each configured directory is generated, disposable content. Exclude it from Git,
package publication, and fynpo build-cache inputs. Fyn creates the source
surface only; the consumer remains responsible for configuring Vite aliases,
TypeScript paths, or equivalent tool settings to use it.

### Lifecycle script allow list (`fyn.allowScripts`)

As a security hardening measure, `fyn` does **not** run a package's npm lifecycle
scripts (`preinstall`, `install`, `postinstall`) during install unless someone has
approved that package. Installing a package otherwise runs its author's code before
you have read a line of it, and a compromised release reaches every machine that
installs it.

Approval is per package, in `fyn.allowScripts`. The only packages exempt are your
own — `file:`/`link:` dependencies and fynpo siblings, which the pull request that
changed them already reviewed.

When an install finds scripts nobody has approved it **stops and asks**, on a
terminal. In CI — or anywhere else there is no terminal to ask on — it **fails**,
rather than quietly handing you a tree whose native packages were never built. See
[`fyn.scriptPolicy`](#choosing-a-trust-model-fynscriptpolicy) for the opt-out back to
trusting a package because of where it came from.

To allow specific scripts for such a package, add a `fyn.allowScripts` map to your
`package.json`. Each key is a package name and each value says which versions and
which scripts are approved:

```json
{
  "fyn": {
    "allowScripts": {
      "sharp": { "semver": "^0.34.4", "scripts": ["install"] },
      "esbuild": { "semver": "^0.28.2 || ^0.29.0" },
      "canvas": { "scripts": ["install"] },
      "zlib-sync": { "scripts": ["*", "!postinstall"] },
      "lodash": {},
      "malware": false
    }
  }
}
```

- **`semver`** — approved only for versions matching this range. Omit it to approve
  every version. A union works: `"^0.28.2 || ^0.29.0"`.
- **`scripts`** — approved only for these lifecycle scripts. Omit it to approve all
  of them. Script names are matched case-insensitively.
- So `esbuild` above is "those two release lines, any script", `canvas` is "any version,
  `install` only", `zlib-sync` is "any script except `postinstall`", and `lodash` is "any
  version, any script".
- Inside `scripts`, **`!name` denies that one script** and `+name` allows it, same as a bare
  name. So `["*", "!postinstall"]` is "every install script except postinstall", and
  `["+install", "!preinstall"]` spells both halves out. `!*` denies them all. A `!` beats a
  bare or `+` name for the same script, whichever order they appear in.
- **`false`** denies a package outright. A denial wins over everything: any other
  entry matching the same package, `allowTopLevelScripts`, an `approve --all`, and
  an approval in a wider scope. Removing the `false` is the only way to undo it.
  [`fyn.denyScripts`](#blacklisting-packages-fyndenyscripts) says the same thing in its own
  map, can also scope by version and script, and is what `install-scripts deny` writes.

This is the form `fyn install-scripts approve` writes. Several older and shorter
forms are still read, so a hand-written or npm-written allowlist keeps working:

| entry | means |
|---|---|
| `"sharp": true` / `"sharp": "*"` | any version, any script |
| `"sharp": ["install"]` / `"sharp": "install"` | any version, those scripts |
| `"sharp": "0.34.4"` / `"sharp": "^0.34.0"` | matching versions, any script — npm's form |
| `"sharp@^0.34.0": ["install"]` | the range in the key, those scripts |
| `"foo@github:user/foo#v1": ["install"]` | matched against the requested spec |

A range in the key is matched against the **resolved version**, so `sharp@^0.34.0`
covers `0.34.4`. A key whose spec is not a semver range — a `github:`/git/URL spec —
is matched literally against what the dependency asked for, since there is no
version to range over. When a key and its value both carry a version constraint,
both have to be satisfied.

#### Blacklisting packages (`fyn.denyScripts`)

`fyn.denyScripts` is the allowlist's opposite, and it takes **the same map shape** — it answers
the same two questions, which versions and which scripts. The only difference is that a match
denies:

```json
{
  "fyn": {
    "allowScripts": {
      "sharp": { "semver": "^0.34.4", "scripts": ["install"] }
    },
    "denyScripts": {
      "malware": {},
      "sketchy": { "semver": "^2.0.0" },
      "esbuild": { "scripts": ["postinstall"] }
    }
  }
}
```

As on the allow side, an absent `semver` means every version and an absent `scripts` means
every install script. So `malware` is denied outright, `sketchy` only at 2.x, and `esbuild`
keeps every script but `postinstall`.

Setting both is the point: `allowScripts` says what you reviewed, `denyScripts` says what you
refuse, and **deny wins** — over a matching `allowScripts` entry, over `allowTopLevelScripts`,
over an `install-scripts approve --all`, over `scriptPolicy: "all"`, and over an approval
recorded in a wider scope. Removing the entry is the only way to undo it.

- Entries need no `!` markers. Every entry in this map is already a denial, so `scripts` there
  lists what to deny.
- It applies at **every scope** — `fynpo.json` `fyn.options`, the package's own
  `package.json`, and `--deny-scripts` on the command line — and the three **union**. No scope
  can drop what a wider one denied, so a monorepo-wide denial is not something an individual
  package can talk its way out of.
- `fyn install-scripts deny <pkg>` writes an empty entry — `{}`, every version, every script.
  In a fynpo repo it writes the root `fynpo.json`; `--local` writes the package's own
  `package.json`. Narrowing an entry is a hand edit.
- For one run: `fyn install --deny-scripts=malware,sketchy`. A bare name there means the same
  as `{}`.
- A denied package is **skipped, not queued for review**. The install reports it in the
  end-of-install summary and carries on — it is never offered to the approval prompt, because
  approving it could not take effect.
- `install-scripts prune` never touches it. It drops stale *approvals* — measured against what
  is actually installed, hoisted packages included — and a denial for a package you no longer
  install is still the answer if it ever comes back.
- The older `"allowScripts": { "malware": false }` form is still read and denies the whole
  package; `denyScripts` is the form that can also scope by version and script.

#### Trusting direct dependencies (`fyn.allowTopLevelScripts`)

Maintaining per-package `allowScripts` entries is tedious when you have several
non-registry dependencies you control (e.g. private `github:`/git deps with a
build step). As an **opt-in** convenience, you can trust the lifecycle scripts of
any non-registry package that is declared **directly** in your top-level
`package.json` — without listing each one:

```json
{
  "fyn": {
    "allowTopLevelScripts": true
  }
}
```

- **`"source"` mode only.** Under `"review"` (the default) it is ignored: the question there
  is whether someone read the code, and "I typed this name into my `package.json`" does not
  answer it. A blanket exemption for every direct dependency would be the widest hole in the
  policy, and a stale `true` would open it silently.
- This is **off by default**; the deny-by-default policy above is unchanged.
- It only applies to dependencies you declared directly in the top-level
  `package.json`. Non-registry packages pulled in **transitively** stay blocked
  and still require an explicit `fyn.allowScripts` entry.
- `true` (or `"*"`) allows all lifecycle scripts; an array such as
  `["install", "postinstall"]` restricts it to those script names for all direct
  non-registry deps.
- Allowances combine with `fyn.allowScripts`: a per-package entry can grant
  additional scripts on top of what `allowTopLevelScripts` permits.

> ⚠️ A direct `github:`/git dependency on a branch or tag still runs whatever code
> has been pushed there. Declaring it in your `package.json` is an explicit trust
> decision — pin to a commit/tarball you've reviewed when that matters.

#### Choosing a trust model (`fyn.scriptPolicy`)

`fyn.scriptPolicy` picks which question decides whether a package may run its scripts:

| mode | registry packages | git/URL packages | workspace-local packages |
|---|---|---|---|
| `"review"` *(default)* | need an allowlist entry | need an allowlist entry | run their scripts |
| `"source"` | run their scripts | need an allowlist entry | run their scripts |
| `"all"` | run their scripts | run their scripts | run their scripts |
| `"off"` | nothing runs | nothing runs | nothing runs |

`"review"` asks whether someone approved *this code* — npm 12's model, and the only one that
covers a compromised release of an ordinary dependency. `"source"` asks only where the package
*came from*, so anything off a configured registry runs; it is the opt-out for a project that
would rather not maintain an allowlist. `"off"` is npm's `ignore-scripts`, and like npm's it
wins over the allowlist rather than being overridden by it.

```json
{
  "fyn": {
    "scriptPolicy": "source"
  }
}
```

Or for one run: `fyn install --script-policy=source`.

`"all"` asks nothing: every package runs its scripts whatever its source, including the
`github:`/git/URL ones every other mode blocks. Reach for it when you have decided the tree is
already trusted — a vendored or internally mirrored dependency set, or a throwaway sandbox — and
maintaining approvals buys you nothing. It is the loosest mode fyn has, looser than the
behavior fyn had before the allowlist existed.

A denial is still honored under `"all"`: `fyn.denyScripts` and an `allowScripts` `false` are
checked *before* the mode is. That makes `"all"` plus denials a blacklist — everything runs
except what you name — instead of a switch that discards the denials you already recorded.

```json
{
  "fyn": {
    "scriptPolicy": "all",
    "denyScripts": { "malware": {} }
  }
}
```

Workspace-local packages — `file:`/`link:` deps and fynpo siblings — are exempt in **every**
mode, including `"review"`: an allowlist is a review gate on code you did not write, and
monorepo source is reviewed by the pull request that changed it. Set
`fyn.reviewLocalPackages: true` if you want them reviewed like anything else. A local path
declared *by* a git package is not workspace-local and stays blocked.

##### What an unapproved package looks like

Under `"review"`, an install that finds unapproved install scripts stops before running
anything:

```
2 packages want to run install scripts that have not been approved:
  sharp@0.34.4     install
  esbuild@0.28.2   postinstall
Approve? [a]ll / [s]elect / [n]one (default)
```

`a` approves them all, `s` walks them one at a time, `n` continues with those scripts skipped.
An approval is written to your `package.json` — or the monorepo's `fynpo.json` — so the next
install does not ask again.

Where there is no terminal to ask on — CI, a pipe, a git hook — the install **fails** with the
same list and a non-zero exit, instead of producing a tree whose native packages silently never
built. Record the approvals in `package.json` and commit them, the way you would a lockfile.

To see what a project would need to approve without changing what an install runs:

```
fyn install --script-policy=source --allow-scripts-pending
```

#### One allowlist for a fynpo monorepo

In a fynpo repo the allowlist belongs at the root, in `fynpo.json` under `fyn.options` — one
approval per dependency, reviewed once, rather than a copy in each of twenty packages:

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

Scopes combine as: **fynpo config → package.json → CLI**. Approvals accumulate across them; a
package may add its own but a denial at any scope is final — a `denyScripts` entry or an
`allowScripts` `false`, either way no tighter scope can lift it. For `scriptPolicy` a package may
only *tighten* what the repo asked for (`"review"` → `"off"`, never back to `"source"`); a CLI
flag is a one-off and overrides outright.

#### Reviewing with `fyn install-scripts`

```
fyn install-scripts ls                 # what is awaiting review (--json for data)
fyn install-scripts approve <pkg>...   # allow those packages (--all for everything pending)
fyn install-scripts deny <pkg>...      # blacklist those packages (fyn.denyScripts)
fyn install-scripts prune              # drop entries for packages no longer installed
```

`ls` reads what the last install recorded, so run `fyn install` (optionally with
`--allow-scripts-pending`) first.

`approve` scopes what it writes to the release line it reviewed —
`"sharp": { "semver": "^0.34.4", "scripts": ["install"] }` — and to the scripts the package
actually has, so a jump past that range, or a release that later adds a `preinstall`, comes
back for review. Approving a second version widens that one entry's `semver` into a union
rather than adding a near-duplicate. `--no-allow-scripts-pin` omits `semver`, approving every
version. In a fynpo repo it writes to the root `fynpo.json`; `--local` writes to the package's
own `package.json`.

Approving does not run anything retroactively — run `fyn install` afterwards.

### Registry-only transitive dependencies (`fyn.enforceRegistryDeps`)

By default, `fyn` requires that **transitive** (non-top-level) dependencies
resolve from a published registry. This blocks a transitive dependency from
quietly pulling code off `github:`/git/URL sources that you never chose — only
the top-level `package.json` is allowed to declare such sources.

- **On by default.** A transitive dependency from a non-registry source
  (`github:`, `git+ssh`/`https`/`http`/`file`, `git:`, `http(s)` tarball) — or
  one with an unparseable version selector — causes `fyn` to **abort the
  install** with an error naming the offending package and its parent.
- **Top-level `package.json` is unrestricted** — you may still declare `github:`,
  git, URL, and local dependencies for your own project.
- **Accepted for transitive deps:** registry semver/ranges/dist-tags
  (`^1.2.3`, `1.x`, `latest`, `*`), `npm:` aliases (registry-backed), and local
  `file:`/`link:`/symlink deps — including monorepo siblings linked by `fynpo`.

To **disable** the policy (e.g. you genuinely need a transitive git/URL dep),
turn it off in `package.json`:

```json
{
  "fyn": {
    "enforceRegistryDeps": false
  }
}
```

or per-invocation on the command line:

```sh
fyn install --no-enforce-registry-deps
```

The CLI flag takes precedence over the `package.json` setting, which takes
precedence over the default (on).

This is independent of the lifecycle-script controls above: `allowScripts` /
`allowTopLevelScripts` decide whether *scripts run*, while `enforceRegistryDeps`
decides whether a transitive package is *allowed at all*.

### Thank you `npm`

Node Package Manager is a very large and complex piece of software. Developing `fyn` was 10 times easier because of the generous open source software from the community, especially the individual packages that are part of `npm`.

Other than benefiting from the massive package ecosystem and all the documents from `npm`, these are the concrete packages from `npm` that `fyn` is using directly.

- [node-tar] - for untaring `tgz` files.
- [semver] - for handling Semver versions.
- [pacote] - for retrieving `npm` package data.
- [ini] - for handling `ini` config files.
- [npm-packlist] - for filtering files according to npm ignore rules.
- [@npmcli/run-script] - for running package scripts.
- [npmlog] - for offering the `run` command as a convenience.
- And all the other packages they depend on.

## License

Copyright (c) 2015-2021, WalmartLabs

Licensed under the [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0).

[node_options]: https://nodejs.org/dist/latest-v8.x/docs/api/cli.html#cli_node_options_options
[`-r` option]: https://nodejs.org/docs/latest-v6.x/api/cli.html#cli_r_require_module
[fyn-demo-gif]: ./images/fyn-demo.gif
[ini]: https://www.npmjs.com/package/ini
[node_preserve_symlinks]: https://nodejs.org/docs/latest-v8.x/api/cli.html#cli_node_preserve_symlinks_1
[require-at]: https://www.npmjs.com/package/require-at
[build-image]: https://github.com/jchip/fynjs/actions/workflows/ci.yml/badge.svg
[build-url]: https://github.com/jchip/fynjs/actions/workflows/ci.yml
[npm-image]: https://badge.fury.io/js/fyn.svg
[npm-url]: https://npmjs.org/package/fyn
[apache-2.0-blue-image]: https://img.shields.io/badge/License-Apache%202.0-blue.svg
[apache-2.0-url]: https://www.apache.org/licenses/LICENSE-2.0
[npm scripts]: https://docs.npmjs.com/misc/scripts
[node-tar]: https://www.npmjs.com/package/tar
[semver]: https://www.npmjs.com/package/semver
[pacote]: https://www.npmjs.com/package/pacote
[ini]: https://www.npmjs.com/package/ini
[npm-packlist]: https://www.npmjs.com/package/npm-packlist
[pnpm]: https://www.npmjs.com/package/pnpm
[npm]: https://www.npmjs.com/package/npm
[lerna]: https://www.npmjs.com/package/lerna
[fynpo]: https://www.npmjs.com/package/fynpo
[npm link]: https://docs.npmjs.com/cli/link.html
[@npmcli/run-script]: https://www.npmjs.com/package/@npmcli/run-script
[npmlog]: https://www.npmjs.com/package/npmlog
