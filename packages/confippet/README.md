# @fynjs/confippet

Managing NodeJS application configuration.

Private package. A recreation of [electrode-confippet] (last published 2021,
on the EOL `js-yaml@3` line), with the same API and behavior, brought onto
current dependencies and the monorepo's ESM/TypeScript conventions.

## Usage

```js
import { loadConfig } from "@fynjs/confippet";
import Path from "path";

const config = loadConfig({
  dir: Path.join(import.meta.dirname, "config")
});

console.log(config.$("server.port"));
```

Or use the preset store, composed from the environment:

```js
import config from "@fynjs/confippet/config";
// same object as:
import Confippet from "@fynjs/confippet";
Confippet.config;
```

## Composing

A config directory holds several partial files, which are merged in a fixed
order. Each may be `.json`, `.yaml`, `.js` or `.ts`; for JS/TS, a `default`
export is used if present, otherwise the whole module.

```
config/
  default.json          <- always
  default-0.yaml        <- NODE_APP_INSTANCE=0
  production.js         <- NODE_ENV=production
  local.json            <- optional, gitignored
```

The providers, in order: `default`, `default-{instance}`, `{deployment}`,
`{deployment}-{instance}`, the `{hostname}` and `{fullHostname}` variants,
the `local` variants, then `env` (disabled by default) and `confippetEnv`,
which reads `NODE_CONFIG` and any `CONFIPPET*` environment variable as JSON.

Arrays replace by default. A key starting with `+` unions instead, so a later
partial can add to a list rather than replace it:

```json
{ "+plugins": ["extra"] }
```

## Templates

String values may reference other config values or process state, resolved
after composition:

```json
{
  "host": "{{env.HOST}}",
  "url": "http://{{config.host}}:{{config.port}}",
  "secret": "{{readFile:/run/secrets/token}}",
  "region": "{{getEnv:AWS_REGION:upperCase}}",
  "literal": "{{-not a reference}}"
}
```

Available context: `config`, `process`, `argv`, `cwd`, `env`, `now`,
`readFile`, `getEnv`, plus anything passed as `options.context`. Unresolved
references become `""` and are returned by `processConfig` so a caller can
report them. Resolution repeats until stable, and throws after 20 passes so a
circular reference fails loudly.

## Environment

| variable | effect |
| --- | --- |
| `NODE_CONFIG_DIR` | directory to compose from |
| `NODE_CONFIG_DIR_0`, `_1`, … | additional directories, composed before `NODE_CONFIG_DIR` |
| `NODE_ENV` | the deployment, selecting `{deployment}.*` |
| `NODE_APP_INSTANCE` | the instance, selecting `*-{instance}.*` |
| `NODE_CONFIG`, `CONFIPPET*` | JSON merged in last |
| `AUTO_LOAD_CONFIG_OFF` | skip auto-loading entirely |
| `AUTO_LOAD_CONFIG_PROCESS_OFF` | compose but do not resolve templates |

Note `NODE_ENV` overrides an explicit `context.deployment` — the environment
wins, which matters under test runners that set `NODE_ENV=test`.

## API

`store()`, `composeConfig(options)`, `processConfig(config, options)`,
`loadConfig(options, defaults?, refresh?)`, `presetConfig.load/autoLoad`,
`providerTypes`, `extHandlers`, `util.merge/uMerge`.

A store carries two non-enumerable members so it otherwise reads as a plain
config object: `$(path)` to read a value, and `_$` for `use`, `defaults`,
`compose`, `process` and `reset`.

## Differences from electrode-confippet

- **ESM** with TypeScript declarations, Node >= 22.12. Upstream is CJS with
  `export =`. `require()` still works — Node supports requiring ESM.
- **`js-yaml` on the current major** instead of the EOL 3.x line. Upstream
  already called `load`, not the removed `safeLoad`, so behavior is unchanged.
- **`tslib` dropped** — the build does not emit helpers.
- **`require` inside the JS/TS ext handler** comes from `node:module`'s
  `createRequire`.
- **Bugfix:** `defaultOpts()` handed out the shared `extHandlers` module object
  by reference. Since options are merged in place by lodash, one caller passing
  custom `extHandlers` permanently corrupted the defaults for the whole process.
  It now returns a copy. There is a regression test for this.
- **`confippet.config`** is a lazily composed singleton shared with the
  `@fynjs/confippet/config` subpath, rather than a separate `config.js` file at
  the package root.

The upstream test suite is ported in full and passes at 100% coverage.

[electrode-confippet]: https://github.com/electrode-io/electrode-confippet
