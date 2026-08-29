# chalker demo packages

Each directory is an independent sample package that installs the local repo package with
`"chalker": "../.."`.

Run any sample from the repo root:

```sh
cd demo/legacy-cjs && fyn install && fyn test
```

`chalker` is a real ESM-only package (`"type": "module"`). Node's `require(esm)` support
(Node >=22.12) lets CommonJS `require()` an ESM module, but the result is the module's
namespace object - the same shape `await import()` gives - so CJS consumers need to unwrap
`.default`.

Samples:

- `legacy-cjs`: `require("chalker").default` from CommonJS.
- `ansi-colors-cjs`: `require("chalker").default` with `chalker.CHALK = require("ansi-colors")`.
- `cjs-dynamic-import`: `await import("chalker")` from CommonJS.
- `esm-default`: default import from an ESM package.
- `esm-namespace`: namespace import from an ESM package.
- `esm-create-require`: `createRequire(...)("chalker").default` from an ESM package.
- `esm-named-export-probe`: documents that named ESM imports (`import { remove } from "chalker"`) are unsupported since `chalker` only exports a default.
