"use strict";

// Intercept stdout and stderr to pass output thru callback.
//
//  Optionally, takes two callbacks.
//    If two callbacks are specified,
//      the first intercepts stdout, and
//      the second intercepts stderr.
//
// returns an unhook() function, call when done intercepting
const interceptStdout = (stdoutCb, stderrCb) => {
  const old_stdout_write = process.stdout.write;
  const old_stderr_write = process.stderr.write;

  const interceptor = (string, callback) => {
    // only intercept the string
    try {
      const result = callback(string);
      if (result === false) {
        return false;
      }
      if (typeof result == "string") {
        string = result.replace(/\n$/, "") + (result && /\n$/.test(string) ? "\n" : "");
      }
      return string;
    } catch (err) {
      return `xstdout caught: ${err.stack}`;
    }
  };

  const makeInterceptWrite = (outputCb, oldWrite, out) => {
    return function(string, encoding, fd) {
      const result = interceptor(string, outputCb);
      if (result === false) {
        return;
      }
      const args = Array.prototype.slice.call(arguments, 0);
      args[0] = result;
      oldWrite.apply(out, args);
    };
  };

  process.stdout.write = makeInterceptWrite(stdoutCb, old_stdout_write, process.stdout);

  if (stderrCb) {
    process.stderr.write = makeInterceptWrite(stderrCb, old_stderr_write, process.stderr);
  }

  // puts back to original
  return function unhook() {
    process.stdout.write = old_stdout_write;
    process.stderr.write = old_stderr_write;
  };
};

const interceptStdouterr = (stdoutCb, stderrCb) => {
  stderrCb = stderrCb || stdoutCb;
  return interceptStdout(stdoutCb, stderrCb);
};

const makeInterceptor = (silent, store) => msg => {
  store.push(msg);
  return silent ? false : undefined;
};

const intercept = (silent, silentErr) => {
  if (silentErr === undefined) {
    silentErr = silent;
  }
  const stdout = [];
  const stderr = [];
  const restore = interceptStdout(
    makeInterceptor(silent, stdout),
    makeInterceptor(silentErr, stderr)
  );
  return {
    restore,
    stdout,
    stderr
  };
};

module.exports = {
  intercept,
  interceptStdout,
  interceptStdouterr
};
