import type { AveAzulClass } from "./aveazul.ts";

function createNotImplemented(name: string): () => never {
  return function (): never {
    const msg = name + " Not implemented in aveazul";
    console.error(msg);
    throw new Error(msg);
  };
}

export function createInstanceNotImplemented(AveAzul: AveAzulClass): string[] {
  const methods = [
    "then",
    "spread",
    "catch",
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

  const proto = AveAzul.prototype as Record<string, unknown>;
  const ret: string[] = [];
  for (const method of methods) {
    if (!proto[method]) {
      ret.push(method);
      proto[method] = createNotImplemented("instance " + method);
    }
  }
  return ret;
}

export function createStaticNotImplemented(AveAzul: AveAzulClass): string[] {
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
  const ret: string[] = [];
  const aveazul = AveAzul as unknown as Record<string, unknown>;
  for (const method of methods) {
    if (!aveazul[method]) {
      ret.push(method);
      aveazul[method] = createNotImplemented("static " + method);
    }
  }
  return ret;
}

export function setupNotImplemented(AveAzul: AveAzulClass): void {
  const instanceMethods = createInstanceNotImplemented(AveAzul);
  const staticMethods = createStaticNotImplemented(AveAzul);
  (AveAzul as unknown as Record<string, string[]>).__notImplementedInstance =
    instanceMethods;
  (AveAzul as unknown as Record<string, string[]>).__notImplementedStatic =
    staticMethods;
}
