import { describe, it, expect, vi } from "vitest";
import { createResolveHook } from "../../src/index.ts";

const PARENT = "file:///p/src/entry.ts";

/** Hook backed by a fake filesystem, plus a spy for the pass-through path. */
const setup = (...files: string[]) => {
  const set = new Set(files);
  const next = vi.fn((specifier: string) => ({ url: `next:${specifier}` }));
  const hook = createResolveHook({ isFile: (url: string) => set.has(url) });
  return { hook, next };
};

describe("createResolveHook", () => {
  it("short-circuits a relative specifier onto its TypeScript source", () => {
    const { hook, next } = setup("file:///p/src/lib.ts");
    expect(hook("./lib.js", { parentURL: PARENT }, next)).toEqual({
      url: "file:///p/src/lib.ts",
      shortCircuit: true
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("never sets a format, so node keeps its own stripping", () => {
    const { hook, next } = setup("file:///p/src/lib.ts");
    const result = hook("./lib.js", { parentURL: PARENT }, next);
    expect(result).not.toHaveProperty("format");
  });

  it("delegates a relative specifier with no TypeScript source", () => {
    const { hook, next } = setup();
    expect(hook("./lib.js", { parentURL: PARENT }, next)).toEqual({ url: "next:./lib.js" });
    expect(next).toHaveBeenCalledOnce();
  });

  it("delegates bare specifiers untouched", () => {
    const { hook, next } = setup("file:///p/src/lodash.ts");
    expect(hook("lodash", { parentURL: PARENT }, next)).toEqual({ url: "next:lodash" });
    expect(next).toHaveBeenCalledOnce();
  });

  it("delegates when there is no parent url", () => {
    const { hook, next } = setup("file:///p/src/lib.ts");
    expect(hook("./lib.js", {}, next)).toEqual({ url: "next:./lib.js" });
    expect(next).toHaveBeenCalledOnce();
  });

  it("resolves parent-relative specifiers", () => {
    const { hook, next } = setup("file:///p/lib.ts");
    expect(hook("../lib.js", { parentURL: PARENT }, next)).toEqual({
      url: "file:///p/lib.ts",
      shortCircuit: true
    });
    expect(next).not.toHaveBeenCalled();
  });
});
