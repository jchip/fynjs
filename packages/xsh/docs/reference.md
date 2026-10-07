# xsh reference

`xsh` is a small set of Node.js helpers for shell execution: `exec` (a wrapper over `child_process.exec`), environment variable readers, PATH editing, path scrubbing for CWD and `node_modules`, and a `pushd`/`popd` stack. It has no runtime dependencies. ESM only (`"type": "module"`).

## Imports

```js
import xsh from "xsh";
import { exec, env, envPath, mkCmd, pathCwd, pathCwdNm, pushd, popd } from "xsh";
import type { Xsh, ExecOutput, ExecError, ExecCallback, ExecOptions, ExecFragment, ExecArg, ExecResult, EnvContainer } from "xsh";
```

CommonJS on a Node version that supports `require(esm)`: `const xsh = require("xsh")` returns the `xsh` object itself (the module has a `"module.exports"` export), not a namespace.

Runtime exports: `default` (the `xsh` object), `exec`, `env`, `envPath`, `mkCmd`, `pathCwd`, `pathCwdNm`, `pushd`, `popd`, `"module.exports"` (same object as `default`).

Type-only exports: `Xsh`, `ExecOutput`, `ExecError`, `ExecCallback`, `ExecOptions`, `ExecFragment`, `ExecArg`, `ExecResult`, `EnvContainer`.

Not exported from the package root: `findEnvKey` and `envKey` (only reachable as members of `envPath`), `escapeRegExp`, `util`, and the individual functions `get`, `getAsBool`, `getAsInt`, `addToFront`, `addToEnd`, `add` (only reachable as members of `env` and `envPath`). There is no `$` export and no synchronous exec. There are no subpaths (only `xsh/package.json`).

## `xsh` (default export)

```ts
interface Xsh {
  exec: typeof exec;
  env: typeof env;
  envPath: typeof envPath;
  mkCmd: typeof mkCmd;
  pathCwd: typeof pathCwd;
  pathCwdNm: typeof pathCwdNm;
  pushd: typeof pushd;
  popd: typeof popd;
  /** Promise implementation used by exec */
  Promise: PromiseConstructor;
}
```

A plain object holding the same functions as the named exports, plus a `Promise` accessor property.

- Reading `xsh.Promise` returns the constructor `exec` currently uses. The initial value is the global `Promise`.
- Assigning `xsh.Promise = P` makes later non-callback `exec` calls build their promise with `new P(...)`. Assigning a falsy value (`null`, `undefined`) restores the global `Promise`.
- The setting is process wide and read at call time, so it affects every later `exec` call without a callback.
- The assigned value is not checked. A non-constructor fails when `exec` is next called without a callback.
- `Promise` is defined on the default object only. The named exports have no `Promise`.

## `exec(...args)`

```ts
function exec(...args: Array<ExecFragment | ExecOptions | boolean>): ExecResult;
function exec(...args: [...ExecArg[], ExecCallback]): ChildProcess;

type ExecFragment = string | string[];
type ExecArg = ExecFragment | ExecOptions | ExecCallback | boolean;
type ExecCallback = (err: ExecError | null, output: ExecOutput) => void;

interface ExecOutput { stdout: string; stderr: string }
interface ExecError extends Error { output: ExecOutput; code: number }
```

Runs a shell command with Node's `child_process.exec`. Execution is always asynchronous. There is no synchronous form. The two overloads are the callback form (returns the `ChildProcess`) and the thenable form (no callback, returns an `ExecResult`).

### Argument rules

Arguments are scanned in order. Each argument is one of:

| Argument | Meaning |
| --- | --- |
| string or array | A command fragment. |
| function | The callback. Must be the last argument. |
| `boolean` | Options shorthand for `{ silent: <boolean> }`. |
| non-null object | The options object. |
| anything else (`null`, `undefined`, number) | Throws `Error`. |

- The command is all fragments joined with a single `" "`. An array fragment is first joined with `" "`. No quoting or escaping is applied. The command string goes to the shell as is.
- With no options argument, options are `{ silent: false }`.
- The callback must be the last argument. Otherwise an `AssertionError` is thrown with message `xsh.exec: callback must be the last argument`.
- The options argument (object or boolean) must be the first, the last, or the second to last argument. Otherwise an `AssertionError` is thrown with message `xsh.exec: options must be the first, last, or second to last argument`. If several options arguments appear, the last one scanned wins.
- Zero fragments throws `Error("xsh.exec: expects at least one command fragment")`. This also happens for `exec({ cwd: "/tmp" })` or `exec(cb)`.
- An argument that is `null`, `undefined`, a number or another unsupported type throws `Error("xsh.exec: command fragment must be an array or string")`.
- These errors are thrown synchronously from `exec`, never as a rejected promise.
- Array elements are not type checked. `join` stringifies them.

### Options

`ExecOptions` is `{ silent?: boolean; env?: Record<string, string | undefined>; cwd?: string; [key: string]: unknown }`. Every key other than `silent`, `async` and `fatal` is passed to Node's `child_process.exec` as an option.

| Option | Type | Default | Behavior |
| --- | --- | --- | --- |
| `silent` | `boolean` | `false` | When false, the child's stdout and stderr are piped to `process.stdout` and `process.stderr` while the command runs. When true, nothing is echoed. Output is captured either way. Not passed to Node. |
| `cwd` | `string` | `process.cwd()` at call time | Working directory of the command. |
| `env` | `Record<string, string \| undefined>` | `process.env` | Environment of the command. Replaces the default entirely, it is not merged. |
| `maxBuffer` | `number` | `20 * 1024 * 1024` (20 MiB) | Max bytes buffered per stream. Node's own default is 1 MiB. |
| `encoding` | `string` | `"utf8"` | Output encoding. |
| `async`, `fatal` | any | none | Removed from the options and ignored. They are not passed to Node. |
| any other key | any | Node default | Passed to `child_process.exec` unchanged (for example `timeout`, `shell`, `killSignal`, `signal`, `uid`). |

Defaults are applied with `Object.assign`, so a user value overrides the default, including an explicit `undefined`. The type of `encoding` is not restricted by xsh. A non-`utf8` encoding changes what `stdout` and `stderr` are, because they are passed through, while the types still say `string`.

### Output capture

The `ExecOutput` object is `{ stdout, stderr }`, the strings (or buffers, see `encoding`) Node accumulated. Both streams are captured separately in full, up to `maxBuffer`. Output is captured whether or not `silent` is set. Output is delivered when the process closes. It is not streamed to the callback.

With `silent: false`, xsh pipes `child.stdout` and `child.stderr` to the parent streams.

### Result and errors

The callback form calls `cb(err, output)` once the command finishes.

- On exit code 0, `err` is `null`. Note `null`, not `undefined`.
- Otherwise `err` is a new `Error` with message `shell cmd '<cmd>' exit code <code>`, where `<cmd>` is the joined command string. It has two extra properties: `err.output` (the same `ExecOutput` passed to the callback) and `err.code`.
- `err.code` is taken from Node's error `code`. For a command that exits non-zero this is the numeric exit code. If Node supplies no code, it is `1`.
- Node's `code` is not always numeric. For a signal kill it is `null`, and for a `maxBuffer` overrun it is a string such as `"ERR_CHILD_PROCESS_STDIO_MAXBUFFER"`. xsh copies it as is (only `undefined` becomes `1`), so `err.code` can be a non-number despite the `number` type. `null` and strings still count as failure. The `exitCode === 0` check is strict.
- `output` is always passed, also on error, so failed commands keep their stdout and stderr.
- The original Node error (with `signal`, `killed`, `cmd`) is not attached. Only `output` and `code` are.
- A command that fails to spawn the shell is handled by the same path. There is no separate error type.

The callback form returns the `ChildProcess` from Node. The callback form does not use or require a Promise.

The thenable form returns an `ExecResult`:

```ts
interface ExecResult {
  then: <T = ExecOutput, R = never>(
    onFulfill?: ((output: ExecOutput) => T | PromiseLike<T>) | null,
    onReject?: ((err: ExecError) => R | PromiseLike<R>) | null
  ) => Promise<T | R>;
  catch: <R = never>(onReject?: ((err: ExecError) => R | PromiseLike<R>) | null) => Promise<ExecOutput | R>;
  promise: Promise<ExecOutput>;
  child: ChildProcess;
  stdout: ChildProcess["stdout"];
  stderr: ChildProcess["stderr"];
}
```

- `promise` resolves with `ExecOutput` on exit code 0 and rejects with the `ExecError` otherwise.
- `then(a, b)` and `catch(a)` forward to `promise.then` and `promise.catch`. The result object is a thenable, so `await exec(...)` yields the `ExecOutput`. There is no `finally` on the result object. Use `exec(...).promise.finally(...)`.
- `child`, `stdout` and `stderr` are the child process and its streams, set when `exec` returns. `stdout` and `stderr` are `child.stdout` and `child.stderr` captured at that moment.
- The promise is created with the constructor in `xsh.Promise`. If that setting were falsy at call time, `exec` throws an `AssertionError` (`xsh.exec: No Promise available - see doc on setting one`), but the setter prevents this by falling back to the global `Promise`.
- The command starts immediately when `exec` is called, not when `then` is called.
- A rejected `promise` with no handler attached causes the usual unhandled rejection. The result object does not attach a handler for you.

### Examples

```js
const { stdout } = await xsh.exec("echo", ["hello", "world"], true); // runs: echo hello world, silent

try {
  await xsh.exec("exit 3", { silent: true });
} catch (err) {
  err.code;          // 3
  err.output.stderr; // captured stderr
}

xsh.exec("pwd", { cwd: "/tmp" }, (err, { stdout }) => {
  if (err) throw err;
  console.log(stdout);
});
```

## `mkCmd(...args)`

```ts
function mkCmd(...args: Array<string | string[]>): string
```

Builds a command string. If the first argument is an array, only that array is used and it is joined with `" "`. Any further arguments are ignored. Otherwise all arguments are joined with `" "`.

- `mkCmd(["echo", "hello"])` and `mkCmd("echo", "hello")` both return `"echo hello"`.
- `mkCmd("a", ["b", "c"])` returns `"a b,c"`, because a later array is stringified with its default `toString`, not joined with a space. This differs from `exec`, which joins every array fragment with `" "`.
- `mkCmd()` returns `""`.
- No quoting or escaping.

## `env`

```ts
const env: {
  get(name: string, valWhenUndef?: string): string | undefined;
  getAsBool(name: string, valWhenUndef?: unknown): boolean;
  getAsInt(name: string, valWhenUndef?: unknown): number;
};
```

Readers for `process.env`. They read `process.env` on each call and never write to it.

### `env.get(name, valWhenUndef?)`

Returns `process.env[name]`. If it is `undefined`, returns `valWhenUndef`. An empty string is a defined value and is returned as is.

### `env.getAsBool(name, valWhenUndef?)`

- Variable defined: returns `true` when the lower cased value is exactly `"true"`, `"1"`, `"yes"` or `"on"`. Any other value, including `""`, `"0"` and `"false"`, is `false`. There is no trimming.
- Variable undefined: returns `valWhenUndef` if it is a `boolean`, else `false`.

### `env.getAsInt(name, valWhenUndef?)`

- Variable defined: converts with unary `+`, so it accepts anything `Number` accepts. `"0x10"` gives `16`, `"1.5"` gives `1.5` (not truncated), `""` gives `0`, and `" 7 "` gives `7`. If the result is not `NaN`, it is returned.
- Variable undefined or not parseable: returns `valWhenUndef` if it is a `number`, else `NaN`. A `NaN` fallback is itself a number, so it is returned as `NaN` either way.
- Despite the name, the result is not forced to an integer.

## `envPath`

```ts
type EnvContainer = Record<string, string | undefined>;

const envPath: {
  addToFront(p: string | null | undefined, env?: EnvContainer | string): string;
  addToEnd(p?: string | null, env?: EnvContainer | string): string;
  add(p?: string | null, env?: EnvContainer | string): string;
  envKey: string;
  findEnvKey(env: EnvContainer, key?: string): string | undefined;
};
```

Edits a PATH style variable, joined with the platform delimiter (`path.delimiter`: `:` or `;`).

Shared rules for `addToFront`, `addToEnd` and `add`:

- `env` selects the target. With `undefined` (or any falsy value), the target is `process.env` and it is mutated. With an object, that object is mutated. With a string, a temporary object `{ [envKey]: <string> }` is used, the string itself is not changed, and only the return value carries the result.
- The variable edited is the one named by `envKey`, not by looking up a key on the custom `env`. `envKey` is fixed when the module loads.
- All three write the result back to `env[envKey]` and return it, even when nothing changed. When the variable was missing or empty and `p` is empty, they set it to `""` and return `""`.
- If `p` is not a non-empty string (`null`, `undefined`, `""`), the PATH is not rewritten. The current value is returned as is, untrimmed and with its duplicates and empty segments kept.
- Otherwise the current value is trimmed, split on the delimiter, and empty segments are dropped (so the written PATH has no empty segments, including no implicit CWD entry).
- Comparison is exact string equality. There is no path normalization, no case folding on Windows and no trailing slash handling.
- No filesystem checks. `p` does not need to exist.

### `envPath.addToFront(p, env?)`

Removes every existing occurrence of `p`, then puts `p` first. Returns the new PATH string.

### `envPath.addToEnd(p, env?)`

Removes every existing occurrence of `p`, then puts `p` last. Returns the new PATH string.

### `envPath.add(p, env?)`

Appends `p` only if it is not already present. If present, the order is kept and the rewritten PATH has empty segments removed. If `p` is empty, the value is unchanged. Returns the PATH string. The README text "If it already exists, then it is moved" applies to `addToFront` and `addToEnd` only.

```js
envPath.addToFront("/opt/bin");                    // mutates process.env.PATH
envPath.addToEnd("/opt/bin", "/usr/bin:/bin");     // returns "/usr/bin:/bin:/opt/bin"
```

### `envPath.envKey`

`string`. The name of the PATH variable in `process.env`, computed once at module load. It starts as `"Path"` on Windows and `"PATH"` elsewhere. If `process.env` does not have that exact key, the first key that matches `path` case insensitively is used instead. If none is found, the starting name is kept.

### `envPath.findEnvKey(env, key?)`

Returns `key` if `key` is truthy and is an own property of `env`. Otherwise returns the first key of `env` that equals `"path"` case insensitively. If there is no such key, returns `key` as given, which may be `undefined`. It never throws for a normal object.

## `pathCwd`

```ts
const pathCwd: {
  remove(p: string, flags?: string, stripSlash?: boolean): string;
  replace(p: string, str?: string | null | false, flags?: string): string;
};
```

Scrubs the current directory out of a string, such as a stack trace or output line. `process.cwd()` is read on each call. Matching is a literal match (regex metacharacters in the path are escaped). `flags` are `RegExp` flags. Without `"g"`, only the first match is changed.

### `pathCwd.remove(p, flags?, stripSlash?)`

- With `stripSlash` truthy, first removes `<cwd><sep>` (CWD plus the platform separator).
- Then, if `p` still contains CWD, removes CWD.
- Returns `p` as is if CWD is not present.
- The result keeps any following separator unless `stripSlash` removed it. For example `"/a/b/f.js"` with cwd `/a/b` gives `"/f.js"`, and with `stripSlash` gives `"f.js"`.
- When `stripSlash` is used without `"g"`, only the first `<cwd><sep>` is removed.

### `pathCwd.replace(p, str?, flags?)`

Replaces CWD in `p` with `str`. If `str` is not a string (`undefined`, `null`, `false`), `"CWD"` is used. The replacement string is passed to `String.replace`, so `$` patterns in `str` are interpreted.

## `pathCwdNm`

```ts
const pathCwdNm: {
  remove(p: string, flags?: string): string;
  replace(p: string, str?: string | null | false, flags?: string): string;
};
```

Like `pathCwd`, but also handles `<cwd>/node_modules` (`path.resolve("node_modules")`). Matching is literal and uses the same `flags` rules.

### `pathCwdNm.remove(p, flags?)`

Removes `<cwd>/node_modules` from `p`, then calls `pathCwd.remove(p, flags)` (without `stripSlash`) on the result.

### `pathCwdNm.replace(p, str?, flags?)`

1. Replaces `<cwd>/node_modules` with `str`. If `str` is not a string, the replacement is `path.join("CWD", "~")` (`CWD/~`, or `CWD\~` on Windows).
2. Replaces the remaining CWD with `"CWD"` (via `pathCwd.replace(p, null, flags)`).
3. Replaces `path.normalize("/node_modules/")` with `path.normalize("/~/")`, using the same `flags`.

Without `"g"`, each step changes only its first match. A custom `str` applies only to step 1. Steps 2 and 3 always use their fixed replacements.

## `pushd` and `popd`

```ts
function pushd(dir: string): string
function popd(): string
```

A directory stack for `process.chdir`. The stack is module state, shared by the whole process.

- `pushd(dir)` pushes `process.cwd()` and calls `process.chdir(dir)`. It returns the new `process.cwd()`. If `chdir` throws (for example the directory does not exist), the error propagates, and the old directory has already been pushed, so the stack has an extra entry.
- `popd()` pops the most recent saved directory, calls `process.chdir` on it and returns it. If the stack is empty, throws an `AssertionError` with message `xsh.popd: directory stack is empty`.
- The stack is not reset by other `process.chdir` calls.
- `process.chdir` is not available in Node worker threads, where these calls throw.

## README mismatches

The README is context only. In these places the code is the authority.

- Callback `err` is `null` on success, not `undefined`. The README example `xsh.exec("echo hello", (r) => ...)` passes the first callback argument as the result, but it is `err`. The output is the second argument.
- The README documents only `Promise`, `mkCmd`, `exec`, `envPath` and `pushd`/`popd`. `env`, `pathCwd` and `pathCwdNm` are exported but not in the README.
- The README says Node `>= 22.18`. `package.json` `engines` says `^22.22.2 || ^24.15.0 || >=26.0.0`.
