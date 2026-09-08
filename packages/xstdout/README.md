# xstdout

Intercept and capture stdout and stderr stream outputs.

## Installation

```bash
fyn add xstdout
# or
npm install xstdout
```

## Usage

```ts
import xstdout, { intercept } from "xstdout";

const captured = intercept(true);

console.log("hello, world");

captured.restore();

console.log(captured.stdout[0]); // "hello, world\n"
```

## APIs

### `intercept(silent?: boolean, silentErr?: boolean): InterceptResult`

Captures `process.stdout` and `process.stderr` streams into arrays.

Returns:
```ts
{
  restore: () => void;
  stdout: string[];
  stderr: string[];
}
```

- `stdout` / `stderr`: Arrays of strings captured from the respective streams.
- `restore`: Function that unhooks the interceptors and restores the original streams.
- `silent`: If `true`, suppresses output to actual terminal. Default is `false`.
- `silentErr`: If specified, independently controls output suppression for stderr. Defaults to `silent`.

### `interceptStdout(stdoutCb, stderrCb?): () => void`

Intercepts `process.stdout` (and optionally `process.stderr`) with custom callbacks.

Callback signature: `(msg: string) => boolean | string | undefined | void`
- Return `false` to suppress printing the output to the stream.
- Return a string to replace the output being printed.
- Return `undefined` to allow original output.

Returns an `unhook` function.

### `interceptStdouterr(stdoutCb, stderrCb?): () => void`

Intercepts both `process.stdout` and `process.stderr` with custom callbacks. If `stderrCb` is not provided, `stdoutCb` handles both streams.

Returns an `unhook` function.

## License

Apache-2.0
