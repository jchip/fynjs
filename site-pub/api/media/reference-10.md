# check-pkg-new-version-engine reference

`check-pkg-new-version-engine` is a generic engine for npm CLI packages to check whether a newer version of themselves is published. The caller injects the network fetch, the version comparison and the notification. The engine adds throttling, a small on-disk cache, and a repeat-notification rule. ESM only (`"type": "module"`), Node `^22.22.2 || ^24.15.0 || >=26.0.0`. Runtime dependencies: `ci-info`, `is-installed-globally`, `semver`.

## Imports

```js
import { checkPkgNewVersionEngine } from "check-pkg-new-version-engine";
```

```ts
import type {
  CheckNewVersionOptions,
  PkgInfo,
  NpmConfig,
  NotifyData,
  CheckResult,
} from "check-pkg-new-version-engine";
```

The root is the only entry point (plus `check-pkg-new-version-engine/package.json`). There is no default export.

Runtime exports: `checkPkgNewVersionEngine`.

Type-only exports: `PkgInfo`, `NpmConfig`, `NotifyData`, `CheckResult`, `CheckNewVersionOptions`.

Not exported: `internalNotify` (the default notifier) and `internalCheckIsNewer` (a semver-based comparison). The engine never calls `internalCheckIsNewer`. See `checkIsNewer`.

## `checkPkgNewVersionEngine(options)`

```ts
function checkPkgNewVersionEngine(options: CheckNewVersionOptions): Promise<any>
```

Checks the npm registry for a newer version of `options.pkg`, at most once per check interval, and calls a notify hook when one is found. Intended to be called fire-and-forget at CLI startup.

Never rejects. Any error thrown anywhere inside (bad options, hook exceptions, fetch failures that a hook rethrows, file write failures) is swallowed and the promise resolves `false`.

Return value:

| value | when |
| --- | --- |
| `false` | `ci-info` reports a CI environment (checked first, nothing else runs), or any error was thrown |
| `true` | the run completed without throwing, whether or not a fetch happened and whether or not anything was notified |

`true` does not mean a newer version exists or that a notification was sent.

### Flow

1. If `isCI` (from `ci-info`, evaluated at import time): return `false`. No fetch, no file access, no hooks.
2. Copy `options.pkg` to `{ name, version }`. Hooks receive this copy, never the original object.
3. `tag = options.checkTag || "latest"`.
4. `metaDir = path.join(options.saveMetaDir || os.tmpdir(), "check-pkg-new-version")`. Create it recursively. A mkdir failure is ignored.
5. `metaFile = path.join(metaDir, `${pkg.name}-${tag}-meta.json`)`. Read and `JSON.parse` it. Any read or parse failure gives `{ name, version, time: 0, notifiedVersion: "", notifiedTime: 0 }`.
6. `checkInterval = options.checkInterval || 86400000` (1 day).
7. `shouldFetch = now - meta.time >= checkInterval || !meta.distTags`.
8. If `shouldFetch` is false: return `true`. No hook is called and the meta file is not rewritten. The cached `distTags` are not compared again.
9. Otherwise fetch dist tags (see below), call `checkIsNewer(pkg, distTags, tag)`, maybe notify, write the meta file, return `true`.

### Option table

| option | type | default | behavior |
| --- | --- | --- | --- |
| `pkg` | `PkgInfo` | required | Package to check. `name` is used for the registry URL and the cache file name. `version` is the current version passed to `checkIsNewer`. A missing `pkg` throws internally, so the call resolves `false`. |
| `fetchDistTags` | `(url, authToken, pkg?) => Promise<Record<string,string>>` | none | Preferred fetch hook. Takes precedence over `fetchJSON` when both are set. See below for the arguments. |
| `fetchJSON` | `(url: string, options?: any) => Promise<any>` | none | Alternate fetch hook. Used only when `fetchDistTags` is not set. |
| `notifyNewVersion` | `(data: any) => void` | built-in console notifier | Called synchronously, not awaited, with `{ name, version, newVersion }`. |
| `saveMetaDir` | `string` | `os.tmpdir()` | Parent directory for the cache. Files go in `<saveMetaDir>/check-pkg-new-version/`. Empty string counts as unset. |
| `checkInterval` | `number` (ms) | `86400000` | Minimum time between registry fetches. Any falsy value (`0`, `undefined`) gives the default, so `0` cannot mean "always check". |
| `checkTag` | `string` | `"latest"` | Dist-tag to compare against. Also part of the cache file name. Empty string gives `"latest"`. |
| `checkIsNewer` | `(pkg, distTags, tag?) => CheckResult` | none (see note) | Decides whether `distTags[tag]` is newer than `pkg.version`. Typed optional but required in practice. |
| `npmConfig` | `NpmConfig` | none (see note) | Flat npm config used to pick registry and auth token. Typed optional but required in practice. |

Required in practice: if `checkIsNewer` is missing, the call `options.checkIsNewer(...)` throws after the fetch, the meta file is not written, and the result is `false`. If `npmConfig` is missing, `Object.keys(undefined)` throws when the registry is resolved, so nothing is fetched and the result is `false`. Pass `npmConfig: {}` for the npmjs default. The `NpmConfig` doc comment says it defaults to `{ registry: "https://registry.npmjs.org/" }`, but the engine applies no such default to the object. The README comment "without npm config the engine falls back to registry.npmjs.org" holds only for an empty object, not for `undefined`.

Required only when fetching: one of `fetchDistTags` or `fetchJSON` is needed only on a run where `shouldFetch` is true. If neither is set, an internal `Error("must provide one fetch method: fetchDistTags or fetchJSON")` is thrown and swallowed, so the result is `false` and nothing is saved.

## Registry and auth resolution

Done by an internal function, only on runs that fetch.

Scope: if `pkg.name.split("/")` has more than one part, `scope` is the first part (for example `@acme`). Otherwise `scope` is `""`.

Registry: the first key `k` of `npmConfig`, in `Object.keys` order, where `k.endsWith("registry")` and (`scope` is empty or `k.startsWith(scope)`). The value is used if truthy. Otherwise `npmConfig.registry`, otherwise `"https://registry.npmjs.org/"`. The registry string is used as is, and `new URL(registry)` must parse or the run fails (`false`).

- For a scoped package the plain `registry` key does not match the search (it does not start with the scope), so it is reached through the `npmConfig.registry` fallback. Same result.
- For an unscoped package, any key ending in `registry` matches, including `@scope:registry`. See pitfalls.

Auth token: let `regHost = "//" + new URL(registry).host + "/"` (host includes any port). The first key that ends with `_authToken` and starts with `regHost` wins. Otherwise `npmConfig._authToken`, otherwise `""`. The registry path is ignored.

## Fetch hooks

### `fetchDistTags`

```ts
fetchDistTags?(url: string | URL, authToken: string, pkg?: PkgInfo): Promise<Record<string, string>>
```

Called as `fetchDistTags(registry, authToken, { name, version })`. Despite the parameter name `url`, the first argument is the registry base string from the resolution above, not a package URL. The hook must build the package URL itself. It must resolve an object mapping dist-tag to version. A rejection or throw is not caught locally: it propagates, the run resolves `false`, and the meta file is not written (so the next call fetches again).

### `fetchJSON`

```ts
fetchJSON?(url: string, options?: any): Promise<any>
```

Used through the built-in packument fetch:

- URL: `new URL(encodeURIComponent(pkg.name), registry).toString()`. A scoped name becomes `@scope%2Fname`. Relative resolution applies: a registry with a path but no trailing slash (for example `https://host/npm`) loses its last segment.
- Second argument: `{ headers: { "user-agent": "check-pkg-new-version-fetch", accept: "application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*" } }`.
- The auth token is resolved but not used on this path. No authorization header is sent. Private registries need `fetchDistTags`.
- Result: `body["dist-tags"]`.
- Any error (including a rejection from `fetchJSON` or a null `body`) is caught and `{}` is used as the dist tags. A failed fetch is therefore treated as "no tags": it is cached for the whole interval and `checkIsNewer` runs against `{}`.
- If the body has no `dist-tags`, the value is `undefined`. It is passed to `checkIsNewer` and not saved as truthy, so the next call refetches.

## `checkIsNewer`

```ts
checkIsNewer?(pkg: PkgInfo, distTags: Record<string, string>, tag?: string): CheckResult
```

Called as `checkIsNewer({ name, version }, distTags, tag)` where `tag` is the resolved tag (never undefined). Called synchronously, only on fetch runs. Return `{ isNewer: true, version }` to trigger notification. If `isNewer` is truthy, `version` is used as `newVersion`, as the saved `notifiedVersion` and in the repeat-notification rule. A throw propagates to `false` and the meta file is not written.

The engine has no default comparison. The unexported `internalCheckIsNewer` is not wired in. Its rules, for reference when writing your own with `semver`:

- Uses `semver.valid` on both the current version and `distTags[tag]`. Either one invalid (or missing) gives `{ isNewer: false }`, no throw.
- `semver.gt(newer, current)` true gives `{ isNewer: true, version: newer }`, else `{ isNewer: false }`.
- Comparison is by semver precedence. `1.0.0-beta` is lower than `1.0.0`. An older `latest` never counts as newer.

The README example uses `semver.gt(distTags[tag], pkg.version)` directly. That throws on invalid input and on missing tags (swallowed to `false`, no meta write).

## Notification

After `checkIsNewer` returns, on fetch runs only:

```
notify if checked.isNewer
  && (notifiedVersion !== checked.version || now - notifiedTime > 7 days)
```

`notifiedVersion` and `notifiedTime` come from the meta file (`""` and `0` when absent or of the wrong type). A new version is notified once, and the same version is re-notified when more than 7 days have passed since the last notification. Since fetches happen at most once per `checkInterval`, a `checkInterval` longer than 7 days effectively re-notifies on each fetch.

The notify call is `(options.notifyNewVersion || internalNotify)({ name, version, newVersion })`. It is not awaited. A thrown error propagates, the meta file is not written, and the result is `false`.

When a notification is sent, `notifiedVersion` and `notifiedTime` are updated in the meta file. When not, the previous values are written back.

### Default notifier

Internal, not exported. It registers `process.on("exit", ...)` (one listener per call) that prints with `console.log`:

```
    New version '<name>' available <version> -> <newVersion>
    Run 'npm i [-g ]<name>@<newVersion>' to update.
```

`-g ` is included when `is-installed-globally` is true. The message prints at process exit, so it does not interleave with the host CLI output.

## Meta file

Path: `<saveMetaDir || os.tmpdir()>/check-pkg-new-version/<pkg.name>-<tag>-meta.json`.

Written only on fetch runs, after the notify step, as JSON:

```json
{ "name": "...", "version": "...", "distTags": {}, "time": 1700000000000, "notifiedVersion": "", "notifiedTime": 0 }
```

`time` is the start of the run (`Date.now()` taken before the fetch). `version` is the current package version at write time. It is not compared on read: after the host package upgrades, cached `distTags` stay in force until the interval elapses. The cache key is only name plus tag.

A write failure throws, so the result is `false`. If the notify hook already ran, the notification has been sent but not recorded. Concurrent processes are not coordinated.

## Types

```ts
type PkgInfo = { name: string; version: string };
type NpmConfig = Record<string, string>;
type NotifyData = PkgInfo & { newVersion: string };
type CheckResult = { isNewer: boolean; version?: string };
```

`CheckNewVersionOptions` members, as declared:

```ts
{
  pkg: PkgInfo;
  fetchDistTags?(url: string | URL, authToken: string, pkg?: PkgInfo): Promise<Record<string, string>>;
  fetchJSON?(url: string, options?: any): Promise<any>;
  notifyNewVersion?(data: any): void;
  saveMetaDir?: string;
  checkInterval?: number;
  checkTag?: string;
  checkIsNewer?(pkg: PkgInfo, distTags: Record<string, string>, tag?: string): CheckResult;
  npmConfig?: NpmConfig;
}
```

`NotifyData` is the shape actually passed to `notifyNewVersion`, although that hook is typed `data: any`. `NpmConfig` keys the engine reads: any key ending in `registry` (`registry`, `@scope:registry`), any key ending in `_authToken` (`//host/:_authToken`, `_authToken`).

## Known pitfalls

- Scoped package names break the cache. The meta file name includes `pkg.name`, so `@scope/x` becomes a path in a `@scope` subdirectory that is never created. Reads always miss and the write throws, so every call fetches, notifies again, and resolves `false`.
- An unscoped package can pick up a scoped registry: the first `*registry` key in iteration order wins, even `@other:registry`.
- `fetchJSON` swallows all fetch errors and caches the empty result for the full interval.
- On the `fetchJSON` path the auth token is never sent.

## Example

```js
import { checkPkgNewVersionEngine } from "check-pkg-new-version-engine";
import semver from "semver";

checkPkgNewVersionEngine({
  pkg: { name: "my-cli", version: "1.2.3" },
  npmConfig: {},
  checkInterval: 6 * 60 * 60 * 1000,
  fetchJSON: async (url, options) => (await fetch(url, options)).json(),
  checkIsNewer: (pkg, tags, tag) => {
    const v = tags?.[tag];
    return semver.valid(v) && semver.gt(v, pkg.version)
      ? { isNewer: true, version: v }
      : { isNewer: false };
  },
});
```
