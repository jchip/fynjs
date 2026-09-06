import { describe, it, expect, vi } from "vitest";
import { createResolveFilename, createTsMapper } from "../../src/index.ts";

const PARENT = { filename: "/p/src/entry.ts" };

/** Wrapped resolver backed by a fake filesystem, plus a spy for the fall-through. */
const setup = (...files: string[]) => {
  const set = new Set(files);
  const next = vi.fn((request: string) => `next:${request}`);
  const mapTs = createTsMapper({ isFile: (url: string) => set.has(url) });
  return { resolve: createResolveFilename(mapTs, next), next };
};

describe("createResolveFilename", () => {
  it("maps a relative specifier onto its TypeScript source as a path", () => {
    const { resolve, next } = setup("file:///p/src/lib.ts");
    // _resolveFilename returns a path, not a URL - that is the whole difference
    // from the ESM hook, and what the CJS loader requires.
    expect(resolve("./lib.js", PARENT, false)).toBe("/p/src/lib.ts");
    expect(next).not.toHaveBeenCalled();
  });

  it("maps an extensionless specifier", () => {
    const { resolve, next } = setup("file:///p/src/util.ts");
    expect(resolve("./util", PARENT, false)).toBe("/p/src/util.ts");
    expect(next).not.toHaveBeenCalled();
  });

  it("leaves a real .js sibling alone", () => {
    const { resolve, next } = setup("file:///p/src/lib.js", "file:///p/src/lib.ts");
    expect(resolve("./lib.js", PARENT, false)).toBe("next:./lib.js");
    expect(next).toHaveBeenCalledOnce();
  });

  it("delegates a relative specifier with no TypeScript source", () => {
    const { resolve, next } = setup();
    expect(resolve("./lib.js", PARENT, false)).toBe("next:./lib.js");
    expect(next).toHaveBeenCalledOnce();
  });

  it("delegates bare specifiers untouched", () => {
    const { resolve, next } = setup("file:///p/src/lodash.ts");
    expect(resolve("lodash", PARENT, false)).toBe("next:lodash");
    expect(next).toHaveBeenCalledOnce();
  });

  it("delegates when the parent has no filename", () => {
    const { resolve, next } = setup("file:///p/src/lib.ts");
    expect(resolve("./lib.js", null, false)).toBe("next:./lib.js");
    expect(next).toHaveBeenCalledOnce();
  });

  it("resolves parent-relative specifiers", () => {
    const { resolve, next } = setup("file:///p/lib.ts");
    expect(resolve("../lib.js", PARENT, false)).toBe("/p/lib.ts");
    expect(next).not.toHaveBeenCalled();
  });

  it("forwards isMain and options to the wrapped resolver", () => {
    const { resolve, next } = setup();
    resolve("./lib.js", PARENT, true, { paths: ["/x"] });
    expect(next).toHaveBeenCalledWith("./lib.js", PARENT, true, { paths: ["/x"] });
  });
});
