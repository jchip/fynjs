# fynpo reference

fynpo is a monorepo manager CLI for npm packages. It discovers packages, installs them with `fyn` in dependency order, runs npm scripts across them, and drives a conventional-commit release flow (changelog, version bump, publish).

## Install and invocation

The package has no `main` or `exports`. It ships only the `fynpo` executable (`bin/fynpo.js`). There is no JS API.

```
fynpo [command] [options]
```

- Requires Node `^22.22.2 || ^24.15.0 || >=26.0.0`.
- With no command, `bootstrap` runs. `fynpo --help` and `fynpo --version` (or `-v`, `-V`) show the root help and version instead.
- `fynpo --help <command>` shows help for one command. `-h` and `-?` are aliases of `--help`.
- `--no-<flag>` negates a boolean flag, for example `--no-bail`.
- Arguments after `--` are not forwarded to package scripts. `fynpo run t -- --foo` runs `npm run t` with no extra args (the code reads `opts["--"]`, which the parser never sets).
- Errors thrown out of a command that does not handle them end in `fynpo failed` plus the stack on stderr, exit code 1.

## Commands

| Command | Alias | Purpose |
| --- | --- | --- |
| `bootstrap` | `b` | Run `fyn install` in every package in topological order. Default command. |
| `local` | `l` | Builds the dependency graph and returns. It installs and changes nothing. |
| `prepare` | `p` | Apply the versions in CHANGELOG.md to package.json files, bootstrap, run `fynpo:prepare` hooks, commit `[Publish]`. |
| `updated` | `u` | Print packages changed since the last release. |
| `changelog` | `c` | Write a new CHANGELOG.md entry from commits, optionally with version bumps. |
| `run <script>` | `r` | Run an npm script in each package that defines it. |
| `version` | `v` | Write the changelog entry, bump package versions, and commit. |
| `publish` | `pb` | Pack and `npm publish` the packages named in the HEAD `[Publish]` commit, then tag. |
| `init` | `i` | Prepare a repo for fynpo. |
| `commitlint` | `cl` | Lint a commit message against the configured rules. |

Typical release flow: `fynpo changelog`, then `fynpo prepare`, then `fynpo publish`. `fynpo version` is a one-step alternative to `changelog` plus `prepare` without the bootstrap and hooks.

### Config bootstrap on first use

Every command except `init` first searches for config (see Config file). When none is found anywhere up the tree, fynpo writes `fynpo.json` into the current directory with this content and continues:

```json
{ "changeLogMarkers": ["## Packages", "## Commits"], "command": { "publish": { "tags": {}, "versionTagging": {} } } }
```

If the file exists but no config could be loaded from it, fynpo logs an error and throws `Unable to load fynpo config from existing file <path>` instead of overwriting it.

## Global options

Defined at the root. Each is accepted only by the commands in the last column. Values here are merged with the config file: command line values override same-named top-level config keys, and CLI defaults (for example `concurrency` 6) also override them.

| Option | Alias | Type | Default | Commands | Behavior |
| --- | --- | --- | --- | --- | --- |
| `--cwd <path>` | | string | process cwd | root | Sets the starting directory. Logs `Setting CWD to <path>` and calls `process.chdir`. The fynpo top directory (where the config file was found) then replaces it. `init` and `commitlint` use only their own parsed options and did not apply `--cwd` when tested. |
| `--ignore <names..>` | `-i` | string list | none | bootstrap, local, run | Packages to skip. Each entry matches package name, path, or `name@version`. |
| `--scope <scopes..>` | `-s` | string list | none | bootstrap, local, run | Keep only packages whose npm scope is listed. The `@` is optional. Unscoped packages are always dropped once `--scope` is given. Implemented by adding the out-of-scope names to `ignore`. |
| `--deps [n]` | `-d` | number | `10` | bootstrap, local, run | Declared as "level of deps to include even if ignored". No code reads it. It has no effect. |
| `--commit [bool]` | | boolean | `true` | changelog, version, prepare | Commit the generated changes. `--no-commit` writes files and skips the commit. |
| `--force-publish <names..>` | `--fp` | string list | none | updated, changelog, version | Treat these packages as changed. `*` forces all. |
| `--since <ref>` | | string | none | updated, changelog, version | Use this commit-ish as the change boundary instead of the latest release tag. |
| `--only <names..>` | `-o` | string list | none | bootstrap, local, run, updated, changelog, version, prepare | Limit to these packages. See Selection. For releases, version lock groups expand. |
| `--ignore-changes <globs..>` | `--ic` | string list | none | updated, changelog, version | Minimatch patterns (`matchBase`, `dot`) for files to ignore in change detection and commit collation. |
| `--save-log` | `--sl` | flag | off | all | Write `fynpo-debug.log` in the current directory. Only `bootstrap` reads it (it is also written whenever bootstrap fails). |
| `--version` | `-V`, `-v` | flag | | root | Print the version. |
| `--help` | `-h`, `-?` | string list | | root | Print help. |

Because `--only`, `--ignore`, `--scope` and others are flat option names, the same names at the top level of the config file act as defaults for the commands that read them (for example `"ignore": ["pkg-demo"]`).

## `fynpo bootstrap`

```
fynpo bootstrap [--build] [--concurrency <n>] [--skip <names..>]
```

| Option | Alias | Type | Default | Behavior |
| --- | --- | --- | --- | --- |
| `--build [bool]` | | boolean | `true` | Accepted and passed to the bootstrap step, which does not read it. `--no-build` changes nothing in fynpo. The fyn side runs `build` after install via `command.bootstrap.npmRunScripts`. |
| `--concurrency [n]` | `--cc` | number | `6` | Packages installed at once. No range check. |
| `--skip <names..>` | | string list | none | Package names (name only) logged as `bootstrap skipping` and not installed. They are not ignored, so dependents still order after them. |

Plus the global options `--ignore`, `--scope`, `--only`, `--deps`, `--save-log`.

Behavior:

- Packages run in topological order. A package starts only after its local dependencies finish. A cycle is logged as `detected circular deps a > *b*` and the members are still scheduled. See Topological ordering.
- `--only` and `--ignore` filtering is applied in the scheduler. `--only` pulls the selected packages' local dependencies in transitively.
- Per package it runs, in the package directory: `node <fyn bin> [fynOpts] [-q d] install --sl --no-build-local --audit-file '<path>' --meta-mem=http://localhost:<port>`. In CI it prepends `--pg simple`. `-q d` is added unless `-q` or `--log-level` is in the fyn options. fyn is resolved from fynpo's own dependency (`fyn/bin/fyn.mjs`), not from PATH.
- A warning is logged when a globally installed fyn has a different version from the bundled one.
- fyn instances share a localhost HTTP server for package-meta memoization (`--meta-mem`). If the server fails to start, the option is omitted.
- The first failure stops scheduling (`stopOnError`). Running installs finish. Each failure prints a framed block with the primary error line, the failing command, exit code, and the path `<pkg>/fyn-debug.log`. In CI it also prints stdout and stderr (last 50 lines of each when longer than 100).
- After a successful run, a security audit summary is printed from the per-package audit files fyn wrote (`No audit reports found from bootstrap.` when none). Up to 20 packages with vulnerabilities are listed.
- If `.fynpo-data.json` `__timestamp` changed during the run (fyn recorded new indirect local deps), fynpo logs `fynpo data changed - running bootstrap again` and runs once more. Commit that file.
- Output ends with `bootstrap completed in <s>secs` or `bootstrap failed in <s>secs`.
- Exit code: `0` on success, `1` on any failure or thrown error. On failure, or with `--save-log`, `fynpo-debug.log` is written and its path is logged.
- An error that looks like a fynpo import bug (`__WEBPACK_IMPORTED_MODULE_`, `is not a constructor`, or a not-a-function style error from fynpo's own stack) logs `*** INTERNAL FYNPO BUG DETECTED ***` first.

Config keys read: `packageCache.default` (build cache, see Caching), `caching`, `noFynLocal`, `packages`, `resolutions` (cache input), `fynOpts` (see below).

`fynOpts` (string array of fyn CLI options): `bootstrap` reads `fynOpts` only from the parsed command line options, and no command line option by that name is defined, so a config `fynOpts` does not reach `fynpo bootstrap`. `prepare` reads `fynOpts` from the merged config and passes it to its internal bootstrap.

## `fynpo local`

Builds the graph (printing the discovery notice) and returns. No installs, no file changes. It accepts `--ignore`, `--scope`, `--only`, `--deps`.

## `fynpo run <script>`

```
fynpo run <script> [--stream] [--parallel] [--prefix] [--bail] [--concurrency <n>] [--sort] [--cache]
```

`<script>` is required. Without it the parser reports `Not enough arguments for command 'run'`.

| Option | Alias | Type | Default | Behavior |
| --- | --- | --- | --- | --- |
| `--stream` | | flag | off | Stream child output live, line prefixed with the package name, instead of printing each package's buffered output in a box when it finishes. |
| `--parallel` | | flag | off | Ignore topological order. Run up to `concurrency` packages at once. Takes precedence over `--sort`. |
| `--prefix [bool]` | | boolean | `true` | Prefix streamed lines with the package name, colored by a rotating palette. Only matters with `--stream`. |
| `--bail [bool]` | | boolean | `true` | When a package script fails, packages not yet started are skipped. Packages already running finish. `--no-bail` runs every package and reports all failures at the end. |
| `--concurrency [n]` | `--cc` | number | `6` | Packages at once. An integer from 1 to 100 is used. Anything else falls back to `3`. |
| `--sort [bool]` | | boolean | `true` | Run in topological order. `--no-sort` runs the candidate list in its listed order with no waiting on dependencies, using the same `concurrency` (logged as `lexical order`). In effect it behaves like `--parallel`. |
| `--cache` | | flag | off | Use the lifecycle cache. Needs `lifecycleCache.default` rules. See Caching. |

Plus the global options `--ignore`, `--scope`, `--only`, `--deps`, `--save-log`.

Behavior:

1. Candidates are packages whose `package.json` has `scripts.<script>`. Then `--only`, `--ignore` and `--scope` narrow them, and unmanaged packages (nested, see Discovery) are removed. `--sort`, `--no-sort` and `--parallel` never change which packages run.
2. With no candidates: `No packages found with script <script>` is logged and the command returns. When the script exists but the selection removed all of it: `No packages left to run script <script> after --only/--ignore`.
3. Before running, stale local dependency copies produce a warning (see Stale local dependency check). It never fails the run.
4. Each package runs `npm run <script>` in its directory (`npm` is hard coded as the client).
5. If a package has no `node_modules` directory, fyn installs it first (`installing node_modules in <path> to run script <script>`). Set `lifecycleCache.default.requireDeps` to `false` to skip this.
6. Each package's start is logged in a box. A finished package logs its box plus its stdout and stderr (not with `--stream`).
7. Summary on success: `Finished run npm script '<script>' in N package(s) in <s>s:` with the names of the packages that actually ran.
8. Exit code: `0` when all scripts pass. On failure it logs each failing package with its exit code and exits with the highest failing code, at least `1`. `process.exit(1)` for an exception thrown inside the run.
9. Config `continueOnError: true` (top level) keeps running packages after a failure even with bail on. It has no CLI flag.

Top-level config keys `concurrency` and `sort` are overridden by the CLI defaults (6 and true) for this command, and `command.run` is not read.

## `fynpo updated`

Lists packages changed since the release boundary. Options: `--force-publish`, `--since`, `--only`, `--ignore-changes`.

Output: `No changed packages!` or `Changed packages:` followed by ` - <name>` lines. The exit code is `0` either way. See Change detection.

## `fynpo changelog`

```
fynpo changelog [--publish] [--tag] [--confirm-version-bumps]
```

| Option | Alias | Type | Default | Behavior |
| --- | --- | --- | --- | --- |
| `--publish` | | flag | off | Also write the new versions into package.json files and create the `[Publish]` commit (and tags with `--tag`). Without it, only CHANGELOG.md is committed. |
| `--tag` | | flag | off | Create a git tag `<name>@<version>` for each released package. Takes effect only together with `--publish`. |
| `--confirm-version-bumps [bool]` | `--cvb` | boolean | `true` | Ask before minor, major and indirect bumps. `--no-confirm-version-bumps` or `--no-cvb` skips all prompts. |

Plus `--commit`, `--force-publish`, `--since`, `--only`, `--ignore-changes`, `--cwd`. The command switches to the fynpo top directory.

Steps:

1. Errors out with `No commits in this repository. Please commit something before using changelog.` if the repo has no commits, and exits `1` on a detached HEAD (`Detached git HEAD, please checkout a branch to choose versions.`).
2. Change detection and release boundary (see Change detection). Prints `No changed packages to update changelog.` and returns when nothing changed.
3. Collates commits per package and determines bumps (see Version bumps).
4. Prompts (skipped without a TTY, in CI, or with `--no-cvb`):
   - Major: `OK to bump major versions? [y/N]`. Anything but `y` or `yes` stops the release with exit code `1`.
   - Minor: `Bump minor versions? [Y/n]`. `n` or `no` turns every minor bump into patch.
   - Indirect bumps (packages with no commits of their own, bumped by a dependency or lock): `Approve [a]ll, [s]elect, or [n]one? [A/s/n]`. Skipped packages are dropped from the changelog and get only a dependency range update in `prepare`. Lock groups get one answer. Input closed or Ctrl-C cancels with exit code `1`.
   - Without a terminal, minor and major bumps proceed with the bump types from the commit messages and a warning is logged.
5. Writes a new entry at the top of `CHANGELOG.md` (format below). If the entry equals the previous one apart from the date, nothing is written and `Changelog is already up to date; no changes to commit` is printed.
6. Commit: `git add <CHANGELOG.md> && git commit -n -m "Update changelog"`. Skipped (with a warning) when `--no-commit` or when the working tree is not clean.
7. With `--publish`: package.json versions are written and the commit is `[Publish]` instead (see `prepare` commit format).

CHANGELOG.md entry format:

```
# M/D/YYYY

## Packages

### Directly Updated        (only present when there are indirect bumps)

-   `name@1.2.3` `(1.2.2 => 1.2.3)`

### Fynpo Updated           (indirect bumps)

## Commits

-   `packages/<dir>`

    -   <commit subject> [commit](<repo-url>/commit/<sha>)
```

- Repo URL comes from the root `package.json` `repository.url` (trailing `.git` removed). Default text is `REPO_URL`. A trailing `(#123)` in a subject becomes a PR link.
- Commits excluded: subjects starting `Merge pull request #`, subjects containing `[no-changelog]`, reverted commits (with their reverts), and a commit named `Update changelog` that touches only the changelog file.
- Private packages and packages failing the publish filter get no `## Packages` line.
- Files outside any package are listed under their top-level directory, root files under `MISC`.

## `fynpo version`

```
fynpo version [--tag]
```

Same detection, collation and bump logic as `changelog`, with no prompts. It writes the changelog entry, bumps package.json versions and dependency ranges, then commits `CHANGELOG.md` and the package files as `[Publish]` (or `[Publish][Selective]`). Options: `--tag` (git tag `<name>@<version>` per package), `--commit`, `--force-publish`, `--since`, `--only`, `--ignore-changes`.

- Same no-commits and detached HEAD errors as `changelog`.
- `No changed packages to version` when nothing changed.
- It reads `CHANGELOG.md` relative to the process directory (it does not switch to the top directory), falling back to the top directory path with empty content.
- It reads `command.version`, `command.changelog`, `command.updated`, and `command.prepare` for option defaults.
- If no package ends up with a version (all private or filtered), it logs `No versions found in CHANGELOG.md` and the following commit step throws a TypeError. The same applies to `changelog --publish`.

## `fynpo prepare`

```
fynpo prepare [--force] [--tag] [--indirect-bumps] [--commit-msg <msg>]
```

| Option | Alias | Type | Default | Behavior |
| --- | --- | --- | --- | --- |
| `--force` | | flag | off | Continue to bootstrap and hooks even when no version or dependency range changed. |
| `--tag` | | flag | off | Create a git tag `<name>@<version>` per released package. |
| `--indirect-bumps [bool]` | | boolean | unset (acts as true) | `--no-indirect-bumps` ignores the `### Fynpo Updated` section of the changelog. Those packages only get dependency range updates. Config key `indirectBumps: false` does the same. |
| `--commit-msg <msg>` | | string | none | Extra text appended to the `[Publish]` commit body after the package list. |

Plus `--commit`, `--only`, `--cwd`. The command switches to the fynpo top directory.

Steps and rules:

1. The working tree must be clean (`git status --porcelain --untracked-files=all`). Otherwise `PrepareError`: `Cannot prepare with a dirty working tree. Run 'git status --short' to inspect it. Commit or stash your changes first.`
2. Reads the newest changelog entry, the lines from the first `changeLogMarkers[0]` line to the first `changeLogMarkers[1]` line (default `## Packages` and `## Commits`). A package version is matched by the regex ``[ `]<name>@<x.y.z><suffix>[ `]``.
3. No versions found: logs `No versions found in CHANGELOG.md`, or `No packages were discovered, so nothing could be matched against CHANGELOG.md.` when discovery found nothing. It returns without an error code.
4. For each package whose changelog version differs from its package.json version: private packages are skipped with a warning. Otherwise `version` is set, `publishConfig.tag` is set from `command.publish.tags` / `versionTagging` (see Publish tags), and dependency ranges to every released package are rewritten.
5. Dependency range rewrite: sections `dependencies`, `optionalDependencies`, `peerDependencies`, `devDependencies`. A range starting with `^` or `~` keeps that prefix, an exact version stays exact, and ranges that start with anything else non-numeric (`*`, `>=`, `workspace:`...) are untouched.
6. Packages not being released get the same range rewrite but no version bump (warning `Updated <name> dependency range - not released, will bump next time`).
7. If nothing changed and `--force` is not set: `Nothing to update - every package already has the version CHANGELOG.md asks for`.
8. Writes package.json files, then bootstraps (full graph, ignoring `--only`, `--ignore` and `--scope`; repeats once if `.fynpo-data.json` changed), then runs the npm script `fynpo:prepare` in every package that has it (topological order, concurrency 6, bail, no cache). Failure of either raises `PrepareError` and no commit or tags are made.
9. Commits every changed tracked file and every untracked non-ignored file (`git add -- ...`, `git commit -n`). Skipped with a warning when `--no-commit` or the tree was unclean.
10. Commit format: first `-m` is `[Publish]` (or `[Publish][Selective]` when `--only` is used), second `-m` lists ` - <name>@<version>` lines, then any `--commit-msg`.
11. If HEAD is already an unpushed `[Publish]` commit with the identical package list, `git commit --amend` is used (no new commit). Existing tags pointing at the old commit are moved. A tag that already exists elsewhere raises `Cannot amend prepare: tag <tag> already points elsewhere.`
12. `--tag` creates the `<name>@<version>` tags sequentially.
13. Result messages: `Updated N package version(s) across M file(s)`, plus `committed`, `release commit amended`, `and K tag(s) created`, or `not committed`.
14. A `PrepareError` is logged as an error and sets exit code `1`.

## `fynpo publish`

```
fynpo publish [--dist-tag <tag>] [--dry-run] [--push]
```

| Option | Type | Default | Behavior |
| --- | --- | --- | --- |
| `--dist-tag <tag>` | string | none | Passed as `npm publish --tag <tag>` for every package. A per package `publishConfig.tag` in package.json is still honored by npm. |
| `--dry-run` | flag | off | Packs the tarballs and runs the scripts, skips `npm publish`. The release tag commands are prefixed with `echo DRY RUN` so no tag is created or pushed. Tarballs stay on disk. |
| `--push [bool]` | boolean | `true` | Push the release tag. `--no-push` creates the tag locally and prints the push command. |

Plus global config keys. `publish` accepts no `--only`, `--ignore` or `--commit` flags.

Flow:

1. Fails with exit `1` if `HEAD` already has a release tag matching the full or the `selective-` tag pattern (`HEAD commit already has a release tag...`).
2. Reads HEAD. If the commit message does not contain `[Publish]`, logs `Head git commit message doesn't have '[Publish]' - skip publish` and, because the list is empty, prints `No changed packages to publish!` and exits `1`.
3. A package is published only when all hold: its `package.json` changed in the HEAD commit, its `name` appears as a ` - name@version` line in the HEAD message body, it is not `"private": true`, and it passes the publish filter (see Publish jurisdiction).
4. A message containing `[Publish][Selective]` marks a selective release (see Tags).
5. Stale local dependency check (hard stop, see below).
6. Runs the root package.json `prepublishOnly` script (via fyn run), if defined.
7. In topological order, one package at a time: runs `prepublishOnly` (via `fyn run`), `npm pack`, then scripts `publish` and `postpublish`, each only when defined. `FYNPO_PUBLISH=1` is set in the environment while these scripts run, then restored.
8. Unless `--dry-run`, runs `npm publish [--tag <tag>] <tarball>` for each tarball in order and deletes the tarball on success. A failure where npm reports `EPUBLISHCONFLICT` (or `cannot publish over the previously published`) for the exact version being published is treated as already published: it is reported and does not count as a failure. If npm names a different conflicting version, it is a failure.
9. If any real failure happened: `Some packages failed to publish - skipping git release tag`, exit `1`.
10. Otherwise creates the annotated tag `git tag -a <tag> -m "Release Tag"`, then (with `--push`) `git push <remote> <tag>`. The remote is the branch upstream's remote, else `origin`, else the only remote, else none. With none: `Unable to determine a git remote - release tag <tag> created locally only`. Other thrown errors: `Failure encountered publishing packages`, exit `1`.

### Stale local dependency check

fyn installs a local package as a copy, so a rebuilt `dist` leaves consumers with the old copy until the next bootstrap. For every package to publish, fynpo compares each local dependency's source with the installed copy in `<pkg>/node_modules/<dep>`.

- Compared: a fixed set of manifest fields (`version`, `type`, `main`, `module`, `browser`, `types`, `typings`, `exports`, `imports`, `bin`, `dependencies`, `peerDependencies`, `optionalDependencies`, `engines`) and the bytes of every installed file (same inode counts as equal, `package.json` and `.map` files are skipped). Only copies that are fyn local links of that source are checked.
- `fynpo run` logs a warning: `WARNING: N local package(s) changed since installed - run 'fynpo bootstrap' to refresh`.
- `fynpo publish` exits `1` when any file differs. A manifest-only difference is a warning. Set `FYNPO_ALLOW_STALE_LOCAL_DEPS` (any non-empty value) to publish anyway.

## `fynpo init`

```
fynpo init [--commitlint]
```

| Option | Type | Default | Behavior |
| --- | --- | --- | --- |
| `--commitlint` | flag | off | Add commitlint setup. |

Steps:

1. Loads or creates config. With `--commitlint` and no config found, copies the template `fynpo.config.js` (includes the `commitlint` block). Otherwise creates `fynpo.json`.
2. Runs `git init` if the directory is not a git repo.
3. Requires a `package.json` in the config's directory. Missing: logs `Could not load package.json from the directory <dir>.` and exits `1`.
4. With `--commitlint`: adds `@commitlint/config-conventional` `^12.0.1` and `husky` `^5.1.3` (to `dependencies` when already there, else `devDependencies`) and appends `husky install` to `scripts.prepare`. Rewrites `package.json`. This also applies when a config with a `commitlint` key already exists.
5. With `--commitlint` and a JSON config without a `commitlint` key: writes `fynpo.config.js` (same content plus the generated commitlint block, formatted with prettier when installed) and asks you to delete the JSON file.
6. Creates `packages/`.
7. Prints next steps (`fyn`, and the husky hook command `npx husky add .husky/commit-msg 'npx --no-install fynpo commitlint --edit $1'` when `--commitlint` is set).

`init` searches upward for existing config. Run it in an empty directory to avoid modifying a parent repo.

## `fynpo commitlint`

```
fynpo commitlint [--config <path>] [--color] [--edit <file>] [--verbose]
```

| Option | Alias | Type | Default | Behavior |
| --- | --- | --- | --- | --- |
| `--config <path>` | | string | none | Config file to take lint fields from. Its top level keys are used (not a nested `commitlint` key). Without it, the `commitlint` key of the fynpo config is used. |
| `--color [bool]` | `-c` | boolean | `true` | Colored output. `--no-color` disables. |
| `--edit <file>` | `-e` | string | none | Read the message from this file via `@commitlint/read`. The option text says it falls back to `./.git/COMMIT_EDITMSG`. Without `--edit`, the message is read from stdin. |
| `--verbose` | `-V` | flag | off | Print reports for messages with no problems too. |

Behavior:

- Lint fields read: `extends`, `rules`, `plugins`, `parserPreset`, `formatter`, `ignores`, `defaultIgnores`, `helpUrl`. `extends` resolves with prefix `commitlint-config`. `formatter` defaults to `@commitlint/format`. Empty rules produce an `empty-rules` error.
- Empty input: logs `input is required.` and exits `1`. A missing formatter module: `Using format <name>, but cannot find the module.` exit `1`.
- Prints the formatted report. Exit code `1` when any message is invalid, otherwise `0`.
- The template header pattern is `/^\[([^\]]+)\] ?(\[[^\]]+\])? +(.+)$/` with parts `type`, `scope`, `subject`, so messages look like `[patch] fix thing`. The template rule allows types `patch`, `minor`, `major`, `chore` (level 2). Messages starting with `[Publish]` or containing `Update changelog` are ignored.

## Config file

### Location and format

fynpo searches from the working directory upward, up to 50 levels, and stops at the first directory that contains any of these, in this order:

1. `fynpo.config.js` (loaded with `require`; the module's `default` export is used when present)
2. `fynpo.config.json`
3. `fynpo.json`
4. `lerna.json`

A directory containing a file named `.no-fynpo` stops the search with no config. fynpo accepts any `lerna.json`. When it has no `fynpo` key, fynpo adds `"fynpo": true` and rewrites the file. The directory that holds the config file is the monorepo top directory. All relative paths and git commands use it as the working directory.

A JSON syntax error, or a `.js` config that throws, prints a framed `INVALID CONFIG FILE` or `CONFIG FILE FAILED TO LOAD` banner as a warning and exits `1`. `fyn` reads the same files with the same search.

All keys below are top-level keys of that file.

### Merge rules

- Each command builds its options as: config keys, overridden by parsed CLI options (including CLI defaults), with `cwd` set to the top directory.
- `changelog`, `version`, `updated`, `prepare`, `init` and `commitlint` additionally fill in missing keys from `command.<name>` (`version` also reads `command.changelog`, `command.updated`, `command.prepare`; `changelog` also reads `command.updated`). These fill only keys not already set, so a key that has a CLI default (`commit`, `confirmVersionBumps`) cannot be changed this way.
- `bootstrap`, `run`, `local` and `publish` do not read `command.<name>`.

### `packages`

Controls discovery and publish jurisdiction. Two shapes.

Array (legacy): `["packages/*", "samples/*"]`. Entries are additive `include` paths (auto-search stays on) and also become the publish allow list: each entry is a `path:` ref unless it starts with `id:`, `name:` or `path:`.

Object:

| Key | Type | Default | Behavior |
| --- | --- | --- | --- |
| `autoSearch` | boolean or object | on | `false` turns auto-search off. An object takes the keys below. Anything else (`true`, absent) is on. |
| `autoSearch.enable` | boolean | `true` | `false` turns auto-search off. |
| `autoSearch.respectGitignore` | boolean | `false` | When `true`, auto-search skips gitignored paths. Does not affect the publish veto. |
| `autoSearch.stopOnPackageJsonFound` | boolean | `true` | Auto-search stops descending below a found package.json (except paths matched by `include`). `false` also finds packages nested below other packages. |
| `include` | string or string[] | `[]`; `["packages/*"]` when auto-search is off | Minimatch patterns on package directories. With auto-search on they add packages found below package boundaries and mark them managed. With auto-search off they are the only scan paths. |
| `exclude` | string or string[] | `[]` | Minimatch patterns on package directories. Matching directories are not scanned and their package.json is not discovered. Applies in every mode. |
| `publishInclude` | string or string[] | `[]` | Publish allow list of package refs. Empty means every discovered package is eligible. Non-empty means only matching packages are. |
| `publishExclude` | string or string[] | `[]` | Publish deny list, applied after the allow list. It always wins. |

Blank or non-string entries are dropped. A single string is accepted for any list.

Top-level `patterns` (string array of minimatch patterns): when non-empty, scans exactly those patterns, auto-search off, and ignores `packages.include`. `packages.exclude` still applies.

Package refs (used by `publishInclude`, `publishExclude`, `versionLocks`, and `publishUtil` keys):

| Form | Matches |
| --- | --- |
| `name:<value>` or a bare `<value>` | package name |
| `id:<value>` or a bare value with `@` after position 0 | `name@version` |
| `path:<glob>` | package path from the top directory (minimatch) |
| `/<regex>/<flags>` as the value (for example `name:/^@scope\//`) | regex against the name, id or path, per the prefix |

An unknown prefix throws `package ref '<ref>' has unknown type '<x>' - must be 'id', 'path', or 'name'`. Path globs need the explicit `path:` prefix. A `:` splits the ref, so a value cannot contain a second `:`.

### `versionLocks`

`string[][]`: groups of package refs that always share one version bump. When any member changes, the whole group is pulled in with the highest bump in the group. `["*"]` (first element `*`) locks every package together at one repo-wide version bump (`lockAll`), and every managed package is treated as changed. A package in two groups logs `package <name> at <path> version is already locked`.

### Release keys

| Key | Type | Default | Behavior |
| --- | --- | --- | --- |
| `changeLogMarkers` | `[string, string]` | `["## Packages", "## Commits"]` | Lines bounding the package list in a changelog entry, read by `prepare`. |
| `indirectBumps` | boolean | true | `false` makes `prepare` skip the `### Fynpo Updated` section. |
| `versionCascade.bumpType` | `"patch"` or `"inherit"` | `"patch"` | How much of a dependency's bump a dependent takes. `patch` gives dependents a patch. `inherit` copies the dependency's bump type, except devDependencies which only patch. |
| `graduate` | string[] | `[]` | Package names (or `["*"]`) whose prerelease versions release as the plain version instead of the next prerelease. |
| `forcePublish` | string[] | `[]` | Same as `--force-publish`. |
| `ignoreChanges` | string[] | `[]` | Same as `--ignore-changes`. |
| `commitlint` | object | none | Lint config (see `commitlint`). Also read by version bump rules: `commitlint.minor` (default `["feat", "minor"]`), `commitlint.major` (default `["breaking", "major"]`), `commitlint.parserPreset.parserOpts`. |
| `noFynLocal` | string[] | `[]` | Package names never resolved as local packages in the graph. fyn reads this too. |
| `continueOnError` | boolean | false | See `run`. |
| `fynOpts` | string[] | none | Extra fyn CLI options for the install step of `prepare`'s bootstrap. |
| `resolutions` | object | none | Included in the build-cache input hash unless `input.includeResolutions` is `false`. fyn also reads it. |

### `command.publish`

| Key | Type | Default | Behavior |
| --- | --- | --- | --- |
| `gitTagTemplate` | string | `fynpo-rel-{YYYY}{MM}{DD}-{COMMIT}` | Release tag template. See Tags. |
| `tags` | object | `{}` | npm dist-tag assignment per package. See Publish tags. |
| `versionTagging` | object | `{}` | Keys are package names. Publishes each under tag `ver<major>`. |
| `allowForeignRepos` | boolean | false | Allow releasing packages that live in a nested git repo. Default skips them with a warning. |

### `command.bootstrap`, `publishUtil`, `fyn`, `centralDir`, `overrides`

These are read by fyn, not by the fynpo CLI, when fyn runs inside a fynpo repo:

- `command.bootstrap.npmRunScripts`: string, string array, or array of arrays (run the first existing script of each sub array), or `false`. Scripts fyn runs after install in a monorepo package. Default `["build"]`.
- `fyn.options`: object of fyn options applied to every fyn run. Precedence is CLI over rc over this block. `cwd` and `initCwd` are ignored, and the script policy keys (`allowScripts`, `denyScripts`, `allowTopLevelScripts`, `scriptPolicy`, `reviewLocalPackages`) have their own merge.
- `centralDir`: central package store path. Default `<top>/.fynpo/_store` (the main worktree's `.fynpo/_store` in a git linked worktree).
- `resolutions`, `overrides`: dependency overrides applied to all packages.
- `publishUtil`: object keyed by package ref, giving per package publish-util config. First matching ref wins.

## Caching

Caches the output of bootstrap (per package install and build) and of `fynpo run --cache`. Local and optional remote storage.

### Where rules are read

| Key | Used by | Notes |
| --- | --- | --- |
| `packageCache.default` | `bootstrap` | Label `bootstrap`. Caching runs only when this object is non-empty. |
| `lifecycleCache.default` | `run --cache` | Label `run-<script>`. Needs `--cache` and a non-empty object. `lifecycleCache.default.requireDeps: false` skips the automatic install. |

A cache rules object has `input` and `output`. `output` is required, otherwise copying to cache throws a TypeError (swallowed by the caller, no cache is saved).

`input`:

| Key | Type | Behavior |
| --- | --- | --- |
| `include` | string or string[] | Minimatch patterns of files to hash. No `include` means no files are hashed. |
| `exclude` | string or string[] | Patterns to drop after `include`. |
| `npmScripts` | string or string[] | `package.json` script names whose text is part of the hash. |
| `includeEnv` | string or string[] | Environment variable names and values in the hash. |
| `includeVersions` | string or string[] | Keys of `process.versions` to include (for example `node`). |
| `includeResolutions` | boolean | Default true. `false` leaves the config `resolutions` out. |
| `minimatchOptions` | object | Passed to minimatch. Default `{ "dot": true }`. |

`output`:

| Key | Type | Behavior |
| --- | --- | --- |
| `include`, `exclude`, `minimatchOptions` | as above | Files to store after the build. |
| `filesFromNpmPack` | boolean | Add the file list `npm pack` would produce, minus `exclude`. |

The input hash (sha256, base64url) covers the selected input files' hashes, env, versions, scripts, `resolutions`, the label, and for each local dependency its recorded input and output hashes. If any local dependency has no recorded cache meta, the package does a full build (`doing full build in '<path>'. missing cache meta for its dep`).

### `caching`

| Key | Type | Default | Behavior |
| --- | --- | --- | --- |
| `enable` | boolean | `true` | `false` disables caching. |
| `dir` | string | per-user cache dir for `fynpo` from `env-paths` | Local cache root. Layout `<dir>/<label>/<package name>/<inputHash>.json` and `files/<hash><ext>`. |
| `server` | string | none | Remote cache base URL. A trailing `/` is added. Meta is read from `<server><label>/<segmented hash>.json`. |
| `compression` | `"brotli"` or `"gzip"` | none (uncompressed) | Compress stored files (`.br`, `.gz`). Any other value throws `fynpo caching: unknown compression algorithm <x>`. |
| `alwaysUploadToRemote` | boolean | false | Upload to the remote outside CI. Without it uploads happen only in CI. |
| `pruning.highCount` | number | `20` | Prune when a package's cache dir has more than this many entries. |
| `pruning.keepCount` | number | `10` | Keep this many most recently accessed entries when pruning. |

Behavior:

- Local lookup first, then remote when `server` is set (10 s timeout). A hit restores the output files into the package, verifying hashes of uncompressed files. A restore failure logs `Failed restore from cache ... doing full bootstrap` and builds normally.
- Remote uploads use `PUT` and retry with `POST` after a `405`. The first remote failure logs once (`remote cache server failure`) and disables further remote calls in that process.
- Cache meta for dependents is kept in `<top>/.fynpo/_cache-meta/<label>/`.
- On a miss with earlier meta, a diff is written to `<package>/<label>-cache-diff.log`.

## Discovery

Packages are directories with a `package.json` that has a `name`.

1. Auto-search (default): scans the whole tree below the top directory. Skipped: `node_modules`, directories starting with `.`, the top level `package.json`, a `package.json` in a directory that also contains `fynpo.json` (a nested fynpo root), and paths matched by `packages.exclude`. With `respectGitignore: true`, gitignored paths are skipped too.
2. By default it stops descending below a found package. A package found under another package is `nested`. Nested packages are kept only when `include` matches them, and then they are managed.
3. With auto-search off: only directories matching `include` (default `packages/*`) are scanned.
4. A `package.json` with `"fynpo": false` is dropped. One without `name` is skipped.
5. Packages not managed (nested, not matched by `include`) join the graph and are bootstrapped, but `run`, changed-package detection, changelog, version, and publish skip them.
6. A package outside the repo's git ownership (a nested clone, submodule, or linked worktree with its own `.git`) cannot be released from this repo. It is skipped with a warning unless `command.publish.allowForeignRepos` is `true`.
7. Auto-search is announced when used: `Auto-search is enabled; "packages" include paths add to discovered packages - found N.` at info level, or a warning when N is zero.

The same name may exist at several paths. Within a name, versions sort newest first, managed before unmanaged, then by path. Release commands use the first managed copy.

Local dependency resolution: a dependency name in `dependencies`, `devDependencies` or `optionalDependencies` that is a local package resolves to the local copy whose version satisfies the range, or the first copy when none does. `peerDependencies` are never resolved. A name in `noFynLocal`, or a package.json `fyn.<section>.<name>` set to `false` or a string containing `no-fyn-local`, resolves from the registry. A `.fynpo-data.json` file at the top directory (written by fyn, key `indirects`) adds indirect relations.

## Selection

`--only`, `--ignore`, `--scope` for `bootstrap`, `local`, `run`:

- Entries match package name, path, or `name@version`.
- `ignore` drops a package at any depth, including as a dependency of a selected package.
- `only` applies to the top level of the selection. The selected packages' local dependencies are included transitively.

For releases (`updated`, `changelog`, `version`, `prepare`) `--only` makes a selective release:

- Names must exist, else `--only names packages that do not exist here: <names>` and exit `1`.
- The selection expands across `versionLocks` groups.
- The commit subject is `[Publish][Selective]`, and tags use the `selective-` prefix, so the changelog boundary stays at the last full release.
- Commits already covered by an earlier selective release are not counted again for the packages it listed.

## Topological ordering

- Order is by local dependencies from `dependencies` and `devDependencies`. `optionalDependencies` and `peerDependencies` edges are ignored for ordering.
- Packages with no local dependencies come first. Cycle members are detected, then ordering is recomputed ignoring edges to cycle members so they still get scheduled. A cycle is logged as `detected circular deps a > *b*`.
- `bootstrap`, `run` (with sort), and `publish` use it. Concurrency applies within the constraint that a package waits for its pending dependencies.

## Change detection

Used by `updated`, `changelog`, `version`.

1. Boundary: `--since <ref>` when given. It must resolve to a commit and be an ancestor of HEAD, else `Invalid --since Git ref '<ref>': it must resolve to a commit.` or `--since Git ref '<ref>' resolves to <sha>, which is not an ancestor of HEAD.` Otherwise the latest release tag: `git describe --tags --long --first-parent --match <pattern>`, retried without `--first-parent`. `<pattern>` is `gitTagTemplate` with every `{token}` replaced by `*`.
2. No matching tag (and no tags at all): every publishable package counts as changed and all commits are in range.
3. Tags exist but none match the template: fynpo looks for a `[Publish]` commit that has tags. On a TTY it asks `Use this commit as the release boundary? [y/N]`. In CI or without a TTY, or if declined or none found, it throws with a message telling you to pass `--since <ref>`.
4. No commits since the boundary and no `--force-publish`: `No commits since previous release. Skipping change detection`.
5. A package changed when `git diff --name-only <boundary>...HEAD -- <path>` lists a file not removed by `ignoreChanges`.
6. Added to the changed set: force-published packages, members of version lock groups, and dependents of changed packages (when the dependent passes the publish filter). `--force-publish *` or `versionLocks: ["*"]` makes every publishable package changed.
7. Only packages that pass the publish filter, are managed, and are not in a foreign repo are considered. `Excluded N package(s) from publishing` is logged.

## Version bumps

Per package, from its commits since the boundary. The highest wins.

| Bump | Trigger |
| --- | --- |
| major | header `type` in `commitlint.major` (default `breaking`, `major`), or the message contains `[maj` |
| minor | header `type` in `commitlint.minor` (default `feat`, `minor`), or the message contains `[min` |
| patch | everything else |

Header parsing uses `commitlint.parserPreset.parserOpts` (`headerPattern`, `headerCorrespondence`), defaulting to `/^\[([^\]]+)\] ?(\[[^\]]+\])? +(.+)$/` with `type, scope, subject`.

Then:

- Version lock group members take at least the bump of the member that changed.
- Dependents of a bumped package are bumped too (`versionCascade.bumpType`): a patch by default.
- `versionLocks: ["*"]` bumps every package to the highest bump found.
- The new version is computed from the package's `major.minor.patch`. A prerelease version increments its prerelease counter, unless the package is in `graduate`.

### Publish tags

`command.publish.tags` is an object keyed by dist-tag name. Tag names must match `[0-9A-Za-z-]+`, else `tag <name> invalid. Only [0-9A-Za-z-] characters allowed.`

```json
{ "command": { "publish": { "tags": { "next": { "enabled": true, "addToVersion": true, "packages": { "pkg-a": true } } } } } }
```

| Key | Behavior |
| --- | --- |
| `enabled` | `false` skips this tag. |
| `packages` | Object of package name to boolean. Required. A package must be listed. `true` sets `publishConfig.tag` to this tag. `false` removes `publishConfig.tag` (publishes as `latest`). |
| `addToVersion` | For `true` packages with a tag other than `latest`: new versions become `<version>-<tag>.0`, or the next prerelease number when already on that tag. |
| `regex` | Read, but only consulted when the package key exists with an undefined value, which JSON cannot express. It has no effect from a config file. |

`versionTagging`: a package listed there gets `publishConfig.tag` of `ver<major>`. Listing a package in both `tags` and `versionTagging` fails with `package <name> has both tag and versionTagging`.

## Tags

### Release tag

`gitTagTemplate` replaces tokens with the current local time. Unknown tokens throw `unknown token '<tok>' in command.publish.gitTagTemplate - valid tokens are: ...`.

| Token | Value |
| --- | --- |
| `{YYYY}` | four digit year |
| `{MM}` | two digit month |
| `{DD}` | two digit day |
| `{hh}`, `{mm}`, `{ss}` | two digit hour (24h), minute, second |
| `{COMMIT}` | first 8 characters of the HEAD short hash (`git log --format=%h -n 1`) |

Default: `fynpo-rel-{YYYY}{MM}{DD}-{COMMIT}`. Selective releases prefix the tag with `selective-`. The prefix keeps `git describe --match fynpo-rel-*` from finding them.

### Package tags

With `--tag`, `prepare`, `version`, and `changelog --publish` create a lightweight tag `<name>@<version>` per released package.

## Publish jurisdiction

A package can be published only when all hold: not `"private": true`, managed, not gitignored, matches `publishInclude` when that list is non-empty, and does not match `publishExclude`. The gitignore veto uses the root `.gitignore` and `.git/info/exclude` only (not nested `.gitignore` files or the global excludes file). It cannot be lifted by `publishInclude` and is independent of `respectGitignore`. The same filter limits changed-package detection, the changelog, version bumps, and `publish`. It does not affect `bootstrap`, `run`, or discovery.

## Environment variables

| Variable | Direction | Behavior |
| --- | --- | --- |
| `CI` (and other vars detected by `ci-info`) | read | Prints `CI env detected` to stderr and disables the log item type. Adds `--pg simple` to fyn installs. Prints full output on bootstrap failures. Disables interactive prompts. Enables remote cache uploads. |
| `FYNPO_PUBLISH` | set | `1` while `publish` runs package `prepublishOnly`, `publish` and `postpublish` scripts. Lets guards such as `publish-util` accept the call. |
| `FYNPO_ALLOW_STALE_LOCAL_DEPS` | read | Any non-empty value lets `publish` continue with stale local dependency copies. |

fynpo sets `PWD` to the working directory for shell commands it runs.

## Files fynpo reads and writes

| File | Behavior |
| --- | --- |
| `fynpo.json`, `fynpo.config.js`, `fynpo.config.json`, `lerna.json` | Config. `fynpo.json` is created when no config exists. |
| `CHANGELOG.md` | Written at the top by `changelog` and `version`. Read by `prepare`. |
| `.fynpo-data.json` | Written by fyn (`indirects`, `__timestamp`). Read by every command. Commit it. |
| `fynpo-debug.log` | Written by `bootstrap` on failure or with `--save-log`. |
| `.fynpo/_cache-meta/`, `<package>/<label>-cache-diff.log` | Cache bookkeeping. |

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success. Also `local`, `updated`, and a `prepare` that found nothing to do. |
| `1` | `bootstrap` failure, `run` caught exception, failed config load, `publish` failure or refusal, `commitlint` invalid or empty message, `init` without package.json, a declined major bump, detached HEAD, unknown `--only` package, `PrepareError`, uncaught error. |
| script code | `run` exits with the highest failing package script exit code (at least `1`). |
