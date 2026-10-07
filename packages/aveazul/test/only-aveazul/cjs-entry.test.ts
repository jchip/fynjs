import { readFileSync } from "node:fs";
import { runInThisContext } from "node:vm";
import { verify } from "run-verify";
import { describe, test, expect } from "vitest";
import * as ns from "../../src/index.ts";

const { AveAzul } = ns;
const classPromisify = AveAzul.promisify;
const classPromisifyAll = AveAzul.promisifyAll;

// Run cjs-entry.cjs against the source namespace, so the shim acts on the same
// class object that ESM imports see.
function loadCjsEntry(): any {
  const code = readFileSync(new URL("../../cjs-entry.cjs", import.meta.url), "utf8");
  const wrapper = runInThisContext(`(function (exports, require, module) {${code}\n})`);
  const module = { exports: {} as any };
  wrapper(module.exports, () => ns, module);
  return module.exports;
}

describe("cjs-entry", () => {
  test("exports the AveAzul class", () => {
    return verify({ timeout: 1000 })
      .step(() => ({ cjs: loadCjsEntry() }))
      .step(({ cjs }) => expect(cjs).toBe(AveAzul));
  });

  test("require().promisify returns an AveAzul instance", () => {
    return verify({ timeout: 1000 })
      .step(() => ({ cjs: loadCjsEntry() }))
      .step(({ cjs }) => ({ promise: cjs.promisify((cb: any) => cb(null, 1))() }))
      .keep.step(({ promise }) => expect(promise).toBeInstanceOf(AveAzul))
      .step(({ promise }) => promise)
      .step((value) => expect(value).toBe(1));
  });

  test("ESM statics are unchanged after loading the CJS entry", () => {
    return verify({ timeout: 1000 })
      .step(() => loadCjsEntry())
      .step(() => ({ promise: AveAzul.promisify((cb: any) => cb(null, 1))() }))
      .keep.step(() => expect(AveAzul.promisify).toBe(classPromisify))
      .keep.step(() => expect(AveAzul.promisifyAll).toBe(classPromisifyAll))
      .keep.step(({ promise }) => expect(promise).toBeInstanceOf(AveAzul))
      .step(({ promise }) => promise)
      .step((value) => expect(value).toBe(1));
  });

  test("named extras are still reachable from require()", () => {
    return verify({ timeout: 1000 })
      .step(() => ({ cjs: loadCjsEntry() }))
      .keep.step(({ cjs }) => expect(cjs.AveAzul).toBe(AveAzul))
      .keep.step(({ cjs }) => expect(cjs.default).toBe(AveAzul))
      .keep.step(({ cjs }) => expect(cjs.Disposer).toBe(ns.Disposer))
      .keep.step(({ cjs }) => expect(cjs.OperationalError).toBe(ns.OperationalError))
      .keep.step(({ cjs }) => expect(cjs.isOperationalError).toBe(ns.isOperationalError))
      .step(({ cjs }) => expect(cjs.isProgrammerError).toBe(ns.isProgrammerError));
  });
});
