[![NPM version][npm-image]][npm-url] [![Build Status][build-image]][build-url]

# visual-exec

Run a shell command and show it as a live spinner line instead of a wall of output.

Output is captured while the command runs and the terminal shows a single updating line; on failure the captured output is logged so you can see what went wrong. The default logger detects CI and turns the in-place items off there, so build logs stay plain. Built on [visual-logger] and [xsh].

## Install

```bash
npm install visual-exec
```

## Usage

```js
import VisualExec from "visual-exec";

const ve = new VisualExec({
  command: "npm install",
  cwd: "/path/to/project",
  displayTitle: "installing dependencies"
});

const { stdout, stderr } = await ve.execute();
```

## API

### `new VisualExec(options)`

**Command**

| option | description |
| --- | --- |
| `command` | the command to run (required) |
| `cwd` | working directory |
| `maxBuffer` | max stdout/stderr buffer, default 10MB |

**Display**

| option | description |
| --- | --- |
| `displayTitle` | text shown on the spinner line while running |
| `logLabel` / `outputLabel` | labels used in log and output messages |
| `outputLevel` | log level for captured output, default `verbose` |
| `visualLogger` | a [visual-logger] instance to log through |
| `spinner` | spinner style |

**Failure handling**

| option | description |
| --- | --- |
| `forceStderr` | log stderr as error, default true |
| `checkStdoutError` | boolean or regex - treat matching stdout as an error, default true |

**Cancellation**

| option | description |
| --- | --- |
| `timeout` | milliseconds before the process is killed |
| `timeoutGrace` | ms between SIGTERM and SIGKILL, default 5000 |
| `onTimeout` | called just before killing |
| `signal` | an `AbortSignal` to cancel with |

**Consuming output**

| option | description |
| --- | --- |
| `onOutput(data, stream)` | called on each stdout/stderr chunk |
| `onComplete(output, exitCode)` | called when finished; its return value becomes `execute()`'s result on success |
| `outputFile` / `outputFileOptions` | stream output to a file (`append`, `includeStderr`, `timestamps`) |
| `progress` / `onProgress` | extract progress from output by regex or custom function |
| `matchers` | `[{ pattern, onMatch }]` run against output lines |

### Methods

- **`execute(command?)`** - run it; resolves to `{ stdout, stderr }`, or to `onComplete`'s return value when one is given
- **`abort()`** / **`kill(signal?)`** - stop a running command

### Errors

A failure throws a `VisualExecError` carrying `exitCode`, `signal`, `cwd`, `command`, `duration`, `lastLines`, `stdout` and `stderr`.

### Also exported

`getDefaultLogger()`, and the output parsers `parsers`, `jsonLinesParser`, `keyValueParser`.

## License

Licensed under the [Apache License, Version 2.0](./LICENSE).

[visual-logger]: https://github.com/jchip/fynjs/tree/main/packages/visual-logger
[xsh]: https://github.com/jchip/fynjs/tree/main/packages/xsh
[npm-image]: https://badge.fury.io/js/visual-exec.svg
[npm-url]: https://npmjs.org/package/visual-exec
[build-image]: https://github.com/jchip/fynjs/actions/workflows/ci.yml/badge.svg
[build-url]: https://github.com/jchip/fynjs/actions/workflows/ci.yml
