import { EventEmitter } from "events";
import { WRAPPED_FN, IS_FINALLY, DEFER_EVENT, DEFER_WAIT, DEFER_OBJ } from "./symbols.ts";

export { WRAPPED_FN, IS_FINALLY, DEFER_EVENT, DEFER_WAIT, DEFER_OBJ } from "./symbols.ts";

export type CheckFunction = (...args: any[]) => any;
export type DoneCallback = (err?: Error | null, result?: any) => void;
export type NextCallback = (err?: Error | null, result?: any) => void;

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
  _withCallback?: boolean;
  _onFailVerify?: boolean;
  _timeout?: number;
  expectError?: WrapObject;
  withCallback?: WrapObject;
  onFailVerify?: WrapObject;
  expectErrorHas?(msg: string): WrapObject;
  expectErrorToBe?(msg: string): WrapObject;
  runTimeout?(delay: number): WrapObject;
}

function detectWantCallbackByParamName(
  checkFunc: CheckFunction,
  index: number,
  done: DoneCallback
): boolean {
  const funcStr = checkFunc.toString().trim();
  let params: string;

  const fatIx = funcStr.indexOf("=>");

  if (fatIx > 0 && (funcStr.startsWith("()") || funcStr[0] !== "(")) {
    params = funcStr.substring(0, fatIx);
  } else {
    const match = funcStr.match(/^[^\(]*\(([^\)]+)\)/);
    if (!match || !match[1]) {
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
          failError = errorMsg(
            errorFromCall,
            `runVerify: test timeout after ${wrap._timeout}ms while waiting for \
run check function number ${index + 1}`
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
        errorMsg(errorFromCall, `runVerify param ${index} is not a function: type ${tof}`)
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
      detectWantCallbackByParamName(checkFunc, index, invokeFinally as DoneCallback)
    ) {
      cbNext = true;
      wantResult = false;
    }

    const prevIndex = index++;

    const expectError = Boolean(wrap._expectError);
    const failExpectError = () => {
      return errorMsg(
        errorFromCall,
        `runVerify expecting error from check function number ${prevIndex}`
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

export function runVerify(...args: any[]): void {
  const errorFromCall = new Error();
  if (Error.captureStackTrace) {
    Error.captureStackTrace(errorFromCall, runVerify);
  }

  return _runVerify(args, errorFromCall);
}

export function asyncVerify(...args: any[]): Promise<any> {
  const errorFromCall = new Error();
  if (Error.captureStackTrace) {
    Error.captureStackTrace(errorFromCall, asyncVerify);
  }

  return new Promise((resolve, reject) => {
    _runVerify([...args, (err: Error, res: any) => (err ? reject(err) : resolve(res))], errorFromCall);
  });
}

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

  wrap.expectErrorHas = (msg: string) => {
    wrap._expectError = "has";
    wrap._expectErrorMsg = msg;
    return wrap;
  };

  wrap.expectErrorToBe = (msg: string) => {
    wrap._expectError = "toBe";
    wrap._expectErrorMsg = msg;
    return wrap;
  };

  wrap.runTimeout = (delay: number) => {
    wrap._timeout = delay;
    return wrap;
  };

  return wrap;
};

export const expectError = (fn: CheckFunction): WrapObject => {
  return wrapCheck(fn).expectError!;
};

export const expectErrorHas = (fn: CheckFunction, msg: string): WrapObject => {
  return wrapCheck(fn).expectErrorHas!(msg);
};

export const expectErrorToBe = (fn: CheckFunction, msg: string): WrapObject => {
  return wrapCheck(fn).expectErrorToBe!(msg);
};

export const onFailVerify = (fn: CheckFunction): WrapObject => {
  return wrapCheck(fn).onFailVerify!;
};

export const withCallback = (fn: CheckFunction): WrapObject => {
  return wrapCheck(fn).withCallback!;
};

export const runTimeout = (delay: number, fn?: CheckFunction): WrapObject => {
  return wrapCheck(fn || (() => {})).runTimeout!(delay);
};

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

export const runFinally = (fn: CheckFunction): WrapObject => {
  const wrap = wrapFn(fn);
  wrap[IS_FINALLY] = true;
  return wrap;
};
