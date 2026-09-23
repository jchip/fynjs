# ShellJS `exec` overhead and an `xsh.exec` alternative

Date: 2026-09-23

## Conclusion

ShellJS's temporary files belong only to its synchronous `exec` path. `xsh.exec` always supplies
`async: true`, so calls through `xsh.exec` do not create those files. Replacing the ShellJS call
inside `xsh.exec` with `node:child_process.exec` is feasible and small, but it is unlikely to make
individual commands materially faster. A larger startup improvement requires a lightweight entry
point that does not load ShellJS, because the main `xsh` entry point still exports ShellJS as `$`.

No runtime change is proposed in this note. Removing or changing `$` would affect the public API
and requires an explicit migration decision.

## What the temporary files do

ShellJS 0.10.0 creates three files for each synchronous `shell.exec` call:

1. `paramsFile` transfers the command, options, piped input, and output-file paths to a helper Node
   process.
2. `stdoutFile` captures stdout independently of stderr.
3. `stderrFile` captures stderr independently of stdout.

The first synchronous call in a process can also create and immediately remove a probe file while
ShellJS finds a writable temporary directory. That directory is then cached.

The helper process runs the real command asynchronously and tees stdout and stderr both to the
files and to its own stdout/stderr. The outer process blocks in `execFileSync` with the helper's
stdio inherited. This gives ShellJS all three properties at once:

- a synchronous API;
- live output when `silent` is false; and
- separately captured stdout and stderr in the returned `ShellString`.

The files are mode `0600` because they can contain command parameters and sensitive output. Their
removal is best effort, so an abrupt process death can leave them behind.

The parameter file is intentional. ShellJS briefly changed to putting the serialized parameters
in a command-line argument, then reverted it because large piped input can exceed the operating
system's argument-length limit. The filesystem was also selected as portable inter-process
communication, particularly for Windows.

## Are they necessary?

They are necessary for ShellJS's current synchronous behavior and architecture, not for command
execution in general.

A direct `execSync` can avoid the helper and temporary files, but it must choose between captured
output and inherited live output. The blocked JavaScript thread cannot consume ordinary child
pipes and tee them in real time. A substantially different native or multi-process implementation
could replace the files, but it would retain complexity and is not warranted for `xsh`.

An asynchronous API has no such constraint. Node's `child_process.exec` already returns a child
with stdout/stderr streams and supplies the accumulated output to its callback. ShellJS's async
branch is a thin wrapper around that API and does not create temporary files.

## Why `xsh.exec` does not use the files

`packages/xsh/src/exec.ts` always merges `{ async: true }` into the options and always supplies a
callback. ShellJS therefore dispatches to `execAsync`, which calls `child_process.exec` directly.
The synchronous helper, parameter file, and output files are never entered for this path.

The async ShellJS layer adds these behaviors beyond Node's API:

- a default 20 MiB `maxBuffer` instead of Node's 1 MiB default;
- default UTF-8 encoding and current working directory/environment;
- live piping to the parent stdout/stderr unless `silent` is true;
- ShellJS global `silent` and `verbose` configuration interaction;
- fallback exit code `1` when Node supplies no error code; and
- support for ShellJS `ShellString` piping, although ordinary `xsh.exec(...)` calls do not invoke
  it as a pipe target.

`xsh.exec` then supplies its argument-fragment syntax, callback/error shape, custom Promise
constructor, thenable result, and child/stream aliases.

## Indicative local measurements

Environment: macOS, Node 24.21.0, ShellJS 0.10.0. These figures are directional, not a portable
performance guarantee.

| Case | Approximate time |
|---|---:|
| Native async `exec("true")` | 12.4 ms/call median across batches |
| ShellJS async `exec("true")` | 13.1 ms/call median across batches |
| Native `execSync("true")` | 7.9 ms/call |
| ShellJS synchronous `exec("true")` | 43.3 ms/call |
| Cold `require("node:child_process")` | 1 ms |
| Cold `require("shelljs")` | 44 ms |

The async delta was about 0.5-0.7 ms/call and smaller than normal batch variation. The synchronous
delta was about 35 ms/call and is consistent with starting an extra Node process plus temporary
file I/O.

## Smallest practical alternative

For behavior close to today's `xsh.exec`, call `node:child_process.exec` directly and retain the
existing argument parser and returned thenable. The adapter must deliberately preserve:

- the 20 MiB default `maxBuffer`;
- UTF-8 default encoding;
- `silent: false` live piping to `process.stdout` and `process.stderr`;
- caller-supplied `cwd`, `env`, `shell`, `timeout`, `killSignal`, and other Node `exec` options;
- the fallback code when an execution error has no `code`;
- callback timing, error/output shape, child identity, streams, and custom Promise behavior; and
- supported signal and cancellation behavior used by `visual-exec`, `fyn`, and `xarc-run`.

ShellJS-only keys such as `silent`, `async`, and `fatal` should not be forwarded to Node. Tests
should cover output larger than Node's 1 MiB default, nonzero exit, signal termination, timeout,
custom shell, buffer encoding, live output, and child cancellation in addition to the current
suite.

## Options and recommendation

### 1. Replace only the `shell.exec` call

Low implementation risk and removes an unnecessary indirection. It does not remove the ShellJS
dependency or cold-load cost because `xsh` still exports `$`. Expected speedup for actual commands
is small.

### 2. Add a lightweight `xsh/exec` export

Implement the direct adapter and expose it through a subpath that does not import the main index.
Callers that only need command execution can opt into lower startup cost without breaking `$`.
This is the best incremental design if cold CLI startup matters.

### 3. Remove ShellJS and `$`

This yields the cleanest package and removes the roughly 44 ms cold import observed locally, but
it is a public API break. Repository code has a few test/fixture uses of `xsh.$`, and external use
is unknown. This option requires an explicit migration decision before implementation.

Recommendation: first benchmark the real slow command through `xsh.exec` and native
`child_process.exec`. If the concern is the visible temporary files, no `xsh.exec` change is needed
because that path does not create them. If cold startup is the concern, pursue option 2. If
synchronous `shell.exec` calls are the concern, replace those call sites with either async execution
or native `execSync` after choosing whether live output or captured output is required.

## Sources

- Local ShellJS 0.10.0 implementation: `node_modules/shelljs/src/exec.js`
- Local helper implementation: `node_modules/shelljs/src/exec-child.js`
- Local `xsh.exec` implementation: `packages/xsh/src/exec.ts`
- [ShellJS issue #782: helper process and filesystem IPC](https://github.com/shelljs/shelljs/issues/782)
- [ShellJS commit reverting CLI parameter transfer](https://github.com/shelljs/shelljs/commit/cb9cf276cb)
- [Node child-process documentation](https://nodejs.org/api/child_process.html)
