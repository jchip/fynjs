# fynpo-cli reference

fynpo-cli is a global launcher. It installs a `fynpo` command that finds the `fynpo` package installed in the current directory's monorepo and runs it in-process. It has no logic, no dependencies and no bundled copy of fynpo.

For commands, flags and config, see https://fynjs.pages.dev/fynpo.md.

## Install

```
npm install -g fynpo-cli
```

- The package has no `main` or `exports`. It ships only the executable `dist/fynpo.js` (bin `fynpo`). There is no JS API.
- `package.json` sets `preferGlobal: true` and `dependencies: {}`.
- Requires Node `^22.22.2 || ^24.15.0 || >=26.0.0`. The bin uses top-level `await`, so it is ESM only.
- The target monorepo must have `fynpo` installed so that `fynpo/package.json` resolves from the current directory (normally a dev dependency at the repo top level).

## Relation to `fynpo`

- `fynpo` is the real tool. `fynpo-cli` only locates and starts it.
- Version selection: the launcher runs whichever `fynpo` version Node resolves from the current directory. The version of `fynpo-cli` does not matter. Different repos get the fynpo version they declare.
- There is no fallback to a global or bundled fynpo. If none resolves, it exits with an error.
- To skip this package, run the repo's local fynpo directly instead.

## How `fynpo` resolves and runs

1. Build a `require` rooted at `process.cwd()` (not at fynpo-cli's own location). Resolution follows normal Node lookup upward from the current directory, so it works from any subdirectory of the monorepo.
2. Resolve `fynpo/package.json`. If this throws for any reason, print the not-in-monorepo error and exit 1.
3. Read that package.json. The entry file is its `bin` field: the string if `bin` is a string, else `bin.fynpo`. If neither exists, default to `bin/fynpo.js`.
4. Join that path onto the directory of the resolved package.json.
5. Dynamic `import()` the file (as a `file://` URL). fynpo's bin runs its own main on load, so argv, stdout, stderr and the exit code are fynpo's own. The launcher has no argument handling or flags of its own, including `--help` and `--version`: they reach fynpo.

The launcher does not read fynpo's `dist/` layout. Only the `bin` field is relied on.

## Errors

Both errors go to stderr and exit with code 1.

| Condition | Message |
| --- | --- |
| `fynpo/package.json` does not resolve from the current directory | `ERROR: Unable to find the fynpo module from dir <cwd>`, then guidance to be in a fynpo monorepo with fynpo installed at its top level. |
| Import fails with `ERR_MODULE_NOT_FOUND` and the error text contains the bin path (leading `./` removed) | The same not-in-monorepo message. |
| Any other import failure, including errors thrown while fynpo loads | `Fail to load fynpo for your monorepo from dir <cwd>`, then the error object. |

Notes:

- The `ERR_MODULE_NOT_FOUND` check is a substring match on the error text. A missing dependency inside fynpo normally lacks the bin path and gets the load-failure message.
- Errors fynpo handles itself after it starts are not the launcher's. They carry fynpo's own output and exit code.
