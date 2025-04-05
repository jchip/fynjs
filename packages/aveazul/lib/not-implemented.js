"use strict";

function createNotImplemented(name) {
  return function () {
    const msg = name + " Not implemented in aveazul";
    console.error(msg);
    throw new Error(msg);
  };
}

function createInstanceNotImplemented(AveAzul) {
  const methods = [
    "then",
    "spread",
    "catch",
    "error",
    "finally",
    "bind",
    "isFulfilled",
    "isRejected",
    "isPending",
    "isCancelled",
    "value",
    "reason",
    "all",
    "props",
    "any",
    "some",
    "map",
    "reduce",
    "filter",
    "each",
    "mapSeries",
    "disposer",
    "asCallback",
    "delay",
    "timeout",
    "cancel",
    "tap",
    "tapCatch",
    "call",
    "get",
    "return",
    "throw",
    "catchReturn",
    "catchThrow",
    "reflect",
    "suppressUnhandledRejections",
    "done",
  ];

  const proto = AveAzul.prototype;
  const ret = [];
  for (const method of methods) {
    if (!proto[method]) {
      ret.push(method);
      proto[method] = createNotImplemented("instance " + method);
    }
  }
  return ret;
}

function createStaticNotImplemented(AveAzul) {
  const methods = [
    "join",
    "try",
    "method",
    "resolve",
    "reject",
    "props",
    "any",
    "some",
    "map",
    "reduce",
    "filter",
    "each",
    "mapSeries",
    "race",
    "using",
    "promisify",
    "promisifyAll",
    "fromCallback",
    "delay",
    "coroutine",
    "coroutine.addYieldHandler",
    "getNewLibraryCopy",
    "noConflict",
    "setScheduler",
  ];
  const ret = [];
  for (const method of methods) {
    if (!AveAzul[method]) {
      ret.push(method);
      AveAzul[method] = createNotImplemented("static " + method);
    }
  }
  return ret;
}

function setupNotImplemented(AveAzul) {
  const instanceMethods = createInstanceNotImplemented(AveAzul);
  const staticMethods = createStaticNotImplemented(AveAzul);
  AveAzul.__notImplementedInstance = instanceMethods;
  AveAzul.__notImplementedStatic = staticMethods;
}

module.exports = {
  createInstanceNotImplemented,
  createStaticNotImplemented,
  setupNotImplemented,
};
