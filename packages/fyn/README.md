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
scripts (`preinstall`, `install`, `postinstall`) during install unless the package
came from a configured registry (the primary `registry` or a `@scope:registry`) or
is a local `file:`/`link:`/symlink dependency. That is the default policy; see
[`fyn.scriptPolicy`](#choosing-a-trust-model-fynscriptpolicy) for the stricter
npm 12-style model, where a registry package needs approval too.

Packages pulled from other sources — `github:`, git URLs (`git+https`, `git+ssh`,
…), and `http(s)` tarball URLs — have their lifecycle scripts **skipped by default**,
and `fyn` prints a warning showing how to allow them.

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
- So `esbuild` above is "those two release lines, any script", `canvas` is "any
  version, `install` only", and `lodash` is "any version, any script".
- **`false`** denies a package outright. A denial wins over everything: any other
  entry matching the same package, `allowTopLevelScripts`, an `approve --all`, and
  an approval in a wider scope. Removing the `false` is the only way to undo it.

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

The rule above — a registry package is trusted, a git/URL package is not — is one of three
policies. `fyn.scriptPolicy` selects which:

| mode | registry packages | git/URL packages | workspace-local packages |
|---|---|---|---|
| `"source"` *(default)* | run their scripts | need an allowlist entry | run their scripts |
| `"review"` | need an allowlist entry | need an allowlist entry | run their scripts |
| `"off"` | nothing runs | nothing runs | nothing runs |

`"source"` trusts *provenance*: where a package came from. `"review"` trusts *review*: whether
someone approved this exact code — npm 12's model, and the one that covers a compromised
release of an ordinary dependency. `"off"` is npm's `ignore-scripts`, and like npm's it wins
over the allowlist rather than being overridden by it.

```json
{
  "fyn": {
    "scriptPolicy": "review",
    "allowScripts": { "sharp@0.34.4": ["install"] }
  }
}
```

Or for one run: `fyn install --script-policy=review`.

Workspace-local packages — `file:`/`link:` deps and fynpo siblings — are exempt in **every**
mode, including `"review"`: an allowlist is a review gate on code you did not write, and
monorepo source is reviewed by the pull request that changed it. Set
`fyn.reviewLocalPackages: true` if you want them reviewed like anything else. A local path
declared *by* a git package is not workspace-local and stays blocked.

Switching to `"review"` stops every package with a native build step from running its install
scripts until it is approved. To see that cost before paying it:

```
fyn install --allow-scripts-pending
```

which installs exactly as before but also reports which packages `"review"` would ask you to
approve.

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
package may add its own but a `false` at any scope is final. For `scriptPolicy` a package may
only *tighten* what the repo asked for (`"review"` → `"off"`, never back to `"source"`); a CLI
flag is a one-off and overrides outright.

#### Reviewing with `fyn install-scripts`

```
fyn install-scripts ls                 # what is awaiting review (--json for data)
fyn install-scripts approve <pkg>...   # allow those packages (--all for everything pending)
fyn install-scripts deny <pkg>...      # write an explicit false
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
