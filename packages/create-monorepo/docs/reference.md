# @fynjs/create-monorepo reference

@fynjs/create-monorepo scaffolds a new fynpo monorepo. It writes a root `package.json` with fyn and fynpo as dev dependencies, a fynpo config file, an empty `packages/` directory and a few dotfiles. It is a CLI only.

For fynpo itself, see https://fynjs.pages.dev/ref/fynpo.md.

## Install and run

```
npx @fynjs/create-monorepo my-repo
npm init @fynjs/monorepo my-repo
```

- Both forms run the same CLI. `npm init @fynjs/monorepo` maps to `@fynjs/create-monorepo` by npm's `create-` convention.
- The package has two bins, `create-monorepo` and `create-fynpo`. They are the same program.
- The package has no `main` or `exports`. There is no JS API.
- Requires Node `^22.22.2 || ^24.15.0 || >=26.0.0`. The package is ESM only.

## Command line

```
create-monorepo [dir] [--commitlint]
create-monorepo fynpo [dir] [--commitlint]
```

- The only command is `fynpo`. When the first argument is anything else, the CLI inserts `fynpo` in front of it. So `create-monorepo my-repo` is `create-monorepo fynpo my-repo`.
- `dir` defaults to `.`, the current directory.
- To create a directory literally named `fynpo`, use `create-monorepo fynpo fynpo`. A lone `fynpo` is read as the command, so it targets the current directory.
- With no arguments at all, it prints usage and `Error: No command given`, then exits 1.
- `--help`, `-h` and `-?` print the command's help and exit 0. There is no `--version` option.

| Option | Default | Effect |
| --- | --- | --- |
| `--commitlint` | `false` | Write `fynpo.config.js` with a commitlint config instead of `fynpo.json`, and add husky and commitlint to `package.json`. |

## What it does

1. Pick the target directory. For `.`, it uses the current directory and prints `Using current directory '<name>' to create app`. Otherwise it creates `dir` if needed and changes into it. A directory that already exists is fine. Any other `mkdir` error prints `Failed to create app directory '<dir>'` and exits 1.
2. If the directory is not empty, prompt `Your directory '<dir>' is not empty, write to it?`. Answering no prints `Not able to write to directory '<dir>'. bye.` and stops before any file is written.
3. If the directory is not inside a git work tree (`git rev-parse --git-dir` fails), run `git init` and print `Initializing Git repository`. Inside an existing repo, it skips this.
4. Write the files below. Files that already exist are overwritten.
5. Print a success message with `cd <dir>` and `fyn` as next steps. With `--commitlint`, it also prints the husky command for the commit hook.

## Files written

| File | Content |
| --- | --- |
| `package.json` | Root package, see below. |
| `fynpo.json` | Without `--commitlint`. `changeLogMarkers: ["## Packages", "## Commits"]` and `command.publish` with empty `tags` and `versionTagging`. |
| `fynpo.config.js` | With `--commitlint`. The same settings plus a `commitlint` config. No `fynpo.json` is written. |
| `packages/` | Empty directory for the workspace packages. |
| `.gitignore` | macOS and Node ignores, plus `.fynpo`, `*-lock.*`, `fynpo-debug.log*` and `**.tsbuildinfo`. Note that `*-lock.*` ignores `fyn-lock.yaml`. |
| `.npmrc` | Comments only. No registry is pinned, so npm and fyn use your configured registry. |
| `README.md` | An empty file. |

The root `package.json`:

- `name: "root"`, `version: "0.0.1"`, `private: true`, `license: "UNLICENSED"`, with empty `description`, `homepage`, `author` and `repository` fields to fill in.
- `devDependencies`: `fyn`, `fynpo` and `prettier`. Dependency keys are sorted.
- The `fyn` and `fynpo` ranges are the ones this create-monorepo release was published with. They come from create-monorepo's own devDependencies. Each fyn or fynpo release updates them and republishes create-monorepo.
- `prettier: { printWidth: 100 }`.
- `scripts`:

| Script | Command |
| --- | --- |
| `bootstrap` | `fynpo` |
| `build` | `fynpo run build` |
| `test` | `fynpo run test` |
| `clean` | `npm run nuke && npm run nuke-packages` |
| `nuke` | `rm -rf node_modules fynpo-debug.log fyn-lock.yaml` |
| `nuke-packages` | `rm -rf packages/*/node_modules packages/*/fyn-lock.yaml` |

## `--commitlint`

- `package.json` also gets `scripts.prepare: "husky install"` and dev dependencies `@commitlint/config-conventional` and `husky`.
- `fynpo.config.js` extends `@commitlint/config-conventional` and parses headers in the form `[<type>] message`. The allowed types are `patch`, `minor`, `major` and `chore`. Commits starting with `[Publish]` or containing `Update changelog` are ignored.
- The hook is not installed for you. The success message prints the command to add it: `npx husky add .husky/commit-msg 'npx --no-install fynpo commitlint --edit $1'`.
- To add commitlint to a repo created without it, run `fynpo init --commitlint`.

## Next steps

```
cd my-repo
fyn
```

`fyn` installs the root dev dependencies, including fynpo. Add packages under `packages/`, then use fynpo's commands such as `fynpo` (bootstrap), `fynpo run <script>`, `fynpo version` and `fynpo publish`.
