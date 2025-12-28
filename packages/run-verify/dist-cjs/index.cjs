"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runFinally = exports.runDefer = exports.runTimeout = exports.withCallback = exports.onFailVerify = exports.expectErrorToBe = exports.expectErrorHas = exports.expectError = exports.wrapCheck = exports.wrapFn = exports.DEFER_OBJ = exports.DEFER_WAIT = exports.DEFER_EVENT = exports.IS_FINALLY = exports.WRAPPED_FN = void 0;
exports.runVerify = runVerify;
exports.asyncVerify = asyncVerify;
exports.wrapAsyncVerify = wrapAsyncVerify;
exports.wrapVerify = wrapVerify;
const events_1 = require("events");
const symbols_ts_1 = require("./symbols.cjs");
var symbols_ts_2 = require("./symbols.cjs");
Object.defineProperty(exports, "WRAPPED_FN", { enumerable: true, get: function () { return symbols_ts_2.WRAPPED_FN; } });
Object.defineProperty(exports, "IS_FINALLY", { enumerable: true, get: function () { return symbols_ts_2.IS_FINALLY; } });
Object.defineProperty(exports, "DEFER_EVENT", { enumerable: true, get: function () { return symbols_ts_2.DEFER_EVENT; } });
Object.defineProperty(exports, "DEFER_WAIT", { enumerable: true, get: function () { return symbols_ts_2.DEFER_WAIT; } });
Object.defineProperty(exports, "DEFER_OBJ", { enumerable: true, get: function () { return symbols_ts_2.DEFER_OBJ; } });
function detectWantCallbackByParamName(checkFunc, index, done) {
    const funcStr = checkFunc.toString().trim();
    let params;
    const fatIx = funcStr.indexOf("=>");
    if (fatIx > 0 && (funcStr.startsWith("()") || funcStr[0] !== "(")) {
        params = funcStr.substring(0, fatIx);
    }
    else {
        const match = funcStr.match(/^[^\(]*\(([^\)]+)\)/);
        if (!match || !match[1]) {
            done(new Error(`runVerify param ${index} unable to match arg name`));
            return false;
        }
        params = match[1];
    }
    params = params.trim().toLowerCase();
    return (params.startsWith("next") ||
        params.startsWith("cb") ||
        params.startsWith("callback") ||
        params.startsWith("done"));
}
const errorMsg = (error, message) => {
    error.message = message;
    return error;
};
function _runVerify(args, errorFromCall) {
    const finallyCbs = args.filter((x) => x[symbols_ts_1.IS_FINALLY] === true);
    const checkFuncs = args.filter((x) => x[symbols_ts_1.IS_FINALLY] !== true);
    const lastIx = checkFuncs.length - 1;
    const done = checkFuncs[lastIx];
    let index = 0;
    let timeoutTimer;
    let failError;
    const defers = [];
    let completed = false;
    if (checkFuncs.length < 2) {
        throw errorMsg(errorFromCall, "runVerify - must pass done function");
    }
    const invokeFinally = (err, result) => {
        if (completed)
            return;
        completed = true;
        failError = err && errorMsg(errorFromCall, err.message);
        const onFail = checkFuncs[index];
        let error = err;
        if (err && onFail && onFail[symbols_ts_1.WRAPPED_FN] && onFail._onFailVerify) {
            try {
                onFail[symbols_ts_1.WRAPPED_FN](err, result);
            }
            catch (err2) {
                error = err2;
            }
        }
        let returnFinallyCbs = [];
        try {
            finallyCbs.forEach((wrap) => returnFinallyCbs.push(wrap[symbols_ts_1.WRAPPED_FN]()));
            returnFinallyCbs = returnFinallyCbs.filter((x) => x);
        }
        catch (err2) {
            error = err2;
        }
        const invokeDone = () => {
            clearTimeout(timeoutTimer);
            if (done.length > 1) {
                return done(error, result);
            }
            else {
                return done(error);
            }
        };
        if (returnFinallyCbs.length > 0) {
            Promise.all(returnFinallyCbs)
                .catch((err2) => {
                if (!error)
                    error = err2;
            })
                .then(invokeDone);
        }
        else {
            invokeDone();
        }
    };
    const invokeCheckFunc = (prevResult) => {
        if (failError) {
            return undefined;
        }
        if (index >= lastIx) {
            if (defers.length && !defers.every((x) => x.invoked)) {
                return undefined;
            }
            return invokeFinally(undefined, prevResult);
        }
        const nextCheckFunc = (r) => {
            index++;
            return invokeCheckFunc(r);
        };
        let wrap = {};
        let checkFunc = checkFuncs[index];
        const addDefer = (defer) => {
            defers.push(defer);
            const invokeDeferHandlers = (handlers, value) => {
                for (const h of handlers) {
                    try {
                        h(value);
                    }
                    catch (err) {
                        defer.failed = true;
                        defer.error = err;
                        break;
                    }
                }
                return undefined;
            };
            const onDefer = (err, r) => {
                if (!failError && !defer.invoked) {
                    defer.invoked = true;
                    if (!err) {
                        invokeDeferHandlers(defer.handlers.resolve, r);
                    }
                    else {
                        invokeDeferHandlers(defer.handlers.reject, err);
                    }
                    const errors = defers.map((x) => x.error).filter((x) => x);
                    if (errors.length > 0) {
                        if (!defer[symbols_ts_1.DEFER_WAIT]) {
                            return invokeFinally(errors[0]);
                        }
                        else {
                            return undefined;
                        }
                    }
                    if (!defer._waiting && defers.every((x) => x.invoked) && index >= lastIx) {
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
        if (Object.prototype.hasOwnProperty.call(checkFunc, symbols_ts_1.WRAPPED_FN)) {
            wrap = checkFunc;
            if (wrap._onFailVerify) {
                return nextCheckFunc(prevResult);
            }
            if (wrap._timeout) {
                clearTimeout(timeoutTimer);
                timeoutTimer = setTimeout(() => {
                    failError = errorMsg(errorFromCall, `runVerify: test timeout after ${wrap._timeout}ms while waiting for \
run check function number ${index + 1}`);
                    wrap[symbols_ts_1.WRAPPED_FN](failError);
                    invokeFinally(failError);
                }, wrap._timeout);
                return nextCheckFunc(prevResult);
            }
            checkFunc = wrap[symbols_ts_1.WRAPPED_FN];
        }
        if (checkFunc[symbols_ts_1.DEFER_EVENT]) {
            const defer = checkFunc[symbols_ts_1.DEFER_OBJ] || checkFunc;
            if (defers.indexOf(defer) < 0) {
                addDefer(defer);
            }
            if (!defer[symbols_ts_1.DEFER_WAIT] || checkFunc === defer) {
                return setTimeout(() => nextCheckFunc(prevResult));
            }
        }
        const tof = typeof checkFunc;
        if (tof !== "function") {
            return invokeFinally(errorMsg(errorFromCall, `runVerify param ${index} is not a function: type ${tof}`));
        }
        let cbNext;
        let wantResult = checkFunc.length > 0;
        if (checkFunc.constructor.name === "AsyncFunction") {
            cbNext = false;
        }
        else if (checkFunc.length > 1) {
            cbNext = true;
        }
        else if (wrap._withCallback === true ||
            detectWantCallbackByParamName(checkFunc, index, invokeFinally)) {
            cbNext = true;
            wantResult = false;
        }
        const prevIndex = index++;
        const expectError = Boolean(wrap._expectError);
        const failExpectError = () => {
            return errorMsg(errorFromCall, `runVerify expecting error from check function number ${prevIndex}`);
        };
        const invokeWithExpectError = (err) => {
            if (wrap._expectError === "has") {
                if (err.message.indexOf(wrap._expectErrorMsg) < 0) {
                    return invokeFinally(errorMsg(errorFromCall, `runVerify expecting error with message has '${wrap._expectErrorMsg}'`));
                }
            }
            else if (wrap._expectError === "toBe") {
                if (err.message !== wrap._expectErrorMsg) {
                    return invokeFinally(errorMsg(errorFromCall, `runVerify expecting error with message to be '${wrap._expectErrorMsg}'`));
                }
            }
            return invokeCheckFunc(err);
        };
        if (cbNext) {
            try {
                const next = expectError
                    ? (err) => {
                        if (err)
                            return invokeWithExpectError(err);
                        return invokeFinally(failExpectError());
                    }
                    : (err, r) => {
                        if (err)
                            return invokeFinally(err);
                        return invokeCheckFunc(r);
                    };
                if (wantResult) {
                    return checkFunc(prevResult, next);
                }
                else {
                    return checkFunc(next);
                }
            }
            catch (err) {
                return expectError ? invokeWithExpectError(err) : invokeFinally(err);
            }
        }
        else {
            let result;
            try {
                if (wantResult) {
                    result = checkFunc(prevResult);
                }
                else {
                    result = checkFunc();
                }
            }
            catch (err) {
                return expectError ? invokeWithExpectError(err) : invokeFinally(err);
            }
            if (result && result.then && result.catch) {
                if (expectError) {
                    let error;
                    return result
                        .catch((err) => {
                        error = err;
                    })
                        .then(() => {
                        if (error === undefined) {
                            return invokeFinally(failExpectError());
                        }
                        else {
                            return invokeWithExpectError(error);
                        }
                    });
                }
                else {
                    return result.then(invokeCheckFunc).catch(invokeFinally);
                }
            }
            else if (expectError) {
                return invokeFinally(failExpectError());
            }
            else {
                return invokeCheckFunc(result);
            }
        }
    };
    invokeCheckFunc();
}
function runVerify(...args) {
    const errorFromCall = new Error();
    if (Error.captureStackTrace) {
        Error.captureStackTrace(errorFromCall, runVerify);
    }
    return _runVerify(args, errorFromCall);
}
function asyncVerify(...args) {
    const errorFromCall = new Error();
    if (Error.captureStackTrace) {
        Error.captureStackTrace(errorFromCall, asyncVerify);
    }
    return new Promise((resolve, reject) => {
        _runVerify([...args, (err, res) => (err ? reject(err) : resolve(res))], errorFromCall);
    });
}
function wrapAsyncVerify(...args) {
    return (x) => asyncVerify(() => x, ...args);
}
function wrapVerify(...args) {
    return (x) => runVerify(() => x, ...args);
}
const wrapFn = (fn) => {
    return { [symbols_ts_1.WRAPPED_FN]: fn };
};
exports.wrapFn = wrapFn;
const wrapCheck = (fn) => {
    const wrap = (0, exports.wrapFn)(fn);
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
    wrap.expectErrorHas = (msg) => {
        wrap._expectError = "has";
        wrap._expectErrorMsg = msg;
        return wrap;
    };
    wrap.expectErrorToBe = (msg) => {
        wrap._expectError = "toBe";
        wrap._expectErrorMsg = msg;
        return wrap;
    };
    wrap.runTimeout = (delay) => {
        wrap._timeout = delay;
        return wrap;
    };
    return wrap;
};
exports.wrapCheck = wrapCheck;
const expectError = (fn) => {
    return (0, exports.wrapCheck)(fn).expectError;
};
exports.expectError = expectError;
const expectErrorHas = (fn, msg) => {
    return (0, exports.wrapCheck)(fn).expectErrorHas(msg);
};
exports.expectErrorHas = expectErrorHas;
const expectErrorToBe = (fn, msg) => {
    return (0, exports.wrapCheck)(fn).expectErrorToBe(msg);
};
exports.expectErrorToBe = expectErrorToBe;
const onFailVerify = (fn) => {
    return (0, exports.wrapCheck)(fn).onFailVerify;
};
exports.onFailVerify = onFailVerify;
const withCallback = (fn) => {
    return (0, exports.wrapCheck)(fn).withCallback;
};
exports.withCallback = withCallback;
const runTimeout = (delay, fn) => {
    return (0, exports.wrapCheck)(fn || (() => { })).runTimeout(delay);
};
exports.runTimeout = runTimeout;
const runDefer = (timeout) => {
    const event = new events_1.EventEmitter();
    const handlers = {
        resolve: [],
        reject: []
    };
    const d = {
        timeout,
        event,
        handlers,
        [symbols_ts_1.DEFER_EVENT]: event,
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
                    reject(d.error);
                }
                else {
                    resolve(d.result);
                }
            }
            else {
                d._waiting = true;
                let timer;
                let handler;
                const resolveCb = (r) => handler("resolve", r);
                const rejectCb = (err) => handler("reject", err);
                handler = (type, v) => {
                    clearTimeout(timer);
                    d._waiting = false;
                    event.removeListener("resolve", resolveCb);
                    event.removeListener("reject", rejectCb);
                    if (type === "reject") {
                        d.failed = true;
                        d.error = v;
                        reject(v);
                    }
                    else {
                        d.result = v;
                        resolve(v);
                    }
                    d.invoked = true;
                };
                event.on("resolve", resolveCb);
                event.on("reject", rejectCb);
                if (waitTimeout && waitTimeout > 0) {
                    timer = setTimeout(() => {
                        return (d.invoked ||
                            event.emit("reject", errorMsg(errorFromCall, `defer timeout after ${waitTimeout}ms - ${timeoutMsg}`)));
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
                    throw new Error("defer already waited. To wait again, call waitAgain([ms]) or wait([ms], true), or you should clear it first.");
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
            });
            d[symbols_ts_1.DEFER_WAIT] = true;
            waitFn[symbols_ts_1.DEFER_OBJ] = d;
            waitFn[symbols_ts_1.DEFER_EVENT] = event;
            return waitFn;
        }
    };
    return d;
};
exports.runDefer = runDefer;
const runFinally = (fn) => {
    const wrap = (0, exports.wrapFn)(fn);
    wrap[symbols_ts_1.IS_FINALLY] = true;
    return wrap;
};
exports.runFinally = runFinally;
//# sourceMappingURL=index.cjs.map