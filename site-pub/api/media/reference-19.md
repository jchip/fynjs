# unwrap-npm-cmd reference

`unwrap-npm-cmd` rewrites a command string so that, on Windows, an npm-generated `.cmd` batch shim is replaced by `node.exe` plus the real JS file the shim runs. That lets you spawn the command without a shell and without the batch wrapper. On non-Windows platforms `unwrapNpmCmd` returns its input unchanged. The package has one runtime dependency, `which`. The source is ESM (`"type": "module"`) and a CJS shim is provided.

## Imports

```js
import unwrapNpmCmd, { unwrapNpmCmd, resolveNpmCmd, quote, unquote, relative } from "unwrap-npm-cmd";
import type { UnwrapOptions, ResolveResult, ResolveOptions } from "unwrap-npm-cmd";
```

```js
const unwrapNpmCmd = require("unwrap-npm-cmd");
const { resolveNpmCmd, quote, unquote, relative } = require("unwrap-npm-cmd");
```

There are no subpaths (only `unwrap-npm-cmd/package.json`).

Runtime exports: `default` (same function as `unwrapNpmCmd`), `unwrapNpmCmd`, `resolveNpmCmd`, `quote`, `unquote`, `relative`.

Type-only exports: `UnwrapOptions`, `ResolveResult`, `ResolveOptions`.

CJS: `index.cjs` does `require("./dist/index.js")` and exports `Object.assign(m.default, m)`. So `require("unwrap-npm-cmd")` is the `unwrapNpmCmd` function itself, with `unwrapNpmCmd`, `default`, `resolveNpmCmd`, `quote`, `unquote` and `relative` copied onto it as properties. This mutates the ESM default function object. It relies on `require()` of an ES module, so it needs a Node version that supports that (the `engines` field is `^22.22.2 || ^24.15.0 || >=26.0.0`).

## `unwrapNpmCmd(cmd, options?)`

```ts
interface UnwrapOptions {
  path?: string;
  relative?: boolean;
  cwd?: string;
  jsOnly?: boolean;
}

function unwrapNpmCmd(
  cmd: string,
  options: UnwrapOptions = { path: process.env.PATH }
): string

export default unwrapNpmCmd;
```

Returns a command string. Never throws for a command that cannot be resolved; it returns `cmd` unchanged.

Algorithm:

1. If `process.platform !== "win32"`, return `cmd` unchanged. `options` is ignored.
2. Split `cmd` on the single space character `" "`. The first piece is the executable name. The rest are kept as is.
3. Resolve the executable name with `resolveNpmCmd(name, options)`. If it throws (for example `which` finds nothing), return `cmd` unchanged.
4. If `resolveNpmCmd` returned a string (the found path, quoted), replace the first piece with that string.
5. If it returned `{ jsFile }`:
   - With `options.relative` truthy, `jsFile = relative(jsFile, options.cwd)`.
   - With `options.jsOnly` truthy, the replacement is `quote(jsFile)`.
   - Otherwise the replacement is `quote(process.execPath) + " " + quote(jsFile)`.
6. Join the replacement and the remaining pieces with single spaces and return.

The returned string is `cmd` itself when the replacement equals the first piece. Remaining arguments are never parsed, quoted or changed.

### Options

| option | type | default | behavior |
| --- | --- | --- | --- |
| `path` | `string` | `process.env.PATH`, only when `options` is omitted entirely | Search path passed to `which` in place of `PATH`. If you pass an options object without `path`, `which` falls back to its own default (`process.env.PATH`). Also used as the cache key (see below). |
| `relative` | `boolean` | falsy | Convert the JS file path to a path relative to `cwd` using `relative()`. Applies only when a batch shim was unwrapped. |
| `cwd` | `string` | `process.cwd()` | Base directory for `relative`. Has no effect without `relative`. |
| `jsOnly` | `boolean` | falsy | Return only the quoted JS file path, without `node.exe`. Applies only when a batch shim was unwrapped. |

The whole options object is also passed to `which.sync`, so any `which` option present on it (such as `pathExt`) is honored. Only the four fields above are declared in `UnwrapOptions`.

### Which command strings are unwrapped

Only the first space-separated token is examined, so `"npm test"` looks up `npm` and keeps `test`. Outcomes for that token on Windows:

| the token resolves to | result |
| --- | --- |
| a `.cmd` file (extension compared case-insensitively) with a recognized node launch line | node.exe plus JS file, or the JS file alone with `jsOnly` |
| a `.cmd` file with no recognized launch line | the full path of the `.cmd`, quoted |
| any file without a `.cmd` extension (such as `.exe`) | the full path as found by `which`, quoted. `relative` and `jsOnly` are ignored for this case |
| nothing found, or any other error while resolving | `cmd` unchanged |

Because only a plain space splits the string, a command with a quoted executable path containing spaces, or with tab separators, is not tokenized properly. The first token is then looked up literally and normally fails, so `cmd` comes back unchanged.

### Caching

Results are cached in a module-level object keyed by `options.path || ""` and then by the executable name. A cache hit skips `which` and the batch file read. Details:

- The cache stores the result of `resolveNpmCmd` (string or `{ jsFile }`), before `relative` and `jsOnly` are applied. Different `relative`, `cwd` and `jsOnly` values therefore share an entry.
- Failures are cached too, as the bare name. A command that was not found keeps coming back unchanged for that `path` even if it is installed later.
- There is no invalidation and no exported way to clear the cache.
- `options.path` is the key, not `process.env.PATH`. A call with `options` omitted uses the `PATH` value at that call as the key.

### Examples

```js
unwrapNpmCmd("npm test");
// "C:\...\node.exe" "C:\...\node_modules\npm\bin\npm-cli.js" test
unwrapNpmCmd("npx mocha", { relative: true });
// "C:\...\node.exe" ".\...\npx-cli.js" mocha
unwrapNpmCmd("mocha test", { jsOnly: true });
// "C:\...\node_modules\mocha\bin\mocha" test
unwrapNpmCmd(`find "name" package.json`);
// "C:\WINDOWS\system32\find.EXE" "name" package.json
```

## `resolveNpmCmd(exe, options?)`

```ts
interface ResolveResult {
  jsFile: string;
}

interface ResolveOptions {
  path?: string;
}

function resolveNpmCmd(exe: string, options?: ResolveOptions): string | ResolveResult
```

The lower-level resolver used by `unwrapNpmCmd`. It does no platform check and no caching, and it does not catch errors.

Steps:

1. `which.sync(exe, options)` finds the executable. `options` is passed straight through, so `path` and other `which` options apply. If `which` finds nothing it throws, and `resolveNpmCmd` lets that propagate.
2. If the found path does not end in `.cmd` (case-insensitive), return `quote(foundPath)`. This is a string, not an object.
3. Otherwise read the file and split it on `"\n"`, trimming each line (so `\r` is removed).
4. Pick the line that holds the node launch, by the lower-cased base name of the `.cmd` file:
   - `npm.cmd`: the first line starting with `SET "NPM_CLI_JS=`. The text `NPM_CLI_JS=` is removed from that line.
   - `npx.cmd`: the first line starting with `SET "NPX_CLI_JS=`. The text `NPX_CLI_JS=` is removed.
   - any other `.cmd`: the first line starting with `"%~dp0\node.exe"`, else the first line starting with `"%_prog%"`.
5. If no line matched, return `quote(foundPath)` (the `.cmd` path itself).
6. Take the second space-separated token of the chosen line, with empty tokens ignored. For npm/npx that is the quoted JS path left after removing `SET`. For other shims it is the token after `"%~dp0\node.exe"` or `"%_prog%"`, such as `"%dp0%\node_modules\mocha\bin\mocha"`.
7. In that token, replace the first `%~dp0` and the first `%dp0%` with the directory of the `.cmd` file. Each replacement changes only the first occurrence.
8. Normalize with `Path.normalize`, strip surrounding quotes with `unquote`, then wrap with `quote`, and return `{ jsFile }`. `jsFile` is therefore quoted and normalized. (A code branch for Node older than 18 skips the `unquote` and `quote` steps, but `engines` excludes those versions.)

Failure behavior: throws if `which` finds nothing, if reading the `.cmd` file fails, or if the chosen line has no second token (the `.replace` call runs on `undefined` and throws a `TypeError`). A missing launch line is not a failure; it returns the quoted `.cmd` path.

Limits: the line match is a prefix test on the trimmed line. The second token is found by splitting on spaces, so a JS path that contains a space inside the batch file is cut at the space. Only the first launch line is used. On non-Windows platforms the function still runs. It finds executables with `which` and returns the quoted path, since non-Windows commands rarely have a `.cmd` extension.

## `quote(x)`

```ts
const quote: (x: string) => string
```

Returns `x` unchanged if it already starts with `"`. Otherwise returns `"` + `x` + `"`. Only the start is checked, so `"abc` is returned as is. No escaping is done. An empty string becomes `""`.

## `unquote(x)`

```ts
const unquote: (x: string) => string
```

Trims whitespace, then removes every run of `'` and `"` characters from the start and the end. Single and double quotes are both removed, and mixed runs such as `'"x"'` are fully removed. Inner quotes are kept.

## `relative(x, cwd?)`

```ts
const relative: (x: string, cwd?: string) => string
```

Returns the path of `unquote(x)` relative to `cwd` (default `process.cwd()`), using `path.relative` of the running platform. The result is not quoted. If the relative path does not begin with `.`, the prefix `.` + `path.sep` is added (`.\` on Windows, `./` elsewhere). The check is only on the first character, so a name such as `.bin\x` is left without an extra prefix. When `path.relative` returns an absolute path (different drive on Windows), the prefix is still added, giving a path like `.\D:\x`.

## `UnwrapOptions`, `ResolveResult`, `ResolveOptions`

Type-only exports. Their definitions are shown under `unwrapNpmCmd` and `resolveNpmCmd`. `ResolveOptions` declares only `path`.

## Notes on the README

The README option table matches the code. The README does not mention that the cache ignores `relative`, `cwd` and `jsOnly`, that failures are cached, or the exported `resolveNpmCmd`, `quote`, `unquote` and `relative` helpers.
