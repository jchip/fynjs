# chalker demo packages

Each directory is an independent sample package that installs the local repo package with
`"chalker": "../.."`.

Run any sample from the repo root:

```sh
cd demo/legacy-cjs && fyn install && fyn test
```

Samples:

- `legacy-cjs`: `require("chalker")` from CommonJS.
- `ansi-colors-cjs`: `require("chalker")` with `chalker.CHALK = require("ansi-colors")`.
- `cjs-dynamic-import`: `await import("chalker")` from CommonJS.
- `esm-default`: default import from an ESM package.
- `esm-namespace`: namespace import from an ESM package.
- `esm-create-require`: `createRequire` from an ESM package.
- `esm-named-export-probe`: documents that named ESM imports are unsupported for this CommonJS package.
