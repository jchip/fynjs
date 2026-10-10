# fyn reference

`fyn` is a Node.js package manager CLI. It installs from the npm registry and from local directories, links local packages by hardlinking their packed files, can keep one copy of each package in a central store, and runs as the installer for fynpo monorepos. It is a command line tool. The package has no documented JS API.

## Binaries and requirements

| Binary | Behavior |
| --- | --- |
| `fyn` | The CLI. |
| `fun` | Shortcut for `fyn run`: `fun <script> [args]` is `fyn run <script> [args]`. Exits 0 on success and 1 on any rejection. |
| `0-npx-please-run-this-for-fyn` | Same entry as `fyn`. |

- Requires Node `>= 22.22.2`. An older Node prints `fyn requires node >= 22.22.2, and this is <version>.` and exits 1 before loading the bundle.
- `fyn` enables the V8 compile cache. `NODE_DISABLE_COMPILE_CACHE=1` turns it off and `NODE_COMPILE_CACHE` moves it. Both are Node variables.
- The package exports a programmatic entry (`run`, `fun`, `getAuditFilePath` from `bin/index.mjs`) that loads `dist/fyn.mjs` on first call. It is the CLI entry, not a library API.

## Invocation rules

```
fyn [options] <command> [command options] [args]
```

- No command: runs `install`. `fyn --verbose` and `fyn --fi` are installs.
- A first word that is not a command is treated as `fyn run <word>`. `fyn build` runs the `build` script.
- Global options (the table below) can be given before or after the command name.
- Boolean options take `<flag boolean>`. `--name`, `--name=true` and `--no-name` all work. Names are kebab-case on the command line and camelCase in rc files.
- `-- <args>` after `run` passes the remaining args to the script.
- `fyn --help` prints help. `fyn --version` prints the version.
- A parse error prints the error and leaves exit code 1 (the bin wrapper calls `process.exit()` with no argument, so a code already set is kept).

## Commands

Aliases are in parentheses. Command options are listed with each command. Global options are in "Global options".

| Command | Purpose |
| --- | --- |
| `install` (`i`) | Resolve, fetch and install dependencies. Default command. |
| `add` (`a`) | Add packages to `package.json`, then install. |
| `remove` (`rm`) | Remove packages from `package.json`, then install. |
| `update` | Update locked versions to the newest their ranges allow, then install. |
| `stat` | Show where an installed package comes from and who depends on it. |
| `outdated` | List direct registry dependencies that have newer versions. |
| `audit` | Check resolved packages for known vulnerabilities. |
| `run` (`rum`, `r`) | Run a `package.json` script. |
| `init` | Create a `package.json`. |
| `install-scripts` | Review and record install script approvals. |
| `prod-prune` | Remove non-runtime files from a production `node_modules`. |
| `sync-local` (`sl`) | Re-link files of local packages. |
| `global` | Install and manage global packages. |

### `install`

```
fyn [install] [options]
```

| Option | Alias | Type | Default | Behavior |
| --- | --- | --- | --- | --- |
| `--run-npm [scripts..]` | | string list | none | Extra npm scripts to run after install. Not saved to `.fyn.json`. |
| `--force-install` | `--fi` | boolean | false | Install even when no file changed since the last install. |
| `--audit` | | boolean | true | Run a summary audit after install. `--no-audit` skips it. |
| `--audit-file <path>` | | string | none | After install, write the full audit report as JSON. A relative path is relative to the project dir. |
| `--allow-scripts-pending` | | boolean | false | Also record which packages would need approval under policy `review`, without changing what runs. |

Sequence:

1. Load `package.json`, then merge `package-fyn.json` over it (see "Package fyn section").
2. Skip with the message `No changes detected since last fyn install` when all of these hold: not `--force-install`, not changing production mode, the saved `fynlocal` equals the current one, a saved install time exists, no scanned file is newer than that time, no local package changed, and `fyn-lock.yaml` exists. The audit summary still runs in this case. Exit code is 0.
3. Take the install lock `<targetDir>/.f/.installing.lock` (waits 3 s, treats a lock older than 30 minutes as stale). A second concurrent install in the same dir fails to get the lock.
4. Run the project's `preinstall` script, if it has one.
5. Resolve dependencies, fetch tarballs, install into `node_modules`.
6. Run the project's `install`, `postinstall` and `prepare` scripts (those that exist, in that order). `prepublish` is not run.
7. Run the npm scripts from `--run-npm` and from the fynpo `command.bootstrap.npmRunScripts` setting, when `--auto-run` is on. In a fynpo package the default is `["build"]` unless `npmRunScripts` is `false`. An entry that is an array runs only its first script that exists.
8. Refresh hardlinks of local packages if scripts ran, save `fyn-lock.yaml` and the installed copy, save `.fyn.json`, and print the audit summary.

Files scanned for the freshness check include `package.json`, `package-fyn.json`, `fyn-lock.yaml`, `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`, `.npmrc`, `.fynrc`, `fynpo.json`, `fynpo.config.js`, `fynpo.config.json`.

Production mode is sticky. If the existing `node_modules` was installed with `--production` and the flag source is the default, fyn keeps production mode. `--no-production` switches it off and reinstalls. `--production` on a non-production tree switches it on.

Layout is sticky. If `.fyn.json` records a different `layout`, that layout is used. A warning appears when `--layout` was given. Remove `node_modules` to change layout.

Exit codes:

| Code | Cause |
| --- | --- |
| 0 | Success, or "No Change". |
| 1 | Install failure (resolution, fetch, script, local build, unapproved scripts with no terminal, fatal config error). |

On failure fyn writes the log to `--save-logs` if set, else to `<os tmpdir>/fyn-debug-<pid>-<timestamp>.log`, and prints the path. Resolution and registry failures are "expected": the stack goes to the log, not the console.

### `add`

```
fyn add [packages..] [--dev <pkgs..>] [--opt <pkgs..>] [--peer <pkgs..>] [options]
```

| Option | Alias | Type | Default | Behavior |
| --- | --- | --- | --- | --- |
| `[packages..]` | | string list | none | Added to `dependencies`. |
| `--dev [packages..]` | `-d` | string list | none | Added to `devDependencies`. |
| `--opt [packages..]` | | string list | none | Added to `optionalDependencies`. |
| `--peer [packages..]` | `-p` | string list | none | Added to `peerDependencies`. |
| `--install` | | boolean | true | Run `install` after adding. `--no-install` only edits `package.json`. |
| `--pkg-fyn` | | boolean | false | Save local-path entries in `package-fyn.json` instead of `package.json`. |
| `--audit` | | boolean | true | Passed to the follow-up install. |

Package argument forms:

- `name` or `name@spec`. A missing spec is `latest`.
- `name@tag` resolves a dist-tag to `^<version>`. If that is not a valid range it saves the bare version.
- `name@range` is saved as given when at least one published version satisfies it. Otherwise `no matching version found for <arg>` is logged and the package is skipped.
- `alias@npm:real@spec` saves the `npm:` specifier.
- A directory path, `file:` path, absolute path, `./`, `../` or `~/` path adds a local dependency. If the directory exists it is made relative to the project dir. The `package.json` gets `^<its version>` and a `fyn.<section>.<name>` entry holds the path. In a fynpo monorepo, a name that is a monorepo package gets no `fyn` entry.

Rules:

- Keys in each edited section are sorted.
- Up to 10 metadata lookups run at once. The first lookup error stops the rest.
- The add phase runs with the lockfile off. The install phase runs with it restored.
- No packages given: `No packages to add`, exit 1.
- No package resolved: `No packages found for add`, `package.json` unchanged, no install, exit code unchanged (0).

### `remove`

```
fyn remove <packages..> [--install] [--audit]
```

| Option | Type | Default | Behavior |
| --- | --- | --- | --- |
| `--install` | boolean | true | Run `install` after removing. |
| `--audit` | boolean | true | Passed to the follow-up install. |

Removes each name from `dependencies`, `devDependencies`, `optionalDependencies`, `peerDependencies`, and from the same sections inside the `fyn` block. Empty sections are deleted. Names not found are logged as `These packages don't exist in your package.json`. If nothing was removed it logs `No package was removed`, skips the install and does not set a failing exit code. No names given: `No packages to remove`, exit 1.

### `update`

```
fyn update [packages..] [--audit]
```

| Option | Type | Default | Behavior |
| --- | --- | --- | --- |
| `--audit` | boolean | true | Run a summary audit after the update. |

Re-resolves dependencies to the newest versions their declared ranges allow, then installs.

- No names: ignores every pin in `fyn-lock.yaml`, or in `<targetDir>/.f/lock.yaml` when there is no lockfile. `package-lock.json`, `npm-shrinkwrap.json` and `yarn.lock` are also ignored.
- With names: unlocks those packages and every package they depend on, directly or not. Everything else stays pinned. A shared dependency in that subtree updates for all its dependents.
- A name that is not in the lock data fails with `not found in lock data: <names>`, exit 1.
- Always fetches fresh registry metadata and skips the "No Change" shortcut.
- Never edits `package.json`. Use `add` to move past a declared range.
- After install it prints `name old -> new` for each package whose locked versions changed, then the audit summary.

### `stat`

```
fyn stat <package-name>[@semver] [...]
```

Resolves dependencies without building local packages, then for each argument lists the installed versions that match. For each match it prints dependents, circular dependencies, and the dependency paths (all of them, or the most significant ones when there are many). A name that matches nothing prints `<arg> is not installed`. At least one argument is required. Exit code 0 unless resolution fails.

### `outdated`

```
fyn outdated [package-name ...] [--json]
```

| Option | Alias | Type | Default | Behavior |
| --- | --- | --- | --- | --- |
| `--json` | `-j` | boolean | false | Print records as a JSON array on stdout. Logging is set to `none` for the run so stdout is only JSON. |

Rules:

- Checks direct dependencies from `dependencies`, `devDependencies`, `optionalDependencies` and `devOptDependencies`. When a name is in several sections, `optionalDependencies` wins, then `dependencies`, then `devOptDependencies`, then `devDependencies`.
- A named package that is not declared throws `dependency "<name>" is not declared`.
- Skipped without a comparison: local, URL and git dependencies, dependencies that fynlocal resolves to a local path, and optional dependencies whose `os`/`cpu` do not fit this machine.
- `wanted` is the dist-tag version when the spec is a tag. Otherwise it is the registry `latest` when `latest` satisfies the range, else the highest version that satisfies it. With `--lock-time`, versions published after that time are excluded in the fallback search.
- `latest` is the registry `latest` tag, or `null`.
- `current` is the version in `<targetDir>/<name>/package.json`, or `null` (shown as `MISSING`) when it is not installed.
- A dependency is reported unless `current === wanted` and (`latest` is missing or `wanted === latest`).
- Record fields: `name`, `type` (`prod`, `dev`, `optional`, `devOptional`), `requested`, `current`, `wanted`, `latest`, and `resolvedName` for aliases.
- The table has columns `Package`, `Current`, `Wanted`, `Latest`, `Type`, `Requested`. Empty results log `All N direct dependencies are up to date`, or `No registry dependencies to check` when everything was skipped. `--json` prints `[]`.
- Errors (bad spec, missing tag target, no matching version, registry failure, unreadable installed `package.json`) are thrown and make the process exit 1.

Exit code: 1 when at least one record is reported, 0 when none. It does not change any file.

### `audit`

```
fyn audit [options]
```

| Option | Alias | Type | Default | Behavior |
| --- | --- | --- | --- | --- |
| `--json` | `-j` | boolean | false | Print `{ vulnerabilities, metadata, advisories }` as JSON. |
| `--omit [types..]` | | string list | none | Dependency types to leave out: `dev`, `optional`, `peer`. A package is dropped only when every path to it is of an omitted type. |
| `--audit-level <level>` | | string | `info` | Lowest severity reported: `info`, `low`, `moderate`, `high`, `critical`. |
| `--cache` | | boolean | true | Use the audit cache. `--no-cache` always fetches. |

Rules:

- Resolves dependencies (without building local packages), then POSTs the package/version map to `<registry>/-/npm/v1/security/advisories/bulk`. The main `registry` is used, not scoped registries.
- One attempt, 10 second timeout, no retries.
- Cache: `<fynDir>/audit`, entries valid 30 minutes. On a network error an expired cache entry is still used with a warning.
- Failures are logged as `Audit failed: <message>` and do not set a failing exit code. `FYN_DEBUG` set also prints the stack.
- The exit code is 0 even when vulnerabilities are found.
- After `install`, a summary (`audited N packages`, counts by severity) is printed. An audit failure there only logs `Security audit failed:`.

### `run`

```
fyn run [script] [args...] [-- <args>...] [options]
fyn <script> [args...]
```

| Option | Alias | Type | Default | Behavior |
| --- | --- | --- | --- | --- |
| `--list` | `-l` | boolean | false | Print script names, one per line, and exit 0. Does not look for fynpo. |
| `--if-present` | | boolean | false | A missing script returns without error. |

Rules:

- No script name: prints `Lifecycle scripts included in <name>:` and the script names, exit 0.
- A missing script logs `Error: missing script: "<name>" - not found in package.json scripts` and exits 1, unless `--if-present`.
- For a name that does not start with `pre` or `post`, `pre<name>` and `post<name>` run around it when they exist. A name starting with `pre` or `post` runs alone.
- Args before and after `--` are all passed, but only to the main script, not to its pre/post scripts.
- Environment follows npm: `npm_*` variables from package data and config, `npm_node_execpath`, `NODE` (kept if set), `npm_execpath` (the fyn CLI), `INIT_CWD` (the project dir). `node_modules/.bin` of the fynpo top dir is added to the front of `PATH` in a monorepo. The node-gyp environment is set up.
- The rc key `script-shell` selects the shell.
- Scripts run with inherited stdio.
- A failing script exits with the script's exit code (`err.code`, else `errno`, else 1). The error report prints the event, path, command, exit code and signal.

### `init`

```
fyn init [--yes]
```

| Option | Alias | Type | Default | Behavior |
| --- | --- | --- | --- | --- |
| `--yes` | `-y` | boolean | false | Skip prompts and use defaults. |

Runs the `init-package` generator. Any error exits 1.

### `install-scripts`

Reviews and records which packages may run install scripts. See "Install script policy" for the rules these commands write to. All four subcommands load the project, then read the last install's recorded blocked and pending packages from `<targetDir>/.f/.fyn.json`. Any error is logged and exits 1.

| Subcommand | Alias | Args | Options | Behavior |
| --- | --- | --- | --- | --- |
| `ls` | `list` | none | `--json` | Lists packages awaiting review: those the last install blocked, plus those recorded by `--allow-scripts-pending`. `--json` writes the records to stdout. With none it logs `No packages are awaiting install-script review.` |
| `approve` | | `[packages..]` | `--all`, `--local` | Writes approvals to `allowScripts`. |
| `deny` | | `[packages..]` | `--local` | Writes `{}` entries to `denyScripts`. |
| `prune` | | none | `--local` | Drops `allowScripts` entries for packages that are not installed. |

Common option: `--local` (boolean) writes to the project's `package.json` `fyn` block. Without it, inside a fynpo monorepo the target is `<fynpo dir>/fynpo.json` under `fyn.options`. Outside a monorepo the target is always `package.json`. A missing `fynpo.json` target throws `cannot read <file> - the monorepo allowlist needs a fynpo.json. Use --local ...`.

`approve`:

- Each name must be awaiting review, or carry an explicit `@version`. Otherwise `not awaiting review: <names>` is logged and nothing is written.
- `--all` approves every awaiting package.
- Entries are keyed by the bare package name and hold `{ semver, scripts }`. `semver` is a caret range of the reviewed version, unless `--no-allow-scripts-pin` is set. `scripts` lists the blocked scripts and is omitted when it would cover all three. Approving a second version widens `semver` to a union.
- A package already denied (in `denyScripts` of any scope, or an `allowScripts` `false`) is skipped with a `denied, not approved` warning.
- Nothing runs retroactively. Run `fyn install` afterward.

`deny`: no names logs `no packages named to deny`. A name already in the list logs `already denied`. Names with `@spec` are cut to the bare name.

`prune`: installed names come from `<targetDir>` entries and the `.f/_` store. If none are found it logs an error and writes nothing.

### `prod-prune`

```
fyn prod-prune [dir] [--max-kb <n>] [--max-files <n>] [--force]
```

| Option | Type | Default | Behavior |
| --- | --- | --- | --- |
| `[dir]` | string | the output dir (`<cwd>/<targetDir>`) | Tree to prune. Resolved against the project dir. |
| `--max-kb <n>` | number | 0 (none) | Fail when the remaining tree is larger than `n` kB. Overrides `prodPruning.maxKb`. |
| `--max-files <n>` | number | 0 (none) | Fail when more than `n` files remain. Overrides `prodPruning.maxFiles`. |
| `--force` | boolean | false | Prune even when the tree is not from `fyn install --production`. |

Rules:

- Without `--force` the tree must have `.f/.fyn.json` with `production: true`. Otherwise it exits 1 with `<dir> is not from a production install (fyn install --production). Use --force to prune it anyway.`
- A missing directory throws `no such directory: <dir>` (exit 1).
- Removes by directory name (`test`, `tests`, `__tests__`, `spec`, `__mocks__`, `docs`, `doc`, `example`, `examples`, `benchmark`, `benchmarks`, `coverage`, `.nyc_output`, `.github`, `.circleci`, `.husky`, `.idea`, `.vscode`) and by file type (source maps, TypeScript sources, and other non-runtime files), only inside package roots. License files are merged into `THIRD-PARTY-LICENSES.txt` at the tree root.
- The `package.json` beside the tree can hold `prodPruning`: `{ "maxKb": n, "maxFiles": n, "keepPaths": ["pkg/dir-or-file", ...] }`. `keepPaths` spares those files or directories. A command line budget beats the manifest budget.
- Files larger than 100 kB are always listed. Size never decides what is removed.
- Exit 1 when a budget is exceeded or any error occurs.

### `sync-local`

```
fyn sync-local
```

Re-hardlinks the packed files of each local package recorded in `.fyn.json` (`localPkgLinks`) and refreshes `fyn.localExports` links. Logs `There are no local packages` when there are none. Any error exits 1. It does not resolve dependencies or touch the lockfile.

### `global`

Manages packages installed outside any project.

```
fyn global [--tag <tag>] <subcommand> [options]
```

| Parent option | Type | Behavior |
| --- | --- | --- |
| `--tag <tag>` | string | Operate on one installed copy by tag id such as `g1`, `g2`. Used by `remove` and `link` when no package is named. |

Every subcommand takes `--dir <dir>` (string, default `~/.fyn/global`), the global root. All the fully merged global/rc options (registry, concurrency, and so on) are passed to the installs.

| Subcommand | Alias | Args | Extra options | Behavior |
| --- | --- | --- | --- | --- |
| `add` | | `<packages..>` | `--yes`/`-y`, `--new-tag` | Install each package. Local paths (`./x`, `file:`, existing dir) are supported. |
| `remove` | `rm` | `[package]` | `--yes`/`-y` | Remove a package, a `name@version`, or the copy named by `--tag`. |
| `link` | | `[package]` | none | Make one installed version the active one (`name@version`, or `--tag`). |
| `list` | `ls` | `[name]` | none | List installed packages. |
| `update` | | `[package]` | none | Update a global package. |
| `use` | | `[version]` | none | Point `<root>/current` at `v<node major>` (default: the running Node major). |
| `cleanup` | | `[package]` | none | Remove versions that are not linked. Skips a package with no linked version. |
| `setup-path` | | none | none | Print `PATH` instructions for `<root>/bin`. |

Layout and rules:

- Root `~/.fyn/global`. Per runtime dir `<root>/v<node major>` (`bun<major>` on Bun) with `packages/<gN>/`, `bin/`, and `installed.json`. `<root>/bin` is a symlink to the current runtime's `bin`.
- Each install lives in `packages/g<N>` with its own `node_modules`. A different version gets a new `gN`. Installs take `packages/.install.lock`.
- Installs always use `targetDir: node_modules`, `layout: normal`, `flattenTop: true`, `centralStore: true`, `lockfile: true`, `sourceMaps: false`. The central store is `<root>/_central-storage` (it sets `FYN_CENTRAL_DIR` in the process).
- A spec that looks like a package name but exists as a local path fails with `Ambiguous package spec`. Use `./name`.
- `add`: no packages logs `No packages specified`, exit 1. A failed package logs `Failed to install <pkg>: ...` and exits 1.
- `remove` with no name and no `--tag` logs usage and exits 1. `remove`, `link` and `update` exit 1 when they report failure.
- `cleanup` logs `Nothing to clean up` or `Cleaned up N version(s)`.

## Global options

Defined on the root command. All appear in `fyn --help`.

| Option | Alias | Type | Default | Behavior |
| --- | --- | --- | --- | --- |
| `--cwd <dir>` | | string | process cwd | Project directory. A relative path is joined to the process cwd. When explicit, fyn does not search parent dirs for `package.json`. A fynpo config can not change it. |
| `--fyn-dir <dir>` | | string | `~/.fyn` | Cache and data dir. Used as given. |
| `--registry <url>` | `--reg` | string | `https://registry.npmjs.org` | Registry URL. |
| `--production` | `--prod` | boolean | false | Ignore `devDependencies`. Also set by `NODE_ENV`. |
| `--lockfile` | `--lf` | boolean | true | Read and write `fyn-lock.yaml`. `--no-lockfile` disables both. |
| `--lock-only` | `-k` | boolean | false | Resolve only from the lockfile. Fails if changes are needed, or if the lockfile cannot be read (exit 1). Does not write `fyn-lock.yaml`. Tarballs are still fetched. |
| `--prefer-lock` | | boolean | false | Prefer versions in the lockfile. |
| `--lock-time <time>` | | string | none | Resolve only versions published at or before this time (anything `new Date()` accepts). Needs full registry metadata. |
| `--npm-lock` | | boolean | unset | `true` always reads `npm-shrinkwrap.json` or `package-lock.json`. `false` never does. Unset reads them only when no fyn lockfile exists. |
| `--offline` | | boolean | false | Use only the lockfile and the local cache. Fails on a miss. |
| `--force-cache` | `-f` | boolean | false | Do not check the registry when the cache has the entry. A cache miss still hits the registry. |
| `--refresh-meta` | | boolean | false | Force refresh of package metadata from the registry. |
| `--refresh-optionals` | | boolean | false | Re-check all `optionalDependencies` instead of trusting the lockfile record. |
| `--always-fetch-dist` | | boolean | false | Fetch the dist tarball while resolving. |
| `--deep-resolve` | `--dr` | boolean | false | Resolve the dependency tree as deep as possible. |
| `--ignore-dist` | `-i` | boolean | unset | Ignore the host in the tarball URL from metadata. No code outside the option getter reads it. |
| `--ignore-lock-url` | | boolean | false | Rebuild tarball URLs from the registry setting instead of the lockfile URL. |
| `--enforce-registry-deps` | | boolean | unset (on) | Require transitive dependencies to come from a registry. See "Registry-only transitive dependencies". |
| `--show-deprecated` | `-s` | boolean | unset | Always show deprecation messages. |
| `--fynlocal` | | boolean | true | Enable local package linking. See "Local packages (fynlocal)". |
| `--build-local` | | boolean | true | Run `fyn install` and the build scripts in local dependency packages first. |
| `--source-maps` | `--sm` | boolean | false | Generate pseudo source maps for linked local packages. |
| `--auto-run` | | boolean | true | Run the extra npm scripts after install. |
| `--flatten-top` | | boolean | true | Hoist packages to the top `node_modules`. Turning it off while `--layout` is unset switches the layout to `detail`. |
| `--layout <type>` | | string | `normal` | `normal` or `detail`. `detail` puts every package under its own versioned path and symlinks into `node_modules`. |
| `--central-store` | `--central`, `--cs` | boolean | unset | See "Central store". |
| `--hardlink` | | boolean | unset (on) | Hardlink central store files into `node_modules`. |
| `--reflink` | | boolean | true | Clone store files copy-on-write where the filesystem can. `--no-reflink` never uses `@fynjs/reflink`. |
| `--copy-fallback` | | boolean | true | Copy files that cannot be cloned or hardlinked. `--no-copy-fallback` fails the install instead. |
| `--copy [packages..]` | `--cp` | string list | none | Copy these packages even in central store mode. The value is stored but no code reads it. |
| `--script-policy <mode>` | | string | `review` | `all`, `source`, `review` or `off`. See "Install script policy". |
| `--allow-scripts [packages..]` | | string list | none | Allow these packages' install scripts for this run. Commas split names. |
| `--deny-scripts [packages..]` | | string list | none | Deny these packages' install scripts for this run. Wins over every approval. |
| `--allow-scripts-pin` | | boolean | true | Pin written approvals to the reviewed version. |
| `--concurrency <n>` | `--cc` | number | 32 | Network concurrency (registry sockets). |
| `--extract-concurrency <n>` | `--excc` | number | min(4, workers + 1) | Packages extracted at once. |
| `--meta-memoize <url>` | `--meta-mem` | string | none | URL of a server that shares a metadata cache across fyn processes. |
| `--log-level <level>` | `-q` | string | `info` | `debug`, `verbose`, `info`, `warn`, `error`, `fyi`, `none`. A unique prefix works (`-q=d`). The first level that starts with the text wins. An invalid value logs `Invalid log level` and exits 1. |
| `--save-logs [file]` | `--sl` | string | `fyn-debug.log` when given without a value | Save all logs to this file, relative to the project dir. Ignored when the value came from an rc file rather than the command line. |
| `--colors` | | boolean | true | `--no-colors` turns color off. |
| `--progress <type>` | `--pg` | string | `normal` | `normal`, `simple` or `none`. An unknown value means `none`. `normal` becomes `simple` when stdout is not a TTY. |
| `--rcfile` | | boolean | true | `--no-rcfile` skips every rc file and uses only the built-in defaults. |

Built-in defaults (`default-rc`): `registry` `https://registry.npmjs.org`, `targetDir` `node_modules`, `progress` `none` when a CI is detected (`ci-info`), else `normal`.

Options with no command line flag but read by fyn from rc, fynpo or the `Fyn` constructor: `targetDir` (default `node_modules`), `pkgFile` (default `package.json`), `allowTopLevelScripts`, `reviewLocalPackages`, `email`, `username`, `password`, `always-auth`, `script-shell`, `@scope:registry`, `//host/:_authToken`.

## Config sources and precedence

### rc files

rc files are read with an ini parser. Files, from lowest to highest priority (later wins, objects merge deeply):

1. `$NPM_CONFIG_GLOBALCONFIG`
2. `$PREFIX/etc/npmrc`
3. `$NPM_CONFIG_USERCONFIG`
4. `~/.npmrc`
5. `~/.fynrc`
6. `<fynpo dir>/.npmrc` (only when a fynpo dir exists and differs from the project dir)
7. `<fynpo dir>/.fynrc` (same condition)
8. `<project dir>/.npmrc`
9. `<project dir>/.fynrc`

Rules:

- The built-in defaults sit under all of these.
- A missing file is ignored. A file that fails to parse logs `Failed to process <name> RC file`, and is treated as empty.
- Every key from every file goes into the options. Registry keys (`registry`, `<scope>:registry`), `*:_authToken` keys and `email`, `always-auth`, `username`, `password` are read by the registry layer. Auth keys are removed from debug output.
- Keys are written in the file in kebab-case or camelCase (`logLevel`, `central-store`). Both match the option names.
- `${VAR}` in a string value is replaced from the environment. An unset variable stays as `${VAR}`. `\${VAR}` escapes it.
- `.npmrc` values are also exposed to lifecycle scripts as `npm_config_*`.
- `--no-rcfile` loads none of these.

`.fynrc` sections: a top-level key whose value is an ini section is applied only when it matches. Plain top-level keys are the defaults. Section names:

| Section | Matches when |
| --- | --- |
| `[IS_CI]` | `CI` or `BUILD_ENV` is set. |
| `[CI:<value>]` | `CI` or `BUILD_ENV` (the first one set) equals `<value>`. |
| `[VAR:<value>]` | environment variable `VAR` equals `<value>`. |
| `[VAR1\|VAR2:<value>]` | either variable equals `<value>`. |

Applied order: defaults, then env-match sections, then `IS_CI`, then `CI:<value>`. `.npmrc` files do not use sections.

### Order of precedence for an option

1. Command line (highest).
2. `NODE_ENV` for `production` only: when `NODE_ENV` is set, `production` becomes `NODE_ENV === "production"`, unless `--production` was given.
3. rc files, merged into the option set with lodash `defaults`: they fill options the parser has not set.
4. The fynpo config `fyn.options` (see below). The code documents the order as command line, then rc, then fynpo. It applies a fynpo value only when the option did not come from the command line.
5. Built-in defaults.

Unverified: the CLI also applies fynpo options through a second path that overrides every option not set on the command line, so rc versus fynpo order was not confirmed at runtime. Also, the rc step uses `defaults`, so an rc value does not replace an option that already carries a built-in argument default (for example `concurrency`, `progress`). Check with a runtime test before relying on rc to override those.

The `fyn` block of `package.json` does not accept general options. It accepts only the keys listed in "Package fyn section".

### Environment variables

| Variable | Effect |
| --- | --- |
| `FYN_DIR` | fyn data dir, used as given. Fallbacks `USERPROFILE`, then `HOME` get `/.fyn` appended. Default is `<cwd>/.fyn` if none are set. `--fyn-dir` wins. |
| `FYN_REGISTRY` | Registry when no `registry` option exists. The CLI always has one (the built-in default), so this applies only to programmatic use. |
| `FYN_TARGET_DIR` | Same story for `targetDir` (default would be `xout` without the CLI defaults). |
| `FYN_PACKAGE_FILE` | The package file name. Default `package.json`. |
| `FYN_CENTRAL_DIR` | Central store dir. A false value (`0`, `false`, `no`, `off`) disables the store. `1`, `on`, `true` or `yes` uses `<fynDir>/_central-storage`. See "Central store". |
| `FYN_HARDLINK` | Hardlink on or off when `--hardlink` is not given. |
| `FYN_SHORT_PKG_DIR` | Any non-empty value (even `0`): new installs store packages at `.f/_/<name>/<version>/<name>`. Default: `.f/_/<name>/<version>/node_modules/<name>`. An existing install's recorded form wins. |
| `FYN_LOCAL_COPY_MODE` | True: copy local package files instead of hardlinking them. |
| `FYN_LOCAL_PACK_SYMLINKS` | True: include symlinks when packing local package files. |
| `FYN_FYNPO_DIR` | Set by fyn to the detected monorepo top dir. Suppresses the "Detected a ..." message in child fyn processes. |
| `FYN_DEBUG` | Print stack traces for audit failures. |
| `NODE_ENV` | Sets `production`. See above. |
| `NPM_CONFIG_GLOBALCONFIG`, `NPM_CONFIG_USERCONFIG`, `PREFIX` | rc file locations. |
| `CI`, `BUILD_ENV` | `.fynrc` section matching. `ci-info` detection sets the default `progress`, enables prompts only off CI, and stops source map handling for `.js` files. |
| `NOPROXY` | Passed to the registry fetch as `noProxy`. |
| `NODE_DISABLE_COMPILE_CACHE`, `NODE_COMPILE_CACHE` | Node compile cache control. |

`FYN_HARDLINK`, `FYN_LOCAL_COPY_MODE` and `FYN_LOCAL_PACK_SYMLINKS` are read as booleans: unset, empty, `0`, `off`, `false` and `no` are false (case insensitive), anything else is true.

### fynpo.json `fyn` section

When the project is inside a fynpo monorepo (`fynpo.json`, `fynpo.config.js`, `fynpo.config.json`, or a lerna config found by walking up), fyn reads these keys from that config:

| Key | Effect |
| --- | --- |
| `fyn.options` | Object of option names (camelCase) applied as in "Order of precedence". `cwd` and `initCwd` are never taken from it. |
| `fyn.options.allowScripts`, `denyScripts`, `allowTopLevelScripts`, `scriptPolicy`, `reviewLocalPackages` | Have their own merge rules. See "Install script policy". |
| Other `fyn.options` object values | Deep merged with the existing value, with already-set keys winning. |
| `centralDir` | Central store dir for the monorepo (see "Central store"). |
| `noFynLocal` | Package names that must not be auto-linked. |
| `localDepAutoSemver` | `patch`, `minor` or `major`: how a monorepo sibling's range is widened when matching a local copy. |
| `resolutions`, `overrides` | Merged with the same keys in `package.json`. fynpo wins on a conflict. |
| `command.bootstrap.npmRunScripts` | Scripts run after install in a monorepo package. Default `["build"]`; `false` disables. |
| `packages` | Package globs. Used to find local copies. |

A fynpo config that does not parse logs a warning naming the file and exits 1.

### Package fyn section

`package.json` (merged with `package-fyn.json`) can carry:

| Key | Behavior |
| --- | --- |
| `fyn.dependencies`, `fyn.devDependencies`, `fyn.optionalDependencies`, `fyn.peerDependencies` | Map of name to a local path (or `false` or a string containing `no-fyn-local` to opt out of local linking). Only used with fynlocal on. A path that does not exist is ignored. |
| `fyn.allowScripts`, `fyn.denyScripts`, `fyn.allowTopLevelScripts`, `fyn.scriptPolicy`, `fyn.reviewLocalPackages` | Install script policy. |
| `fyn.enforceRegistryDeps` | `false` turns off the registry-only rule. |
| `fyn.localExports`, `fyn.localExportsDir`, `fyn.localExportsDirs` | Local source exports. |
| `resolutions` | Map of dependency path to version. Paths may use `**` between slashes. A bare name matches at any depth. |
| `overrides` | npm style overrides: simple, nested, `name@range` keys, and `$name` references to a direct dependency version. |
| `prodPruning` | Used by `prod-prune`. |

`package-fyn.json` in the project dir is deep merged over `package.json` in memory (the whole file, not only a `fyn` key). `fyn add --pkg-fyn` writes to it.

## Local packages (fynlocal)

`--fynlocal` (default true) lets a dependency resolve to a directory on disk instead of the registry.

Ways a dependency becomes local:

- A spec in `dependencies` and friends that is `file:<path>`, an absolute path, `./...`, `../...`, or `~/...`.
- A `fyn.<section>.<name>` path in `package.json` or `package-fyn.json`. It replaces the registry spec locally while the registry spec stays for publishing.
- In a fynpo monorepo, a dependency whose name is a monorepo package and whose range matches that package's version. Skipped when the name is in the config `noFynLocal`, when `fyn.<section>.<name>` is `false` or contains `no-fyn-local`, or when the spec is a URL. A name that matches no version logs the versions available.

Behavior:

- Local packages get a version tag `-fynlocal_h` (hardlinked). Soft symlink mode was removed and now throws.
- Install hardlinks the files that `npm pack` would include (npm-packlist rules, symlinks only with `FYN_LOCAL_PACK_SYMLINKS`) from the source dir into the consumer's `node_modules`, so edits show up without reinstall. `FYN_LOCAL_COPY_MODE` copies instead. Files in the target that are not in the pack list are removed.
- `--build-local` (default true): before linking, each local dependency whose files changed and which has any of the scripts `preinstall`, `install`, `postinstall`, `prepare`, `build` is built by running `fyn --reg=<registry> -q=d --pg=simple --no-build-local --sl=fyn-debug.log [--no-source-maps] install --no-audit [--force-install]` in its dir. One at a time, deepest dependencies first. Then it runs `prepublish` (skipped with a warning when `prepare` also exists, and a deprecation note is printed), `prepack` and `postpack`. A failed local build prints the primary error, the nested errors and the log path, and fails the install. Its own debug log is `fyn-debug.log` in that dir.
- A package that is the project itself is not built.
- `--source-maps`: for linked `.js` and `.mjs` files with no source map, writes `<file>.fyn.map` mapping each position to the source. A file with its own relative `.map` gets a rewritten map pointing back at the sources. Nothing is generated in CI. `.js.map` and `.mjs.map` files themselves are skipped outside CI.
- Freshness: the "No change" check also looks at local package files and at the linked packed files, so a rebuilt local package triggers a refresh.
- `fyn sync-local` refreshes the links without installing.
- The local link list is stored in `.fyn.json` as `localPkgLinks` (`{ "<node_modules path>": { srcDir, sourceMaps } }`).
- Local entries in `fyn-lock.yaml` have `$: local` and `_: <path>` (relative to the lockfile dir) and are not refreshed from the registry.

`fyn.localExports` (optional): a producer package can declare directories to expose to consumers.

- Producer `package.json`: `"fyn": { "localExports": { "<export name>": "<relative dir>" } }`. `false` disables one export or the whole field.
- Consumer `package.json`: `fyn.localExportsDir` (default `_fyn`) and `fyn.localExportsDirs` (`{ "<package>": "<dir>" }`) set where links go.
- A link is made at `<dir>/<package>/<export>` in the consumer only for fynpo siblings and for `file:`, `link:` or path dependencies. Registry, git and URL dependencies never create exports.
- Dirs must be relative, with no `..`, `node_modules` or `.git`, and must not nest in each other. Names must match `[A-Za-z0-9_][A-Za-z0-9._-]*`. Violations throw errors such as `Unsafe fyn.localExports source ...`.
- Each root dir has an ownership file `.fyn-local-exports.json`. fyn only removes links it owns. The dir is generated content and should be ignored by version control.

## Central store

The central store keeps one extracted copy of each package, keyed by tarball integrity, and `node_modules` gets links or clones of it.

Whether the store is used, in order:

1. `centralDir` already recorded in `<targetDir>/.f/.fyn.json` (an existing install keeps its store). A recorded `false` keeps it off.
2. `FYN_CENTRAL_DIR`: false value disables it, true value uses `<fynDir>/_central-storage`, any other value is the dir.
3. `--central-store` (or rc `centralStore`): `<fynDir>/_central-storage`. `--no-central-store` turns the default (rule 4) off. It does not disable the monorepo store of rule 5.
4. Not a fynpo project: on by default on macOS when `@fynjs/reflink` can clone directories (and `--reflink` is on), and on Linux when hardlink is on or reflink can clone files. Off on Windows and in all other cases.
5. In a fynpo monorepo: `centralDir` from the fynpo config, else `<monorepo>/.fynpo/_store`. If the monorepo is a git linked worktree, the main worktree's `.fynpo/_store` is shared.

The store is skipped (with an info message, and the dir remembered in `.fyn.json`) when it would only copy: `--no-hardlink` and `--no-reflink` together (unless `--no-copy-fallback`); hardlink off on macOS or Windows without `@fynjs/reflink`; or the store is on a different volume than the project.

Storage layout: `<store>/<algorithm>/<hex[0:2]>/<hex[2:4]>/<hex[4:]>/package/` for files, plus a `tree.json` with the file list, a content checksum and a `mutates` flag. Stores of concurrent installs are guarded by marker files. Stale temp entries are cleaned.

Placing files into `node_modules` (per package):

1. One directory clone when `--reflink` is on and the filesystem supports it (APFS).
2. Else per file clone (`@fynjs/reflink`), falling back to hardlink when `--hardlink` is on, then to copy when `--copy-fallback` is on.
3. Else hardlink, with a copy where hardlinking fails.
- `package.json` is always copied because fyn rewrites it.
- A failed hardlink (for example another volume) turns hardlinking off for the rest of the run and copies.
- `--no-copy-fallback` makes a file that cannot be cloned or linked fail the install.

Mutation guard: if a package's install scripts change its files, fyn compares a checksum before and after, marks that package as `mutates` in the store, and never shares it again.

`--hardlink` precedence: command line or rc, then `FYN_HARDLINK`, then the value saved in `.fyn.json`, then on. The choice is saved.

Global installs always use `<global root>/_central-storage`.

## Lockfile

`fyn-lock.yaml` is in the project dir. It is YAML with sorted keys and one space indent.

Top level keys:

| Key | Content |
| --- | --- |
| `$fyn` | Saved config: `layout`, `flattenTop`. |
| `$pkg` | The declared direct dependencies: `dep`, `dev`, `opt` maps of name to spec. |
| `<package name>` | One block per package (below). |

Package block:

| Key | Content |
| --- | --- |
| `_latest` | The registry `latest` version seen. |
| `_` | Map of comma joined semver specs to the resolved version (an array when several). |
| `<version>` | Entry for a resolved version. |

Version entry keys: `top: 1` (requested directly by the project), `$` (integrity, `0` if none, or `local`), `_` (tarball URL, or a local path), `dependencies`, `optionalDependencies`, `peerDependencies`, `bundleDependencies`, `hasPI: 1` (has `preinstall`), `hasI: 1` (has `install` or `postinstall`), `optFailed`, `_missingJson: true`, `deprecated`, `os`, `cpu`, `_hasShrinkwrap: 1`. A platform mismatch is not recorded in the lockfile.

Reading:

- Order of sources: `fyn-lock.yaml`; if absent and `--lockfile` and not `--lock-only`, the installed copy `<targetDir>/.f/lock.yaml`; if still none and not `--npm-lock=false`, `npm-shrinkwrap.json` then `package-lock.json`; then `yarn.lock`.
- A lockfile with git conflict markers is ignored with an error, and everything is resolved again.
- A lock version key that is not valid semver (and is not local) is ignored.
- An unreadable lockfile is an error only with `--lock-only` (exit 1).
- A tarball URL that does not start with the current registry is rewritten onto it when the path matches. `--ignore-lock-url` forces the rewrite.
- `layout` and `flattenTop` stored in the lock win over the defaults. A command line value that differs updates the lock and logs `You are changing <name> in your lockfile`. Other sources are overridden with the lock value and a `Setting <name> to ... from your lockfile` message.

Writing:

- Written after a successful install, only when its checksum changed, never with `--lock-only` and never with `--no-lockfile`.
- The installed copy `<targetDir>/.f/lock.yaml` is written on every install, including `--lock-only`.
- Local package paths are saved relative to the lock dir.
- `add` and `remove` run their edit step with the lockfile off.

Related files in `<targetDir>/.f/`: `.fyn.json` (install config), `lock.yaml` (installed lock copy), `.installing.lock`, `_/` (store for isolated package versions), `.fyn-audit.json` (the path `getAuditFilePath` returns for a generated audit report).

`.fyn.json` fields: `time` (install time in ms, 5 ms after the lock save), `centralDir` (string or `false`), `production`, `fynlocal`, `layout`, `shortPkgDir`, `hardlink`, `blockedScripts`, `pendingScripts`, `localPkgLinks`, `localExports`, `localsByDepth`. It is an internal format and changes without notice.

Caches under `<fynDir>`: `_cacache` (packages and registry cache), `fyn-packuments` (trimmed metadata), `audit`, `tmp`, `links`, `_central-storage`, `global`.

## Install script policy

The install scripts gated are `preinstall`, `install` and `postinstall`. The project's own scripts are not gated.

### Modes

`--script-policy` or `fyn.scriptPolicy`. Default `review`. The value is case insensitive. An unknown value throws `fyn scriptPolicy "<value>" is not valid - expected one of all, source, review, off`.

| Mode | Registry packages | git/URL packages | Workspace-local packages |
| --- | --- | --- | --- |
| `review` | need an `allowScripts` entry | need an entry | run |
| `source` | run | need an entry | run |
| `all` | run | run | run |
| `off` | none run | none run | none run |

- `off` ignores the allowlist.
- `npm:` aliases count as registry. A local path declared by a git or URL package is not workspace-local.
- Workspace-local means `file:`, `link:`, path dependencies and fynpo siblings. `reviewLocalPackages: true` removes their exemption.
- `fyn.allowTopLevelScripts` applies in `source` mode only. `true` or `"*"` allows all scripts, an array allows those script names, for non-registry packages declared directly in the project's `package.json`. It is ignored in every other mode. First defined wins: option (rc or fynpo option), then `package.json`, then fynpo config.

### Maps

`allowScripts` and `denyScripts` are maps of key to value.

Key forms: `name`, `name@<semver range>`, `@scope/name@<range>`, or `name@<requested spec>` for a git/URL spec (matched literally). A key's range is matched against the resolved version.

Value forms for `allowScripts`:

| Value | Meaning |
| --- | --- |
| `{ "semver": "<range>", "scripts": [...] }` | The form fyn writes. A missing field means all versions or all scripts. |
| `true` or `"*"` | All scripts, all versions. |
| `["install"]` or `"install"` | Only those scripts. |
| `"1.2.3"` or `"^1.2.0"` | All scripts, matching versions only (npm form). |
| `false` | Deny the package. |
| `[..., "!postinstall"]` | `!name` denies one script, `!*` denies all, `+name` allows it. A `!` beats an allow of the same name. |

`denyScripts` takes the same shape. A match denies. An empty `{}` entry denies every version and script. `--deny-scripts a,b` makes bare names.

### Precedence

- `denyScripts` is checked first and wins over every approval: the allowlist, `allowTopLevelScripts`, the local exemption and mode `all`. `off` is checked before it.
- `allowScripts` merges loosest to tightest: fynpo `fyn.options`, then `package.json`, then the command line. Approvals add up. A `false` at any scope is final.
- `denyScripts` unions across all three scopes. No scope removes another's denial.
- `scriptPolicy`: the command line overrides outright. Otherwise the stricter of the fynpo and `package.json` values wins (order `all`, `source`, `review`, `off`, loosest to strictest). A package can tighten but never loosen the monorepo's mode.
- `reviewLocalPackages`: on if any scope turns it on.

### Install-time behavior

- Under `review`, an install that would skip unapproved scripts stops before running scripts.
  - With a terminal and no CI, it lists the packages and asks `Approve? [a]ll / [s]elect / [n]one (default)`. Approved packages are written to `package.json` (or the monorepo `fynpo.json`) and run in this install.
  - Without a terminal, or on CI, it throws and exits 1: `N package(s) need approval to run their install scripts, and there is no terminal to ask on: ...`.
  - Denied packages are not prompted. They appear in the end summary.
- Under `source`, `all` and `off`, blocked scripts are reported at the end and the install continues.
- Blocked and pending records are saved in `.fyn.json` for `install-scripts ls`.

## Registry-only transitive dependencies

On by default. A transitive (not top-level) dependency from `github:`, git, `http(s)` tarball or an unparseable selector aborts the install with an error naming the package and its parent. Accepted: registry ranges and tags, `npm:` aliases, local `file:`/`link:`/path deps, fynpo siblings. The project's own `package.json` may use any source.

Precedence: an explicit option value (command line, rc, or fynpo `fyn.options.enforceRegistryDeps`) wins over `package.json` `fyn.enforceRegistryDeps`, which wins over the default (on). Only `false` in `package.json` turns it off.

## Exit codes summary

| Where | Code |
| --- | --- |
| Any command | 0 on success. |
| Parse error | 1. |
| Node older than 22.22.2 | 1. |
| Uncaught rejection in the bin wrapper | 1 (prints the error). |
| `install` | 1 on failure. 0 on success or "No Change". |
| `add`, `remove` | 1 for no package names. Install failures follow `install`. |
| `update` | 1 for a name that is not locked. Install failures follow `install`. |
| `outdated` | 1 when anything is outdated. Errors also 1. |
| `audit` | 0 even with findings. Failures logged only. |
| `run` | The script's exit code, else 1. Missing script 1 (0 with `--if-present`). |
| `install-scripts`, `prod-prune`, `sync-local`, `init` | 1 on any error. `prod-prune` also 1 when over budget. |
| `global` | 1 on missing arguments or a reported failure. |
| `--log-level` invalid | 1. |
| fynpo config parse failure | 1. |
| `package.json` unreadable | 1. |
| `--lock-only` with unreadable lockfile | 1. |
