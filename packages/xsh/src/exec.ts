import assert from "node:assert";
import { exec as childExec, type ChildProcess } from "node:child_process";
import { util } from "./util.ts";

const DEFAULT_MAX_BUFFER = 20 * 1024 * 1024;

export interface ExecOutput {
  stdout: string;
  stderr: string;
}

export interface ExecError extends Error {
  output: ExecOutput;
  code: number;
}

export type ExecCallback = (err: ExecError | null, output: ExecOutput) => void;

/**
 * Options passed through to Node.js `child_process.exec`.
 * A plain boolean is shorthand for `{ silent: boolean }`.
 */
export interface ExecOptions {
  silent?: boolean;
  env?: Record<string, string | undefined>;
  cwd?: string;
  [key: string]: unknown;
}

/** command fragments: arrays of strings are joined with `" "` */
export type ExecFragment = string | string[];

export type ExecArg = ExecFragment | ExecOptions | ExecCallback | boolean;

/** thenable returned by `exec` when no callback is given */
export interface ExecResult {
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

/**
 * Execute a shell command with Node.js `child_process.exec`.
 *
 * Arguments can be any mix of command fragments (strings / arrays of strings,
 * joined with `" "`), one options object or boolean (silent shorthand) as the
 * first, last, or second to last argument, and a callback as the last argument.
 *
 * Returns the child process when a callback is given, else an
 * {@link ExecResult} thenable.
 */
export function exec(...args: Array<ExecFragment | ExecOptions | boolean>): ExecResult;
export function exec(...args: [...ExecArg[], ExecCallback]): ChildProcess;
export function exec(...args: ExecArg[]): ExecResult | ChildProcess {
  const error = (cmd: string, code: number, output: ExecOutput): ExecError => {
    const err = new Error(`shell cmd '${cmd}' exit code ${code}`) as ExecError;
    err.output = output;
    err.code = code;
    return err;
  };

  const len = args.length;

  let cb: ExecCallback | undefined;
  let options: any;

  const cmdFragments: ExecFragment[] = [];
  for (let i = 0; i < len; i++) {
    const arg: any = args[i];
    const tof = typeof arg;
    if (tof === "string" || Array.isArray(arg)) {
      cmdFragments.push(arg);
    } else if (tof === "function") {
      assert(i + 1 === len, "xsh.exec: callback must be the last argument");
      cb = arg;
    } else if (tof === "boolean" || (tof === "object" && arg !== null)) {
      assert(
        i === 0 || len - i === 1 || len - i === 2,
        "xsh.exec: options must be the first, last, or second to last argument"
      );
      options = arg;
    } else {
      throw new Error("xsh.exec: command fragment must be an array or string");
    }
  }

  //
  // Dispatch on `typeof`, not `constructor.name`: the latter threw a TypeError on `null` and on
  // `Object.create(null)` options, and rejected class-instance options that structurally satisfy
  // ExecOptions - so the declared type accepted arguments the runtime did not.
  //
  if (options === undefined) {
    options = { silent: false };
  } else if (typeof options === "boolean") {
    options = { silent: options };
  }

  if (cmdFragments.length < 1) {
    throw new Error("xsh.exec: expects at least one command fragment");
  }

  let s = "";
  const cmd = cmdFragments.reduce((a: string, x) => {
    if (Array.isArray(x)) {
      x = x.join(" ");
    }
    a = `${a}${s}${x}`;
    s = " ";
    return a;
  }, "");

  const doExec = (xcb: ExecCallback): ChildProcess => {
    const { silent = false, async: _async, fatal: _fatal, ...execOptions } = options;
    const child = childExec(
      cmd,
      Object.assign(
        {
          cwd: process.cwd(),
          env: process.env,
          maxBuffer: DEFAULT_MAX_BUFFER,
          encoding: "utf8"
        },
        execOptions
      ),
      (execErr, stdout, stderr) => {
        const output = { stdout, stderr } as unknown as ExecOutput;
        const code = execErr ? execErr.code : 0;
        /* v8 ignore next -- @preserve Node execution errors normally provide a code. */
        const exitCode = code === undefined ? 1 : code;
        const err = exitCode === 0 ? null : error(cmd, exitCode as number, output);
        xcb(err, output);
      }
    );

    if (!silent) {
      child.stdout?.pipe(process.stdout);
      child.stderr?.pipe(process.stderr);
    }

    return child;
  };

  if (cb) {
    return doExec(cb);
  }

  let child!: ChildProcess;

  assert(util.Promise, "xsh.exec: No Promise available - see doc on setting one");
  const promise: Promise<ExecOutput> = new util.Promise((resolve, reject) => {
    child = doExec((err, output) => (err ? reject(err) : resolve(output)));
  });

  return {
    then: (a: any, b: any) => promise.then(a, b),
    catch: (a: any) => promise.catch(a),
    promise,
    child,
    stdout: child.stdout,
    stderr: child.stderr
  } as ExecResult;
}
