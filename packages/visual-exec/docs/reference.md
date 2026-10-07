# visual-exec reference

`visual-exec` runs a shell command through `xsh.exec`, shows its output as a live spinner item on a `visual-logger`, and logs the captured output when the command ends. ESM only (`"type": "module"`).

## Imports

```js
import VisualExec, { getDefaultLogger, parsers } from "visual-exec";
import { VisualExec, jsonLinesParser, keyValueParser } from "visual-exec";
import type { VisualExecOptions, ExecOutput, VisualExecError } from "visual-exec";
```

The default export is `VisualExec`, the same class as the named export. There are no subpaths (only `visual-exec/package.json`).

Runtime exports: `VisualExec` (also `default`), `parsers`, `jsonLinesParser`, `keyValueParser`, `getDefaultLogger`.

Type-only exports: `VisualExecOptions`, `ExecOutput`, `ExecErrorContext`, `VisualExecError`, `OnOutputCallback`, `OnCompleteCallback`, `OutputFileOptions`, `ProgressExtractor`, `OutputMatcher`.

Not exported from the root: `sanitizeText`, `sanitizeForDisplay`, `sanitizeForOutput`, `SanitizeOptions`, `OutputStream` (`"stdout" | "stderr"`, used in `OnOutputCallback`), and the `ChildProcess` shape taken by `show`. The default export of `get-default-logger` is also not re-exported.

## `VisualExec`

```ts
class VisualExec {
  constructor(options: VisualExecOptions);
  execute<T = ExecOutput>(command?: string): Promise<T>;
  show<T = ExecOutput>(child: ChildProcess): Promise<T>;
  abort(signal?: string): void;          // default "SIGTERM"
  kill(signal?: string): void;           // alias of abort
  logResult(err: VisualExecError | null, output?: ExecOutput): void;
  checkForErrors(text: string): RegExpMatchArray | null;
  logFinalOutput(err: VisualExecError | null, output: ExecOutput): void;
}
```

One instance is meant for one run at a time. State such as the output file stream, item keys and the abort flag lives on the instance. `execute` may be called again after it settles. Calling it while a run is in progress overwrites that state.

### Constructor options

```ts
interface VisualExecOptions {
  command: string;
  cwd?: string;
  visualLogger?: VisualLogger;
  spinner?: ItemOptions["spinner"];
  displayTitle?: string;
  logLabel?: string;
  outputLabel?: string;
  outputLevel?: string;
  maxBuffer?: number;
  forceStderr?: boolean;
  checkStdoutError?: boolean | RegExp;
  timeout?: number;
  timeoutGrace?: number;
  onTimeout?: () => void;
  onOutput?: OnOutputCallback;
  onComplete?: OnCompleteCallback;
  outputFile?: string | NodeJS.WritableStream;
  outputFileOptions?: OutputFileOptions;
  signal?: AbortSignal;
  progress?: ProgressExtractor;
  onProgress?: (progress: { current?: number; total?: number; percent?: number }) => void;
  matchers?: OutputMatcher[];
}
```

| Option | Type | Default | Behavior |
| --- | --- | --- | --- |
| `command` | string | none (required) | Command run by `execute()` when it is called with no argument. Nothing validates it at construction. A non-string only changes the default title to `"Running user command"`. `execute()` then fails in `xsh.exec` (see Errors). |
| `cwd` | string | `process.cwd()` | Working directory. Also sets `PWD` in the child env. A falsy value falls back to `process.cwd()`. |
| `visualLogger` | `VisualLogger` | `getDefaultLogger()` | Logger that renders the spinner items and receives all log lines. |
| `spinner` | `ItemOptions["spinner"]` | `VisualLogger.spinners[1]` | Spinner style passed to the stdout item. |
| `displayTitle` | string | `"Running " + command` | Title shown on the stdout item. Also the default for `logLabel` and `outputLabel`. |
| `logLabel` | string | the title | Label in the `Done` and `Failed` lines. |
| `outputLabel` | string | the title | Label in the `No output` line and the `Start of output` and `End of output` markers. |
| `outputLevel` | string | `"verbose"` | Logger method name used for final output when nothing looks like an error. Must name a method on the logger. An unknown name throws `TypeError` from `logFinalOutput`. |
| `maxBuffer` | number | 10 MiB (10485760) | Passed to `child_process.exec` as `maxBuffer`, per stream. |
| `forceStderr` | boolean | `true` | When true, any non-empty captured stderr logs the final output at `error` level, even on exit code 0. |
| `checkStdoutError` | `boolean \| RegExp` | `true` | `true` uses `/error\|warn\|fatal\|unhandled\|reject\|exception\|failure\|fail\|failed/i`. A `RegExp` is used as given. `false` disables the check. A stdout match only raises the log level to `error`. It does not fail the run. |
| `timeout` | number (ms) | none | Starts when `show()` runs. A falsy value (`undefined`, `0`) disables it. See Timeout. |
| `timeoutGrace` | number (ms) | 5000 | Delay between SIGTERM and SIGKILL after a timeout. |
| `onTimeout` | `() => void` | none | Called when the timeout fires, before SIGTERM. Not called if `abort()` or the abort signal already ran. |
| `onOutput` | `OnOutputCallback` | none | Called for each raw stdout or stderr chunk. See Output capture. |
| `onComplete` | `OnCompleteCallback` | none | Called when the command ends. See Completion. |
| `outputFile` | `string \| WritableStream` | none | Where raw output is streamed. See Output file. |
| `outputFileOptions` | `OutputFileOptions` | `{ append: false, includeStderr: true, timestamps: false }` | Merged over the defaults. Only used with `outputFile`. |
| `signal` | `AbortSignal` | none | Aborts the run. See Abort. |
| `progress` | `ProgressExtractor` | none | Progress extraction config. Needs `onProgress` too. |
| `onProgress` | function | none | Called with extracted progress. Without it `progress` does nothing. |
| `matchers` | `OutputMatcher[]` | none | Per-line regex matchers. |

### Related types

```ts
type OnOutputCallback = (data: string, stream: "stdout" | "stderr") => void;
type OnCompleteCallback = (output: ExecOutput, exitCode: number) => unknown;

interface OutputFileOptions {
  append?: boolean;        // default false: open with flag "w". true: "a"
  includeStderr?: boolean; // default true
  timestamps?: boolean;    // default false
}

interface ProgressExtractor {
  pattern?: RegExp;
  extract?: (line: string) => { current?: number; total?: number; percent?: number } | null;
  format?: (p: { current?: number; total?: number; percent?: number }) => string;
}

interface OutputMatcher {
  pattern: RegExp;
  onMatch: (match: RegExpMatchArray) => void;
}

interface ExecOutput { stdout: string; stderr: string }

interface ExecErrorContext {
  exitCode: number;
  signal: string | null;
  cwd: string;
  command: string;
  duration: number;
  lastLines: string[];
  stdout: string;
  stderr: string;
}

interface VisualExecError extends Error {
  output?: ExecOutput;
  code?: number;
  exitCode?: number;
  signal?: string | null;
  cwd?: string;
  command?: string;
  duration?: number;
  lastLines?: string[];
  stdout?: string;
  stderr?: string;
  context?: ExecErrorContext;
}
```

`ProgressExtractor.format` is declared but never read by the code. Setting it has no effect.

### `execute(command?)`

```ts
execute<T = ExecOutput>(command?: string): Promise<T>
```

Runs the command and renders it. `command` overrides the constructor command for this call (`command || this._command`, so an empty string falls back).

How it spawns: it calls `xsh.exec({ silent: true, cwd, env, maxBuffer }, cmd)`. `xsh.exec` calls Node `child_process.exec`, so the command runs in the default system shell (`/bin/sh` on POSIX) as one string, not an argv array. `env` is `process.env` plus `PWD` set to the cwd. `silent: true` means xsh does not pipe the child to `process.stdout` or `process.stderr`. Output is only buffered, shown through the logger, and passed to callbacks. Output is decoded as utf8.

Resets `startTime` and the abort flag at the start of each call, then hands the child to `show()`.

Resolves with `{ stdout, stderr }` (full buffered strings), or with the value returned by `onComplete` if that value is not `undefined`. `T` is a type hint only. Nothing checks it.

Rejects when the shell command exits non-zero, is killed, exceeds `maxBuffer`, times out, or is aborted. See Errors.

### `show(child)`

```ts
show<T = ExecOutput>(child: {
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  promise: Promise<ExecOutput>;
  child?: { kill(signal?: string): boolean; pid?: number };
}): Promise<T>
```

Attaches rendering, callbacks, timeout and abort handling to an already started child. `execute` is `xsh.exec` plus error enrichment plus `show`. `child.promise` must reject with an object that may carry `output`, `code` or `exitCode`. The enriched error context (`lastLines`, `cwd`, `command`, `duration`, `stdout`, `stderr` on the error) is added only by `execute`, not by `show`. `child.child` is what `abort()`, timeout and the abort signal kill. Without it, nothing is killed.

### `abort(signal?)` and `kill(signal?)`

Sets the abort flag, then calls `child.kill(signal)` (default `"SIGTERM"`) if the child has a truthy `pid`. `kill` calls `abort` with the same argument.

`abort()` alone does not reject by itself. The kill makes the child exit, so the run rejects through the normal failure path (see Errors), unless a timeout or signal rejection won first. After `abort()`, a pending timeout timer does nothing when it fires (the check returns early). Does nothing before `show()` has a child. The abort flag is reset by the next `execute()`.

### `logResult(err, output?)`

Public, called internally once per run when the child promise settles. It needs `show()` to have run (it dereferences the stored child). It:

1. Removes the stdout and stderr items from the logger.
2. Removes the `data` listeners it added to the child streams.
3. On error: `logger.error("Failed <logLabel> - <err.message>")` with `Failed` in red, and takes `output` from `err.output`. On success: `logger.info("Done <logLabel> <secs>secs exit code 0")` with seconds to 2 decimals.
4. Calls `logFinalOutput(err, output)`.

Seconds are measured from `startTime`, which is set in the constructor and again in `execute()`.

### `checkForErrors(text)`

Returns `null` when `checkStdoutError` is `false` or `text` is empty. Otherwise returns `text.match(regex)` using the resolved regex (default or user supplied). A global regex returns all matches without groups. Used by `logFinalOutput` on stdout only.

### `logFinalOutput(err, output)`

Logs the captured output after the run. Documented in the source as overridable. Assign an instance property to replace it (`ve.logFinalOutput = () => {}` suppresses output logging).

- Level is `"error"` if `err` is set, or `forceStderr` is true and `output.stderr` is non-empty, or `checkForErrors(output.stdout)` matches. Otherwise it is `outputLevel`.
- If `output` is missing or both streams are empty: logs `No output from <outputLabel>` (with `No output` in green) at that level and returns.
- Otherwise builds one multi-argument call: `>>>`, `Start of output from <outputLabel> ===`, then `\n<stdout>`, then `\n=== stderr ===\n<stderr>` if stderr is non-empty (header in red), then `\n<<<` and `End of output from <outputLabel> ---`.
- It calls `logger.prefix(false)` first, then the level method. `prefix(false)` sets the logger prefix to `""` and is never restored, so it persists on the logger (including a shared one) after the first call.
- Output text is sanitized by `sanitizeForOutput` (below) and every `ERR!` is colored red.

## Output capture and display

Each `show()` adds two items to the logger:

| Item | Color | `display` | Spinner |
| --- | --- | --- | --- |
| stdout | green | `=== <title>\nstdout` | the `spinner` option |
| stderr | red | `stderr` | default of the logger |

Items are keyed by fresh `Symbol`s, so concurrent instances on one logger do not collide. Both are removed in `logResult`.

Each `data` chunk from stdout or stderr does two things.

1. Updates its item's message with `logger.updateItem(key, { msg, _save: false, _render: false })`. The chunk is sanitized (`sanitizeForDisplay`) first. Lines are trimmed and empty lines dropped. Taking lines from the end, it keeps lines while the sum of their ANSI-stripped lengths stays under 100 characters. Kept lines are joined with an inverse blue `\n` marker. If no whole line fits, the last line is used, cut to its first 100 characters when it is over 120 characters (the cut text is ANSI-stripped). The kept text carries over to the next chunk as the item buffer, so a partial line is joined with the next chunk. `_render: false` means the update does not force a render. The logger's own render timer draws it. `_save: false` keeps the update out of the saved log data.
2. Runs the raw (unsanitized) data handler: `onOutput(data, stream)`, then the output file write, then progress and matchers on each non-empty line from `data.split("\n")`.

Raw means exactly what the child wrote. `onOutput` and the output file get the bytes untouched, per chunk, with no line buffering. A line split across two chunks is seen as two partial lines by progress and matchers.

Full output is not accumulated by `visual-exec`. The final `stdout` and `stderr` come from `child_process.exec`'s own buffers.

### Sanitizing

Child control sequences are removed before display and before the final log output, so a child that moves the cursor cannot erase lines. SGR colour sequences (`ESC[...m`) are kept. These are removed: other CSI sequences, OSC, DCS, PM, APC and SOS strings, charset and single-char escapes, 8-bit C1 controls, and C0 controls other than `\n`, `\t` and the `ESC` of kept SGR. Display profile: tabs become spaces, a lone `\r` is dropped. Output profile: tabs kept, `\r\n` and `\r` become `\n`, and an SGR reset is appended if any colour remained. Callbacks and the output file are not sanitized.

### Progress

Runs per non-empty line, only when both `progress` and `onProgress` are set.

- If `progress.extract` exists it is used and its return is passed on when truthy. `pattern` is ignored then.
- Else if `progress.pattern` matches and the match has `groups`, calls `onProgress({ current, total, percent })`. Each field is `parseInt(group, 10)` when that named group is non-empty, else `undefined`. A pattern with `groups` that matches but defines none of the three names still calls `onProgress` with all fields `undefined`. A pattern with no named groups never calls it.
- `format` is never used.

### Matchers

For each non-empty line and each matcher in order: `line.match(pattern)`, and if truthy, `onMatch(match)`. Same chunk caveats as above. Errors thrown by `onMatch`, `onProgress`, or `onOutput` are not caught by `visual-exec` (they throw inside the stream `data` listener).

### Output file

With `outputFile` as a string: the parent directory is created recursively if missing, the file is opened with flag `w` (or `a` if `append`), and the stream is closed when the run ends. `execute()` waits for the stream's `close` (or `error`) event before settling, so the file is complete when the promise resolves. A stream already destroyed or closed is not waited on.

With `outputFile` as a `WritableStream`: it is written to directly and never ended or closed by `visual-exec`. `execute()` does not wait for it to flush.

Written data is the raw chunk. With `timestamps: true` each chunk is prefixed with `[<ISO timestamp>] `, one prefix per chunk, not per line. With `includeStderr: false` stderr chunks are skipped.

## Timeout

When `timeout` is truthy, a timer starts in `show()`. On fire (unless `abort()` or the signal already ran):

1. `onTimeout()` is called.
2. If the child has a `pid`, it gets SIGTERM, then after `timeoutGrace` ms an unref'd timer sends SIGKILL if a `pid` is still recorded. The grace timer does not keep the process alive. `pid` is not cleared on exit, so SIGKILL is attempted even if the child already exited.
3. The run rejects immediately with a timeout error (below). It does not wait for the child to die.

The timer is cleared when the run settles.

## Abort

With `signal`, the run rejects with an abort error as soon as the signal aborts, and `abort()` is called (SIGTERM). If the signal is already aborted when `show()` runs, the same happens immediately. The `abort` listener is added to the signal and is not removed afterward.

## Completion

`onComplete(output, exitCode)` runs once when the child settles.

- Success: `logResult` runs first, then `onComplete(output, 0)`. If it returns a value other than `undefined`, that value is the resolved result of `execute()`. Otherwise the output object is. A throw from `onComplete` rejects the run. Failure logging is not triggered for that throw.
- Failure: `onComplete(output, exitCode)` runs before `logResult`, with `output` from `err.output` (or empty strings) and `exitCode` from `err.exitCode ?? err.code ?? 1`. Its return value is ignored. The original error is rethrown. A throw from `onComplete` replaces the error and skips `logResult`.
- Timeout and abort rejections happen through a race. `onComplete` still runs later when the killed child's own promise rejects, but its outcome no longer affects the already rejected promise.

## Errors

Process failures reject. One synchronous throw is possible: if the command is not a string (or array of strings), `xsh.exec` throws from `execute()` before anything is shown.

### Command failure

The rejection is the `Error` made by xsh, message `shell cmd '<cmd>' exit code <code>`, with these properties added or kept:

| Property | Value |
| --- | --- |
| `output` | `{ stdout, stderr }`, the full buffered output. From xsh. |
| `code` | From Node's exec error `code`. Normally the exit code. It may be a string such as `"ERR_CHILD_PROCESS_STDIO_MAXBUFFER"` or `null` when killed by a signal, despite the `number` type. From xsh. |
| `exitCode` | `err.code ?? 1`. `1` when `code` is `null` or `undefined`. |
| `signal` | `err.signal`, else `"SIGTERM"` if the child object has `killed === true`, else `null`. xsh does not copy Node's `signal`, so a child killed from outside is `null`. Any kill via `abort()` or timeout reports `"SIGTERM"`, even for SIGKILL. |
| `cwd` | The instance cwd. |
| `command` | The command actually run (the `execute(command)` override if given). |
| `duration` | Milliseconds since `execute()` started. |
| `lastLines` | Last 10 non-empty lines of stdout lines followed by stderr lines. |
| `stdout`, `stderr` | Last 50000 characters of each (sliced from the end). `output` keeps the full text. |
| `context` | An `ExecErrorContext` with the same values. Its `stdout` and `stderr` are not truncated. |

The error is logged with `Failed ...` and the final output before it is rethrown.

### `TimeoutError`

`name` is `"TimeoutError"`, a plain `Error` (no class is exported). Message: `Command timed out after <timeout>ms: <constructor command>`. `context` is `{ command, cwd, exitCode: -1, signal: "SIGTERM", duration: <timeout> }`. The error has none of the enrichment properties (`exitCode`, `stdout`, `stderr`, `lastLines`, `cwd`, `duration`). Only `context` is set, and it has no `stdout`, `stderr` or `lastLines`. `duration` is the timeout value, not measured time. Note `command` here is the constructor command even if `execute(command)` was used.

### `AbortError`

`name` is `"AbortError"`. Message: `Command aborted: <constructor command>`. `context` is `{ command, cwd, exitCode: -1, signal: "SIGTERM", duration }` where `duration` is time since `show()` started. Same missing properties as `TimeoutError`: only `context` is set.

### Which wins

`Promise.race` runs timeout and abort against the command promise. The first to settle sets the rejection. A normal exit or failure beating both gives the normal result or command failure error.

## `getDefaultLogger()`

```ts
function getDefaultLogger(): VisualLogger
```

Returns a module-level singleton `VisualLogger`, created on first call with default options. If `ci-info` reports a CI environment, on creation it logs `visual-exec: CI env detected` at info level and calls `setItemType("none")`, so spinner items are not drawn. This logger is used by `VisualExec` when `visualLogger` is not given. The instance is shared by every `VisualExec` in the process that uses the default. It never changes after creation.

## Parsers

Standalone helpers to use inside `onOutput`, `progress.extract` or `onMatch`. Nothing in the package calls them.

```ts
function jsonLinesParser(line: string): unknown | null
function keyValueParser(line: string): Record<string, string> | null
const parsers: { jsonLines: typeof jsonLinesParser; keyValue: typeof keyValueParser }
```

- `jsonLinesParser`: trims the line. Returns `null` for an empty line, a line starting with `//`, or invalid JSON. Otherwise returns `JSON.parse` of it. A line that is the JSON text `null` also returns `null`.
- `keyValueParser`: matches `^([^=:]+)[=:]\s*(.*)$`. Splits at the first `=` or `:`. Returns `{ [trimmedKey]: trimmedValue }`, or `null` if no match. A line with an empty key returns `null`.
- `parsers`: `{ jsonLines: jsonLinesParser, keyValue: keyValueParser }`.

## Example

```js
const ve = new VisualExec({
  command: "npm test",
  timeout: 60000,
  progress: { pattern: /(?<current>\d+)\/(?<total>\d+)/ },
  onProgress: p => console.log(p.current, p.total),
  outputFile: ".temp/test.log"
});
try {
  const { stdout } = await ve.execute();
} catch (err) {
  console.error(err.name, err.exitCode, err.lastLines);
}
```
