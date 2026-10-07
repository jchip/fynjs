# xenv-config reference

`xenv-config` builds a config object from a spec. Each key is resolved from an env var, a user config object, or a default, and every resolved key gets a trace record that says where it came from. No runtime dependencies. ESM only (`"type": "module"`).

## Imports

```js
import xenvConfig from "xenv-config";
```

```ts
import xenvConfig, {
  type XenvConfigTrace,
  type XenvConfigSpecOption,
  type XenvConfigSpec,
  type XenvConfigEnv,
  type XenvConfigUserConfig,
  type XenvConfigMergeFn,
  type XenvConfigOptions,
  type XenvConfigResult
} from "xenv-config";
```

The only runtime export is the default export, the function `xenvConfig`. There are no named runtime exports and no subpaths (only `xenv-config/package.json`). The package has no CommonJS build, so `require("xenv-config")` as shown in the README does not apply to this version; use `import`.

Type-only exports: `XenvConfigTrace`, `XenvConfigSpecOption`, `XenvConfigSpec`, `XenvConfigEnv`, `XenvConfigUserConfig`, `XenvConfigMergeFn`, `XenvConfigOptions`, `XenvConfigResult`.

Not exported: the internal `typeGetters` table, `getEnvName` and `FoundValue`.

## `xenvConfig(spec, userConfig?, options?)`

```ts
const xenvConfig: <T = Record<string, unknown>>(
  spec: XenvConfigSpec,
  userConfig?: XenvConfigUserConfig,
  options?: XenvConfigOptions
) => XenvConfigResult<T>;
```

Resolves every key of `spec` and returns a new plain object. It is synchronous. `T` is only a type cast of the result; nothing is checked against it.

| Parameter | Type | Default | Behavior |
| --- | --- | --- | --- |
| `spec` | `XenvConfigSpec` | required | Keys are iterated with `Object.keys(spec)`. Each value is a `XenvConfigSpecOption`. `undefined` or `null` `spec` throws a `TypeError`. |
| `userConfig` | `XenvConfigUserConfig` | `{}` | Values supplied by the caller. A falsy value is replaced with `{}`. |
| `options` | `XenvConfigOptions` | none | See `XenvConfigOptions`. |

For each spec key the function:

1. Finds a value by walking the sources (see Source order).
2. If nothing is found, the key is skipped. It is absent from the result and from `__$trace__`. `post` is not called.
3. Otherwise records the trace, runs `post` if the spec has one, and stores the result.

### Source order

Three sources exist, each named by a string:

| Source name | Looks in | Found when | Trace |
| --- | --- | --- | --- |
| `"env"` | env object (`options._env` or `process.env`) | the spec has an own `env` property that names a variable that is an own property of the env object | `{ src: "env", name }` |
| `"option"` | `userConfig` | `userConfig` has the key as an own property | `{ src: "option" }` |
| `"default"` | spec | the spec has an own `default` property | `{ src: "default" }` |

The default order is `["env", "option"]`, and `"default"` is appended last. For non-json types the first source that finds a value wins and the rest are not consulted.

Reorder with `options.sources`. Example: `sources: ["option", "env"]` makes user config beat env. A source left out of the list is never consulted, except `"default"`, which is always appended. Rules:

- Presence is tested with `Object.prototype.hasOwnProperty`. A present key whose value is `undefined`, `null`, `""` or `false` still counts as found. An empty string env var is found.
- Inherited properties are not seen, on `spec` entries, `userConfig` and the env object.
- `options.sources` is mutated. The function calls `push("default")` on the array you pass in. See Quirks.
- A source name other than `"env"`, `"option"` or `"default"` throws a `TypeError` (`getters[s] is not a function`) when that key is resolved.
- The `"default"` entry: if `default` is a function it is called with no arguments and its return value is used. A function is never type-coerced.

### Env lookup

The env var name is chosen from `spec[key].env`, which is read only when `env` is an own property of the spec option.

| `env` value | Name used |
| --- | --- |
| absent, `false`, `""` | none, the env source finds nothing |
| `true` | the spec key itself |
| `string` | that exact name |
| `string[]` | the first name in the list that is an own property of the env object |

If the chosen name is not an own property of the env object, the env source finds nothing. For an array, the match requires own presence, so a present empty string wins over a later name. An empty array finds nothing.

When a name is found, the raw value is `env[name]`, then:

1. If `envMap` is set and has the raw value as an own key, the mapped value is used as is. No type coercion is applied to it (`post` still runs). The raw value is used as a property key, so a non-string raw value is converted to a string for the lookup.
2. Otherwise the raw value is coerced by the key's type (see Types).

## `XenvConfigSpecOption`

```ts
interface XenvConfigSpecOption {
  env?: string | string[] | boolean;
  envMap?: Record<string, unknown>;
  type?: string;
  default?: unknown;
  post?: (value: unknown, trace: XenvConfigTrace) => unknown;
  [extra: string]: unknown;
}
```

All fields are optional. A spec option with none of them resolves only from `userConfig`. Extra properties are allowed by the type and ignored by the code.

| Field | Type | Default | Behavior |
| --- | --- | --- | --- |
| `env` | `string \| string[] \| boolean` | none | Which env var to read. See Env lookup. |
| `envMap` | `Record<string, unknown>` | none | Maps raw env strings to final values. Only applies to the env source. Checked before type coercion. A hit skips coercion. |
| `type` | `string` | inferred | How to coerce an env string. See Types. Applies only to env values, not to `userConfig` values or defaults, except that `json` also changes how all sources combine. |
| `default` | `unknown` | none | Fallback value, or a function that returns it. Presence is tested as an own property, so `default: undefined` counts as a default and yields `undefined`. A function default is called each time `xenvConfig` runs. Not coerced. |
| `post` | `(value, trace) => unknown` | none | Runs on the resolved value after a source is found. Its return value is stored in the result. Receives the same trace object that is stored in `__$trace__`, so mutating it changes the stored trace. Not called when the key is not found. Runs for every source, including `option` and `default`. |

## Types

The type for a key is decided by `type` first, then inference:

1. `opt.type` if truthy.
2. Else `typeof opt.default` when `default` is an own property and its `typeof` is not `"function"`.
3. Else `"string"`.

Then `"object"` is rewritten to `"json"`. A type name not listed below falls back to the `string` converter. Only `"json"` (after the rewrite) triggers merge behavior.

| Type | Converter for an env value `x` | Notes |
| --- | --- | --- |
| `string` | `` `${x}` `` | Also the fallback for any unknown type name. |
| `number` | `parseInt(x, 10)` | Integer. A non-numeric string gives `NaN` (JSON serializes it as `null`). `"1.9"` gives `1`. |
| `float` | `parseFloat(x)` | |
| `boolean` | lower-cased `x` is `"true"`, `"yes"`, `"1"` or `"on"` | Case-insensitive. Any other string gives `false`. A non-string raw value throws (see Errors). |
| `truthy` | `!!x` | An empty string gives `false`. Any non-empty string, including `"false"` and `"0"`, gives `true`. |
| `json` | `JSON.parse(x)` | Needs strict JSON. `{b:90}` is invalid. See json merging. |

Inference from `default`:

| `typeof default` | Inferred type |
| --- | --- |
| `"string"` | `string` |
| `"number"` | `number` (integer, `parseInt`) |
| `"boolean"` | `boolean` |
| `"object"` | `json` (this includes `null` and arrays) |
| `"undefined"` (own property set to `undefined`) | no converter of that name, so `string` conversion |
| `"function"`, or no `default` | `string` |

An explicit `type` always overrides inference. `type: "object"` is accepted as an alias of `json`.

### json merging

When the resolved type is `json`, sources are not first-wins. Every source in `sources` (plus `"default"`) is consulted. All found values are merged.

- The env value is parsed with `JSON.parse`, or taken from `envMap` when a mapping hits.
- Merge call: `merge({}, ...values)` where values are ordered lowest priority first. With the default order the call is `merge({}, defaultValue, optionValue, envValue)`, so env wins, then option, then default. With a custom `sources`, the earlier a source is in the list, the higher its priority.
- `merge` is `options.merge` or `Object.assign` (shallow). Pass a deep merge such as lodash `merge` for nested objects.
- The result is always a new object, so defaults and user config are not mutated by the merge.
- If no source finds a value, the key is skipped.
- Values are merged as given. With `Object.assign`, a string merges as indexed characters, an array as indexed keys, and `null` or `undefined` is ignored.
- The trace is `{ src: "<names joined by comma>" }`, in `sources` order, only for the sources that found a value, for example `"env,option,default"` or `"option,default"`. It has no `name` field, even when env contributed.

## `XenvConfigOptions`

```ts
interface XenvConfigOptions {
  _env?: XenvConfigEnv;
  merge?: XenvConfigMergeFn;
  sources?: string[];
}
```

| Option | Type | Default | Behavior |
| --- | --- | --- | --- |
| `_env` | `XenvConfigEnv` (`Record<string, unknown>`) | `process.env` | Env-like object to read. Used when truthy. Values need not be strings, but `boolean` rejects non-strings. |
| `merge` | `XenvConfigMergeFn` | `Object.assign` | Called as `merge.apply(null, [{}, ...values])` for json keys. Must return the merged object. Its return value is used as the key's value. |
| `sources` | `string[]` | `["env", "option"]` | Ordered source names to consult. `"default"` is always appended, after your list. The array is mutated. |

## Result

```ts
type XenvConfigResult<T = Record<string, unknown>> = T & {
  readonly __$trace__: Record<string, XenvConfigTrace>;
};

interface XenvConfigTrace {
  src: string;
  name?: string;
}
```

The result is a plain `{}` with one property per resolved spec key, in spec key order.

- `__$trace__` is defined with `Object.defineProperty`: `enumerable: false`, `writable: false`, `configurable: false`. It is skipped by `Object.keys`, spread, `JSON.stringify` and deep-equal checks, but is read as `config.__$trace__`. Copying the object with spread or `Object.assign` drops it.
- `__$trace__[key]` exists exactly when `key` is in the result.
- `trace.src` is `"env"`, `"option"`, `"default"`, or for json keys a comma-joined list of those.
- `trace.name` is set only for non-json keys resolved from env. It holds the env var name actually used, which is useful with an `env` array.
- Values from `userConfig` and `default` are stored by reference, not cloned (non-json keys).

```js
const config = xenvConfig(
  {
    port: { env: ["APP_PORT", "PORT"], type: "number", default: 8080 },
    debug: { env: true, type: "boolean" },
    opts: { env: "OPTS", type: "json", default: { a: 1 } }
  },
  { opts: { b: 2 } },
  { _env: { PORT: "9000", OPTS: '{"c":3}' } }
);
// config: { port: 9000, opts: { a: 1, b: 2, c: 3 } }  (debug is absent)
// config.__$trace__:
//   port: { src: "env", name: "PORT" }
//   opts: { src: "env,option,default" }
```

## Errors

Nothing is caught or wrapped. All errors are thrown synchronously from `xenvConfig`.

| Condition | Error |
| --- | --- |
| `boolean` type and the env value (or `_env` value) is not a string | `AssertionError` from `node:assert`, message `xenv-config: [<key>] trying to convert non-string env value <value> to boolean.` |
| `json` type and the env string is not valid JSON | `SyntaxError` from `JSON.parse` |
| `sources` contains an unknown name | `TypeError` (`getters[s] is not a function`) |
| `spec` is `undefined` or `null` | `TypeError` from `Object.keys` |
| A function `default`, `post`, or `merge` throws | the error propagates unchanged |
| `type: "json"` where `x` is not a string, such as a non-string `_env` value | `JSON.parse` coerces it to a string first, so it may parse or throw `SyntaxError` |

Absence of a value is not an error. Missing keys are left out of the result.

## Quirks

- `options.sources` is mutated by `push("default")`. Reusing the same array in a later call adds another `"default"`. For json keys this repeats the default in the merge and in the trace (`"option,default,default"`). Pass a fresh array each call.
- `type: "json"` needs strict JSON in env. The README example `JSON_OPTION = "{b:90}"` throws `SyntaxError`; use `'{"b":90}'`.
- `default: null` or an array default infers type `json`, so the key resolves to a new merged object (`{}` for `null`, `{0: ...}` for an array), not to `null` or the array.
- `number` env values that are not integers give `NaN` rather than an error. Empty env strings give `NaN`.
- `envMap` hits are returned as is, with no coercion by `type`.
- `userConfig` values and defaults are never coerced, only env values are.
- A key present in the env object with value `undefined` counts as found. For `string` type it yields the string `"undefined"`.
- The README says the order is env, option, default. The code matches this by default, but only `"default"` is forced last. The README does not document `options.sources`.
- The README says `boolean` is `x === "true" || ...`. The code lower-cases first, so `"TRUE"` is `true`.
