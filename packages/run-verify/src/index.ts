/**
 * run-verify: one runner that takes test steps as function parameters.
 *
 * `runVerify(...steps, done)` and `asyncVerify(...steps)` are the same runner in two
 * forms. A step is a plain function. The runner calls the steps one at a time, in the
 * order they were passed, and the value a step finishes with becomes the input to the
 * next step:
 *
 * ```js
 * asyncVerify(
 *   () => 2,             // finishes with 2
 *   value => value * 3,  // gets 2, finishes with 6
 *   value => value + 1   // gets 6, finishes with 7, so the run resolves 7
 * );
 * ```
 *
 * A step finishes by returning a value, by returning a Promise, or by calling a `next`
 * callback. The parameters a step declares decide what it gets and how it finishes; see
 * `detectWantCallbackByParamName` and the `cbNext` / `wantResult` logic in
 * `invokeCheckFunc`. A step that returns nothing finishes with `undefined`. The runner
 * does not carry the previous value past a step that ignored it.
 *
 * The run stops at the first step that throws, rejects, or calls `next(err)`. That
 * error goes to `done`, or rejects the `asyncVerify` Promise. The exception is a step
 * wrapped in `expectError`: there the failure is what the step was required to produce,
 * so the error is passed on as the next step's input instead.
 *
 * Some entries in the list are not ordinary transforms:
 *
 * - `runTimeout(ms)` starts a deadline at that spot, replacing the previous one, and
 *   passes the current value through.
 * - a `runDefer()` object registers a signal that must settle before the run can
 *   finish. It does not block, and it passes the current value through.
 * - `defer.wait()` blocks at that spot and gives the signal's value to the next step,
 *   dropping the previous value.
 * - `runFinally(fn)` is cleanup. It is collected no matter where it sits in the list.
 * - `onFailVerify(fn)` runs only if the run failed at that spot, and is skipped while
 *   the run is passing.
 */

import { EventEmitter } from "events";
import { WRAPPED_FN, IS_FINALLY, DEFER_EVENT, DEFER_WAIT, DEFER_OBJ } from "./symbols.js";

export { WRAPPED_FN, IS_FINALLY, DEFER_EVENT, DEFER_WAIT, DEFER_OBJ } from "./symbols.js";

/**
 * `verify()` is an explicit, fully typed chain over this same runner, where each
 * step is added with `.step()` instead of being implied by its argument
 * position. Both surfaces run the same pipeline and can be used side by side.
 */
export { verify, signal } from "./chain.js";
export type { Chain, ChainConfig, Signal, SignalMap, StepCallback, VerifyFn } from "./chain.js";

/** One step in the sequence. Gets the previous step's value, and its own value goes on
 * to the next step. See the module comment above for the exact rules. */
export type CheckFunction = (...args: any[]) => any;
export type DoneCallback = (err?: Error | null, result?: any) => void;
export type NextCallback = (err?: Error | null, result?: any) => void;
export type ErrorCode = string | number;

export interface DeferHandlers {
  resolve: Array<(value: any) => void>;
  reject: Array<(err: Error) => void>;
}

export interface DeferObject {
  timeout?: number;
  event: EventEmitter;
  handlers: DeferHandlers;
  invoked?: boolean;
  failed?: boolean;
  error?: Error;
  result?: any;
  _waiting?: boolean;
  _waited?: boolean;
  [DEFER_EVENT]: EventEmitter;
  resolve(r?: any): void;
  reject(err: Error): void;
  onResolve(cb: (value: any) => void): DeferObject;
  onReject(cb: (err: Error) => void): DeferObject;
  pending(): boolean;
  clear(): () => void;
  setAwait(options: SetAwaitOptions): void;
  waitAgain(waitTimeout?: number): WaitFunction;
  wait(waitTimeout?: number, again?: boolean): WaitFunction;
}

interface SetAwaitOptions {
  resolve: (r: any) => void;
  reject: (err: Error) => void;
  errorFromCall: Error;
  timeoutMsg: string;
  waitTimeout?: number;
}

interface WaitFunction {
  (): Promise<any>;
  [DEFER_OBJ]: DeferObject;
  [DEFER_EVENT]: EventEmitter;
}

export interface WrapObject {
  [WRAPPED_FN]: CheckFunction;
  [IS_FINALLY]?: boolean;
  _expectError?: boolean | "has" | "toBe";
  _expectErrorMsg?: string;
  _expectErrorCode?: ErrorCode;
  _withCallback?: boolean;
  _onFailVerify?: boolean;
  _timeout?: number;
  expectError?: WrapObject;
  withCallback?: WrapObject;
  onFailVerify?: WrapObject;
  expectErrorHas?(msg: string, code?: ErrorCode): WrapObject;
  expectErrorToBe?(msg: string, code?: ErrorCode): WrapObject;
  runTimeout?(delay: number): WrapObject;
}

/**
 * Decide whether a single-parameter step wants a `next` callback, by reading its
 * declared parameter name out of its source text.
 *
 * Only the parameter list is inspected. A step's body may contain anything,
 * including arrow functions, without affecting the decision.
 *
 * @returns true if the parameter is callback-named. A zero-parameter step has no
 *   name to match and is not a callback step.
 */
function detectWantCallbackByParamName(
  checkFunc: CheckFunction,
  index: number,
  done: DoneCallback
): boolean {
  const funcStr = checkFunc.toString().trim();
  let params: string;

  // An arrow with one unparenthesized parameter, as in `next => ...`. Anchored
  // at the start so an arrow inside a body cannot be mistaken for this.
  const bareArrowParam = funcStr.match(/^(?:async\s+)?([A-Za-z_$][\w$]*)\s*=>/);

  if (bareArrowParam) {
    params = bareArrowParam[1];
  } else {
    // Everything else declares its parameters in the first parenthesis group:
    // `(a) => {}`, `function (a) {}`, `function name(a) {}`, `name(a) {}`.
    // The group is allowed to be empty, which is a zero-parameter step.
    const match = funcStr.match(/^[^\(]*\(([^\)]*)\)/);
    if (!match) {
      done(new Error(`runVerify param ${index} unable to match arg name`));
      return false;
    }
    params = match[1];
  }

  params = params.trim().toLowerCase();

  return (
    params.startsWith("next") ||
    params.startsWith("cb") ||
    params.startsWith("callback") ||
    params.startsWith("done")
  );
}

const errorMsg = (error: Error, message: string): Error => {
  error.message = message;
  return error;
};

function _runVerify(args: any[], errorFromCall: Error): void {
  const finallyCbs = args.filter((x) => x[IS_FINALLY] === true);
  const checkFuncs = args.filter((x) => x[IS_FINALLY] !== true);

  // `checkFuncs` drops the runFinally entries, so an index into it does not
  // identify the step the caller wrote. Keep the original argument position of
  // each step so failure messages can name a number the caller can count to.
  const argPos: number[] = [];
  args.forEach((x, ix) => {
    if (x[IS_FINALLY] !== true) argPos.push(ix);
  });
  const stepNum = (ix: number): number => (ix >= 0 && ix < argPos.length ? argPos[ix] : ix);

  const lastIx = checkFuncs.length - 1;
  const done = checkFuncs[lastIx] as DoneCallback;
  let index = 0;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let failError: Error | undefined;
  const defers: DeferObject[] = [];
  let completed = false;

  if (checkFuncs.length < 2) {
    throw errorMsg(errorFromCall, "runVerify - must pass done function");
  }

  const invokeFinally = (err: Error | undefined, result?: any): void => {
    if (completed) return;
    completed = true;
    failError = err && errorMsg(errorFromCall, err.message);

    const onFail = checkFuncs[index] as WrapObject;
    let error = err;

    if (err && onFail && onFail[WRAPPED_FN] && onFail._onFailVerify) {
      try {
        onFail[WRAPPED_FN](err, result);
      } catch (err2) {
        error = err2 as Error;
      }
    }

    let returnFinallyCbs: any[] = [];

    try {
      finallyCbs.forEach((wrap) => returnFinallyCbs.push(wrap[WRAPPED_FN]()));
      returnFinallyCbs = returnFinallyCbs.filter((x) => x);
    } catch (err2) {
      error = err2 as Error;
    }

    const invokeDone = () => {
      clearTimeout(timeoutTimer);
      if (done.length > 1) {
        return done(error, result);
      } else {
        return done(error);
      }
    };

    if (returnFinallyCbs.length > 0) {
      Promise.all(returnFinallyCbs)
        .catch((err2) => {
          if (!error) error = err2;
        })
        .then(invokeDone);
    } else {
      invokeDone();
    }
  };

  const invokeCheckFunc = (prevResult?: any): any => {
    if (failError) {
      return undefined;
    }

    if (index >= lastIx) {
      if (defers.length && !defers.every((x) => x.invoked)) {
        return undefined;
      }
      return invokeFinally(undefined, prevResult);
    }

    const nextCheckFunc = (r?: any) => {
      index++;
      return invokeCheckFunc(r);
    };

    let wrap: Partial<WrapObject> = {};
    let checkFunc = checkFuncs[index];

    const addDefer = (defer: DeferObject) => {
      defers.push(defer);

      const invokeDeferHandlers = (handlers: Array<(v: any) => void>, value: any) => {
        for (const h of handlers) {
          try {
            h(value);
          } catch (err) {
            defer.failed = true;
            defer.error = err as Error;
            break;
          }
        }
        return undefined;
      };

      const onDefer = (err: Error | undefined, r?: any) => {
        if (!failError && !defer.invoked) {
          defer.invoked = true;
          if (!err) {
            invokeDeferHandlers(defer.handlers.resolve, r);
          } else {
            invokeDeferHandlers(defer.handlers.reject, err);
          }

          const errors = defers.map((x) => x.error).filter((x) => x);
          if (errors.length > 0) {
            if (!(defer as any)[DEFER_WAIT]) {
              return invokeFinally(errors[0]);
            } else {
              return undefined;
            }
          }

          if (!(defer as any)._waiting && defers.every((x) => x.invoked) && index >= lastIx) {
            const results = defers.map((x) => x.result);
            return invokeFinally(undefined, results.length === 1 ? results[0] : results);
          }
        }
        return undefined;
      };

      defer.setAwait({
        resolve: (r) => onDefer(undefined, r),
        reject: (err) => onDefer(err),
        errorFromCall,
        timeoutMsg: `from runVerify`,
        waitTimeout: defer.timeout
      });
    };

    if (Object.prototype.hasOwnProperty.call(checkFunc, WRAPPED_FN)) {
      wrap = checkFunc as WrapObject;
      if (wrap._onFailVerify) {
        return nextCheckFunc(prevResult);
      }
      if (wrap._timeout) {
        clearTimeout(timeoutTimer);
        timeoutTimer = setTimeout(() => {
          // `index` has already moved past the step that stalled, so the step
          // still waiting is the one before it
          failError = errorMsg(
            errorFromCall,
            `runVerify: test timeout after ${wrap._timeout}ms while waiting for \
run check function number ${stepNum(index - 1)}`
          );
          wrap[WRAPPED_FN]!(failError);
          invokeFinally(failError);
        }, wrap._timeout);
        return nextCheckFunc(prevResult);
      }
      checkFunc = wrap[WRAPPED_FN];
    }

    if (checkFunc[DEFER_EVENT]) {
      const defer = checkFunc[DEFER_OBJ] || checkFunc;
      if (defers.indexOf(defer) < 0) {
        addDefer(defer);
      }

      if (!defer[DEFER_WAIT] || checkFunc === defer) {
        return setTimeout(() => nextCheckFunc(prevResult));
      }
    }

    const tof = typeof checkFunc;
    if (tof !== "function") {
      return invokeFinally(
        errorMsg(errorFromCall, `runVerify param ${stepNum(index)} is not a function: type ${tof}`)
      );
    }

    let cbNext: boolean | undefined;
    let wantResult = checkFunc.length > 0;

    if (checkFunc.constructor.name === "AsyncFunction") {
      cbNext = false;
    } else if (checkFunc.length > 1) {
      cbNext = true;
    } else if (
      wrap._withCallback === true ||
      detectWantCallbackByParamName(checkFunc, stepNum(index), invokeFinally as DoneCallback)
    ) {
      cbNext = true;
      wantResult = false;
    }

    const prevIndex = index++;

    const expectError = Boolean(wrap._expectError);
    const failExpectError = () => {
      return errorMsg(
        errorFromCall,
        `runVerify expecting error from check function number ${stepNum(prevIndex)}`
      );
    };

    const invokeWithExpectError = (err: Error): any => {
      if (wrap._expectError === "has") {
        if (err.message.indexOf(wrap._expectErrorMsg!) < 0) {
          return invokeFinally(
            errorMsg(
              errorFromCall,
              `runVerify expecting error with message has '${wrap._expectErrorMsg}'`
            )
          );
        }
      } else if (wrap._expectError === "toBe") {
        if (err.message !== wrap._expectErrorMsg) {
          return invokeFinally(
            errorMsg(
              errorFromCall,
              `runVerify expecting error with message to be '${wrap._expectErrorMsg}'`
            )
          );
        }
      }

      if (wrap._expectErrorCode !== undefined) {
        const code = (err as Error & { code?: ErrorCode }).code;
        if (code !== wrap._expectErrorCode) {
          return invokeFinally(
            errorMsg(
              errorFromCall,
              `runVerify expecting error with code to be '${wrap._expectErrorCode}' but got '${code}'`
            )
          );
        }
      }

      return invokeCheckFunc(err);
    };

    if (cbNext) {
      try {
        const next = expectError
          ? (err?: Error) => {
              if (err) return invokeWithExpectError(err);
              return invokeFinally(failExpectError());
            }
          : (err?: Error, r?: any) => {
              if (err) return invokeFinally(err);
              return invokeCheckFunc(r);
            };

        if (wantResult) {
          return checkFunc(prevResult, next);
        } else {
          return checkFunc(next);
        }
      } catch (err) {
        return expectError ? invokeWithExpectError(err as Error) : invokeFinally(err as Error);
      }
    } else {
      let result;

      try {
        if (wantResult) {
          result = checkFunc(prevResult);
        } else {
          result = checkFunc();
        }
      } catch (err) {
        return expectError ? invokeWithExpectError(err as Error) : invokeFinally(err as Error);
      }

      if (result && result.then && result.catch) {
        if (expectError) {
          let error: Error | undefined;
          return result
            .catch((err: Error) => {
              error = err;
            })
            .then(() => {
              if (error === undefined) {
                return invokeFinally(failExpectError());
              } else {
                return invokeWithExpectError(error);
              }
            });
        } else {
          return result.then(invokeCheckFunc).catch(invokeFinally);
        }
      } else if (expectError) {
        return invokeFinally(failExpectError());
      } else {
        return invokeCheckFunc(result);
      }
    }
  };

  invokeCheckFunc();
}

/**
 * Run test steps in order, then call `done`.
 *
 * Pass the steps as function parameters, with `done` last. Each step's result is
 * passed to the next step. `done(err, result)` is called with the last step's result,
 * or right away with the error from the first step that fails.
 *
 * @param args - the steps to run, followed by the `done` callback
 */
export function runVerify(...args: any[]): void {
  const errorFromCall = new Error();
  if (Error.captureStackTrace) {
    Error.captureStackTrace(errorFromCall, runVerify);
  }

  return _runVerify(args, errorFromCall);
}

/**
 * Run test steps in order and return a Promise.
 *
 * The same runner as {@link runVerify}, without the `done` callback. Pass the steps as
 * function parameters. Each step's result is passed to the next step. The Promise
 * resolves with the last step's result, or rejects with the error from the first step
 * that fails.
 *
 * @param args - the steps to run. Do not pass a `done` callback.
 */
export function asyncVerify(...args: any[]): Promise<any> {
  const errorFromCall = new Error();
  if (Error.captureStackTrace) {
    Error.captureStackTrace(errorFromCall, asyncVerify);
  }

  return _asyncVerifyFrom(errorFromCall, args);
}

/**
 * Run the steps with a caller-supplied call-site error.
 *
 * The runner reports its own failures, such as a timeout, through this error, so
 * its stack decides which frames the message points at. A wrapper like
 * `verify()` calls `asyncVerify` from inside itself, which would make those
 * messages name the wrapper instead of the test. Passing the error captured at
 * the wrapper's own entry point keeps the test in the trace.
 *
 * The error is mutated as the run reports failures, so give each run its own.
 *
 * @internal not part of the public API
 */
export function _asyncVerifyFrom(errorFromCall: Error, args: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    _runVerify([...args, (err: Error, res: any) => (err ? reject(err) : resolve(res))], errorFromCall);
  });
}

/**
 * Turn a reusable list of steps into a function that takes the first step's input.
 * Calling the result runs those steps with `x` as the starting value.
 */
export function wrapAsyncVerify(...args: any[]): (x: any) => Promise<any> {
  return (x) => asyncVerify(() => x, ...args);
}

export function wrapVerify(...args: any[]): (x: any) => void {
  return (x) => runVerify(() => x, ...args);
}

export const wrapFn = (fn: CheckFunction): WrapObject => {
  return { [WRAPPED_FN]: fn } as WrapObject;
};

export const wrapCheck = (fn: CheckFunction): WrapObject => {
  const wrap = wrapFn(fn);

  Object.defineProperty(wrap, "expectError", {
    get() {
      wrap._expectError = true;
      return wrap;
    }
  });

  Object.defineProperty(wrap, "withCallback", {
    get() {
      wrap._withCallback = true;
      return wrap;
    }
  });

  Object.defineProperty(wrap, "onFailVerify", {
    get() {
      wrap._onFailVerify = true;
      return wrap;
    }
  });

  wrap.expectErrorHas = (msg: string, code?: ErrorCode) => {
    wrap._expectError = "has";
    wrap._expectErrorMsg = msg;
    wrap._expectErrorCode = code;
    return wrap;
  };

  wrap.expectErrorToBe = (msg: string, code?: ErrorCode) => {
    wrap._expectError = "toBe";
    wrap._expectErrorMsg = msg;
    wrap._expectErrorCode = code;
    return wrap;
  };

  wrap.runTimeout = (delay: number) => {
    wrap._timeout = delay;
    return wrap;
  };

  return wrap;
};

/**
 * Require this step to fail. A throw, a rejection, and `next(err)` all satisfy it, and
 * the error is passed on as the next step's input. If the step succeeds, the run fails.
 * Returning an `Error` as a normal value counts as success, so it fails too.
 */
export const expectError = (fn: CheckFunction): WrapObject => {
  return wrapCheck(fn).expectError!;
};

/** Like {@link expectError}, and also require the error message to contain `msg`. When
 * `code` is given, require the top-level error code to equal it. The error is still passed
 * on as the next step's input. */
export const expectErrorHas = (fn: CheckFunction, msg: string, code?: ErrorCode): WrapObject => {
  return wrapCheck(fn).expectErrorHas!(msg, code);
};

/** Like {@link expectError}, and also require the error message to equal `msg`. When
 * `code` is given, require the top-level error code to equal it. The error is still passed
 * on as the next step's input. */
export const expectErrorToBe = (fn: CheckFunction, msg: string, code?: ErrorCode): WrapObject => {
  return wrapCheck(fn).expectErrorToBe!(msg, code);
};

/**
 * A step that runs only if the run failed at its spot in the list. While the run is
 * passing it is skipped, and the current value passes through.
 */
export const onFailVerify = (fn: CheckFunction): WrapObject => {
  return wrapCheck(fn).onFailVerify!;
};

/**
 * Mark a one parameter step as taking a `next` callback, instead of relying on the
 * parameter-name check. Such a step gets only the callback. The previous step's value
 * is not passed to it. A two parameter step already gets `(result, next)` and does not
 * need this.
 */
export const withCallback = (fn: CheckFunction): WrapObject => {
  return wrapCheck(fn).withCallback!;
};

/**
 * Start a deadline of `delay` ms at this spot in the list, replacing any deadline set
 * earlier in the run. This is one runner deadline, not a timer around each step. There
 * is no default. The current value passes through to the next step unchanged.
 */
export const runTimeout = (delay: number, fn?: CheckFunction): WrapObject => {
  return wrapCheck(fn || (() => {})).runTimeout!(delay);
};

/**
 * Create a signal the sequence can wait on, for an event or any other out of band
 * completion.
 *
 * Put the defer object itself in the step list to register it. Registering does not
 * block: the run keeps going, and the current value passes through. But the run cannot
 * finish until every registered defer has settled.
 *
 * Put `defer.wait([ms])` in the list to block at that spot until the signal settles.
 * The next step then gets the signal's value, and the previous value is dropped. A
 * signal that already settled makes `wait()` continue right away, so a test can set up
 * listeners, start the work, and check the result later.
 *
 * @param timeout - optional deadline in ms for this signal
 */
export const runDefer = (timeout?: number): DeferObject => {
  const event = new EventEmitter();
  const handlers: DeferHandlers = {
    resolve: [],
    reject: []
  };

  const d: DeferObject = {
    timeout,
    event,
    handlers,
    [DEFER_EVENT]: event,
    resolve(r) {
      event.emit("resolve", r);
      if (!this._waiting && !this.invoked) {
        this.invoked = true;
        this.result = r;
      }
    },
    reject(err) {
      event.emit("reject", err);
      if (!this._waiting && !this.invoked) {
        this.invoked = true;
        this.failed = true;
        this.error = err;
      }
    },
    onResolve(cb) {
      handlers.resolve.push(cb);
      return d;
    },
    onReject(cb) {
      handlers.reject.push(cb);
      return d;
    },
    pending() {
      return !d.invoked;
    },
    clear() {
      const fn = () => {
        if (d._waited) {
          d._waited = false;
        }
        if (d.invoked) {
          d.invoked = false;
          d.failed = false;
        }
      };

      fn();

      return fn;
    },
    setAwait({ resolve, reject, errorFromCall, timeoutMsg, waitTimeout }) {
      if (d.invoked) {
        if (d.failed) {
          reject(d.error!);
        } else {
          resolve(d.result);
        }
      } else {
        d._waiting = true;

        let timer: ReturnType<typeof setTimeout> | undefined;
        let handler: (type: string, v: any) => void;
        const resolveCb = (r: any) => handler("resolve", r);
        const rejectCb = (err: Error) => handler("reject", err);

        handler = (type, v) => {
          clearTimeout(timer);
          d._waiting = false;
          event.removeListener("resolve", resolveCb);
          event.removeListener("reject", rejectCb);
          if (type === "reject") {
            d.failed = true;
            d.error = v;
            reject(v);
          } else {
            d.result = v;
            resolve(v);
          }
          d.invoked = true;
        };

        event.on("resolve", resolveCb);
        event.on("reject", rejectCb);

        if (waitTimeout && waitTimeout > 0) {
          timer = setTimeout(() => {
            return (
              d.invoked ||
              event.emit(
                "reject",
                errorMsg(errorFromCall, `defer timeout after ${waitTimeout}ms - ${timeoutMsg}`)
              )
            );
          }, waitTimeout);
          timer.unref();
        }
      }
    },
    waitAgain(waitTimeout) {
      return d.wait(waitTimeout, true);
    },
    wait(waitTimeout, again) {
      const errorFromCall = new Error();
      if (Error.captureStackTrace) {
        Error.captureStackTrace(errorFromCall, d.wait);
      }

      const waitFn = (() => {
        const canWait = again || !d._waited;
        if (!canWait) {
          throw new Error(
            "defer already waited. To wait again, call waitAgain([ms]) or wait([ms], true), or you should clear it first."
          );
        }
        d._waited = true;

        return new Promise((resolve, reject) => {
          d.setAwait({
            resolve,
            reject,
            errorFromCall,
            timeoutMsg: "from defer.wait",
            waitTimeout
          });
        });
      }) as WaitFunction;

      (d as any)[DEFER_WAIT] = true;
      waitFn[DEFER_OBJ] = d;
      waitFn[DEFER_EVENT] = event;

      return waitFn;
    }
  };
  return d;
};

/**
 * Register cleanup that runs once the run ends, whether it passed or failed.
 *
 * These are pulled out of the step list before the run starts, so their position does
 * not matter and they are not part of the value flow. You can pass more than one. A
 * cleanup function may return a Promise. If one throws or rejects, that error goes to
 * `done`.
 */
export const runFinally = (fn: CheckFunction): WrapObject => {
  const wrap = wrapFn(fn);
  wrap[IS_FINALLY] = true;
  return wrap;
};
