export type InterceptCallback = (msg: string) => boolean | string | undefined | void;

export interface InterceptResult {
  restore: () => void;
  stdout: string[];
  stderr: string[];
}

/**
 * Intercept stdout and optionally stderr to pass output through callbacks.
 *
 * @param stdoutCb - callback invoked when data is written to process.stdout
 * @param stderrCb - optional callback invoked when data is written to process.stderr
 * @returns unhook function to restore original stdout / stderr writers
 */
export function interceptStdout(
  stdoutCb: InterceptCallback,
  stderrCb?: InterceptCallback
): () => void {
  const oldStdoutWrite = process.stdout.write;
  const oldStderrWrite = process.stderr.write;

  const interceptor = (str: string, callback: InterceptCallback) => {
    try {
      const result = callback(str);
      if (result === false) {
        return false;
      }
      if (typeof result === "string") {
        str = result.replace(/\n$/, "") + (result && /\n$/.test(str) ? "\n" : "");
      }
      return str;
    } catch (err: any) {
      return `xstdout caught: ${err?.stack ?? err}`;
    }
  };

  const makeInterceptWrite = (
    outputCb: InterceptCallback,
    oldWrite: typeof process.stdout.write,
    out: NodeJS.WriteStream
  ) => {
    return function (this: NodeJS.WriteStream, str: any, ...args: any[]) {
      const result = interceptor(str, outputCb);
      if (result === false) {
        return;
      }
      const callArgs = [result, ...args] as [any, ...any[]];
      return (oldWrite as any).apply(out, callArgs);
    };
  };

  process.stdout.write = makeInterceptWrite(stdoutCb, oldStdoutWrite, process.stdout) as any;

  if (stderrCb) {
    process.stderr.write = makeInterceptWrite(stderrCb, oldStderrWrite, process.stderr) as any;
  }

  return function unhook() {
    process.stdout.write = oldStdoutWrite;
    process.stderr.write = oldStderrWrite;
  };
}

/**
 * Intercept both stdout and stderr with the same or separate callbacks.
 *
 * @param stdoutCb - callback for stdout (and stderr if stderrCb is omitted)
 * @param stderrCb - optional callback for stderr
 * @returns unhook function
 */
export function interceptStdouterr(
  stdoutCb: InterceptCallback,
  stderrCb?: InterceptCallback
): () => void {
  return interceptStdout(stdoutCb, stderrCb || stdoutCb);
}

const makeInterceptor = (silent: boolean, store: string[]) => (msg: string) => {
  store.push(msg);
  return silent ? false : undefined;
};

/**
 * Capture stdout and stderr streams into arrays.
 *
 * @param silent - if true, suppress output to actual terminal
 * @param silentErr - optional independent control for stderr output suppression
 * @returns intercept result containing restore function and output arrays
 */
export function intercept(silent = false, silentErr?: boolean): InterceptResult {
  if (silentErr === undefined) {
    silentErr = silent;
  }
  const stdout: string[] = [];
  const stderr: string[] = [];
  const restore = interceptStdout(
    makeInterceptor(silent, stdout),
    makeInterceptor(silentErr, stderr)
  );
  return {
    restore,
    stdout,
    stderr
  };
}

const xstdout = {
  intercept,
  interceptStdout,
  interceptStdouterr
};

export default xstdout;
