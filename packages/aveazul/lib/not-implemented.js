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
    "spread",
    "error",
    "bind",
    "join",
    "try",
    "method",
    "isFulfilled",
    "isRejected",
    "isPending",
    "value",
    "reason",
    "props",
    "any",
    "some",
    "map",
    "reduce",
    "filter",
    "each",
    "mapSeries",
    "tap",
    "tapCatch",
    "catchThrow",
    "catchReturn",
    "get",
    "throw",
    "call",
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
    "all",
    "props",
    "any",
    "some",
    "map",
    "filter",
    "each",
    "mapSeries",
    "race",
    "promisify",
    "promisifyAll",
    "fromNode",
    "fromCallback",
    "delay",
    "coroutine",
    "config",
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
  const instance = createInstanceNotImplemented(AveAzul);
  const staticMethods = createStaticNotImplemented(AveAzul);
  AveAzul.__notImplementedInstance = instance;
  AveAzul.__notImplementedStatic = staticMethods;
}

module.exports = {
  createInstanceNotImplemented,
  createStaticNotImplemented,
  setupNotImplemented,
};
