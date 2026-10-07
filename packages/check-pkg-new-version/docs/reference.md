# check-pkg-new-version reference

`check-pkg-new-version` lets a published CLI tell its users when a newer version of itself exists. It wraps `check-pkg-new-version-engine` with a Node `fetch` based registry fetcher, a `semver` comparison, and `.npmrc` loading. ESM only (`"type": "module"`). Engine behavior (throttling, metadata file, notify rules) is documented at https://fynjs.pages.dev/check-pkg-new-version-engine.md.

## Imports

```js
import { checkPkgNewVersion } from "check-pkg-new-version";
import * as cpnv from "check-pkg-new-version";
```

Everything is a named export from the package root. There is no default export and no subpaths (only `check-pkg-new-version/package.json`).

Runtime exports: `checkPkgNewVersion` (defined here) and `checkPkgNewVersionEngine` (re-exported from the engine via `export *`).

Type-only exports (re-exported from the engine): `PkgInfo`, `NpmConfig`, `NotifyData`, `CheckResult`, `CheckNewVersionOptions`.

Not exported: `internalFetchJSON`, `internalCheckIsNewer`, `getNpmRcConfig`. They are reachable only as the defaults inside `checkPkgNewVersion`. The engine's `internalNotify` is also not exported.

## `checkPkgNewVersion(options)`

```ts
function checkPkgNewVersion(options: CheckNewVersionOptions): Promise<any>
```

Checks the registry for a newer version of `options.pkg`, at most once per `checkInterval`, and notifies when one is found. It fills in three defaults and delegates to `checkPkgNewVersionEngine`:

```js
checkPkgNewVersionEngine({
  fetchJSON: internalFetchJSON,       // default
  npmConfig,                          // options.npmConfig || await getNpmRcConfig()
  checkIsNewer: internalCheckIsNewer, // default
  ...options,                         // wins over the defaults above
});
```

Return value (from the engine): resolves `true` when the check ran to completion, including when the cache was fresh and no registry call was made. Resolves `false` in CI (`ci-info` `isCI`) or when anything threw. It never rejects, because the engine catches every error.

A resolved `true` does not mean a notification was shown or that metadata was saved. See Failure behavior.

### Options

`CheckNewVersionOptions`:

| option | type | default | behavior |
| --- | --- | --- | --- |
| `pkg` | `{ name: string; version: string }` | none, required | Package to check and the version currently running. Only `name` and `version` are read. If missing, the engine throws internally and the call resolves `false`. |
| `notifyNewVersion` | `(data: any) => void` | engine's console notifier | Called with `{ name, version, newVersion }` when a newer version is found and not already notified. See Notification. |
| `checkInterval` | `number` (ms) | `86400000` (1 day) | Minimum time between registry fetches. A falsy value (`0`, `undefined`) means 1 day. It cannot force a check on every run. |
| `saveMetaDir` | `string` | `os.tmpdir()` | Parent directory of the cache. Files go under `<saveMetaDir>/check-pkg-new-version/`. |
| `checkTag` | `string` | `"latest"` | Dist-tag to compare against. Falsy means `"latest"`. |
| `npmConfig` | `Record<string, string>` | parsed `.npmrc` files | Config used to find the registry URL and auth token. Replaces `.npmrc` loading when truthy. |
| `fetchJSON` | `(url: string, options?: any) => Promise<any>` | internal `fetch` based fetcher | Fetches the packument JSON. Called as `fetchJSON(url, { headers })`. The engine reads `body["dist-tags"]`. |
| `fetchDistTags` | `(url: string \| URL, authToken: string, pkg?: PkgInfo) => Promise<Record<string, string>>` | none | Alternative to `fetchJSON`. When set, the engine uses it and ignores `fetchJSON`. It receives the registry base URL, not a package URL. |
| `checkIsNewer` | `(pkg: PkgInfo, distTags: Record<string, string>, tag?: string) => CheckResult` | internal semver comparison | Decides whether `distTags[tag]` is newer than `pkg.version`. |

Because `...options` is spread last, a key that is present with the value `undefined` overrides the default. `{ fetchJSON: undefined }`, `{ checkIsNewer: undefined }` or `{ npmConfig: undefined }` makes the call resolve `false` (see Quirks). Omit the key instead.

Types, all re-exported from the engine:

```ts
type PkgInfo = { name: string; version: string };
type NpmConfig = Record<string, string>;
type NotifyData = PkgInfo & { newVersion: string };
type CheckResult = { isNewer: boolean; version?: string };
```

### Where state is stored

One JSON file per package and tag:

```
<saveMetaDir || os.tmpdir()>/check-pkg-new-version/<pkg.name>-<tag>-meta.json
```

Content: `{ name, version, distTags, time, notifiedVersion, notifiedTime }`. The directory is created with `mkdir -p`; a mkdir failure is ignored. A missing or unparseable file is treated as no previous check. The file is written only after a registry fetch.

The default location is the OS temp dir, so the cache can disappear on reboot or temp cleanup and the next call fetches again.

### How often it checks

- The registry is fetched when the cache has no `distTags`, or when `now - meta.time >= checkInterval`.
- Otherwise nothing is fetched, compared or notified. The call resolves `true` after reading the file.
- After a fetch, the compare and notify step runs and the file is rewritten with `time = now`.
- A new version is announced when `checkIsNewer(...).isNewer` is true and either `notifiedVersion !== checked.version` or more than 7 days passed since `notifiedTime`.

The compare runs only on fetch, so a version found newer is announced once per version (or once per 7 days), not on every run.

### Registry and auth resolution

Done by the engine from `npmConfig`:

- Registry: the first config key that ends with `registry` (and, for scoped names like `@scope/pkg`, starts with `@scope`), else `npmConfig.registry`, else `https://registry.npmjs.org/`.
- Auth token: first key ending with `_authToken` and starting with `//<registry host>/`, else `npmConfig._authToken`, else `""`.
- The packument URL is `new URL(encodeURIComponent(pkg.name), registry)`.

With `fetchJSON`, the engine sends only `user-agent: check-pkg-new-version-fetch` and an `accept` header. The auth token is not passed to `fetchJSON`, so the default fetcher never authenticates. Private registries that require a token need a custom `fetchDistTags`, which receives the token as its second argument.

### Default `.npmrc` loading

When `options.npmConfig` is falsy, the config is `{ ...parse(~/.npmrc), ...parse(<process.cwd()>/.npmrc) }`.

- Parsed with the `ini` package. The cwd file overrides the home file key by key.
- A missing or unparsable file contributes `{}`. No error surfaces.
- Not read: global npmrc, parent directories of the cwd, `NPM_CONFIG_*` environment variables, `${VAR}` expansion in values.
- The type is `Record<string, string>`, but `ini.parse` can return other value types (booleans, nested objects for `[section]` headers). Nothing coerces them.
- The files are read on every call, including when the cache is fresh.

### Default fetcher

Internal `internalFetchJSON(url, { headers, timeout })`:

- Uses Node's global `fetch` with `headers` and `AbortSignal.timeout(timeout)`. The default timeout is 10000 ms. The engine passes only `{ headers }`, so the timeout is always 10 s on the default path.
- Returns `resp.json()` when `resp.ok`.
- Returns `{}` for any failure: non-2xx status, network error, abort, invalid JSON, invalid URL. It never throws.

### Default comparison

Internal `internalCheckIsNewer(pkg, distTags, tag)`:

```ts
{ isNewer: semver.gt(distTags[tag], pkg.version), version: distTags[tag] }
```

- Uses `semver.gt`, so prerelease ordering follows semver. `1.0.0-beta` is older than `1.0.0`.
- `version` is returned in all cases, also when `isNewer` is `false`.
- It throws (`TypeError`) when either version is not a valid semver string, when the tag is missing from `distTags`, or when `distTags` is `undefined`. The engine catches it and the call resolves `false`.
- This differs from the engine's own default comparison, which returns `{ isNewer: false }` on invalid input.

### Notification

When `notifyNewVersion` is not given, the engine's console notifier runs. It registers a `process.on("exit")` handler that prints, via `console.log`:

```
(blank line)
    New version '<name>' available <version> -> <newVersion>
    Run 'npm i [-g ]<name>@<newVersion>' to update.
(blank line)
```

`-g ` is included when the package is installed globally (`is-installed-globally`). Nothing is printed until the process exits. A custom `notifyNewVersion` is called synchronously during the check. If it throws, the engine catches it, the call resolves `false` and the meta file is not written.

### Example

```js
import { checkPkgNewVersion } from "check-pkg-new-version";

// fire and forget at CLI startup; never rejects
checkPkgNewVersion({
  pkg: { name: "my-cli", version: "1.2.3" },
  checkInterval: 6 * 60 * 60 * 1000,
  notifyNewVersion: ({ name, version, newVersion }) =>
    console.error(`${name} ${newVersion} is available (you have ${version})`)
});
```

### Failure behavior

- In CI (`ci-info`): resolves `false` immediately, no files read or written, no network.
- Any error in the check is swallowed and the call resolves `false`. Examples: bad `pkg`, bad registry URL in config, invalid versions, throwing callbacks, an unwritable meta directory when saving.
- Fetch failure with the default fetcher: `internalFetchJSON` returns `{}`, the engine reads `{}["dist-tags"]` which is `undefined`, and the default `checkIsNewer` throws on `undefined[tag]`. Result: resolves `false` and the meta file is not written, so the next call fetches again. The check retries on every run until a fetch succeeds, each costing up to 10 s.
- The meta write happens after the notify callback. If the write fails, the notification has already fired and will fire again on the next run.
- A cache read failure only means a fetch happens.

### Quirks

Found by reading the code, not by running it.

- Scoped packages never cache. The meta file name is `<pkg.name>-<tag>-meta.json`, so `@scope/pkg` becomes `.../check-pkg-new-version/@scope/pkg-latest-meta.json`. Only `check-pkg-new-version/` is created, not `@scope/`, so the write fails with `ENOENT`, the call resolves `false`, and each run fetches and notifies again.
- A missing tag in `dist-tags` (for example `checkTag: "beta"` when the package has no `beta`) throws in the default `checkIsNewer` and resolves `false`, with no meta saved, so it refetches every run.
- Present-but-undefined option keys override defaults (see Options).
- `checkInterval: 0` means 1 day, not "always".

### README mismatches

- README says `saveMetaDir` defaults to `os.tmpdir()`. Files actually go in an `os.tmpdir()/check-pkg-new-version/` subdirectory.
- README says `checkInterval` is a wait with no default. The default is 1 day.
- README lists `fetchJSON` as the fetch override and omits `fetchDistTags`, which is also accepted and takes priority.
- README says the package reads the registry URL and auth token from `.npmrc`. The token is only passed to `fetchDistTags`. The default fetcher does not send it.
- README does not say the default `checkIsNewer` throws on a missing tag or invalid version.
