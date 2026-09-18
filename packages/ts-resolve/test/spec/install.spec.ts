import { beforeEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { install } from "../../src/index.ts";
import type { createResolveFilename, createResolveHook } from "../../src/index.ts";

const { module, next, registerHooks } = vi.hoisted(() => {
  const next = vi.fn((request: string) => `next:${request}`);
  return {
    module: { _resolveFilename: next } as { _resolveFilename: ReturnType<typeof createResolveFilename> },
    next,
    registerHooks: vi.fn<(hooks: { resolve: ReturnType<typeof createResolveHook> }) => void>()
  };
});

// Keep process-wide loader state untouched while exercising the installation wiring.
vi.mock("node:module", () => ({ default: module, registerHooks }));

beforeEach(() => {
  vi.clearAllMocks();
  module._resolveFilename = next;
});

const parentURL = new URL("../fixtures/esm/entry.ts", import.meta.url).href;
const sourceURL = new URL("../fixtures/esm/lib.ts", import.meta.url).href;
const parent = { filename: fileURLToPath(parentURL) };

describe("install", () => {
  it("registers an ESM hook and patches CommonJS resolution with filesystem defaults", () => {
    install();

    expect(registerHooks).toHaveBeenCalledOnce();
    const { resolve } = registerHooks.mock.calls[0][0];
    const nextResolve = vi.fn();
    expect(resolve("./lib.js", { parentURL }, nextResolve)).toEqual({
      url: sourceURL,
      shortCircuit: true
    });
    expect(module._resolveFilename).not.toBe(next);
    expect(module._resolveFilename("./lib.js", parent, false)).toBe(fileURLToPath(sourceURL));
    expect(nextResolve).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("applies custom filesystem and skip options to both resolvers", () => {
    const isFile = vi.fn((url: string) => url.endsWith("/virtual.ts"));
    install({ isFile, skip: /\/vendor\// });

    const { resolve } = registerHooks.mock.calls[0][0];
    const nextResolve = vi.fn((specifier: string) => ({ url: `next:${specifier}` }));
    const virtualURL = new URL("./virtual.ts", parentURL).href;
    expect(resolve("./virtual.js", { parentURL }, nextResolve)).toEqual({
      url: virtualURL,
      shortCircuit: true
    });
    expect(module._resolveFilename("./virtual.js", parent, false)).toBe(fileURLToPath(virtualURL));

    isFile.mockClear();
    expect(resolve("./vendor/virtual.js", { parentURL }, nextResolve)).toEqual({
      url: "next:./vendor/virtual.js"
    });
    const receiver = {};
    const options = { paths: ["/custom"] };
    expect(module._resolveFilename.call(receiver, "./vendor/virtual.js", parent, true, options))
      .toBe("next:./vendor/virtual.js");
    expect(next).toHaveBeenCalledWith("./vendor/virtual.js", parent, true, options);
    expect(next.mock.contexts[0]).toBe(receiver);
    expect(isFile).not.toHaveBeenCalled();
  });

  it("installs working default resolvers when the register entry point is imported", async () => {
    await import("../../src/register.ts");

    expect(registerHooks).toHaveBeenCalledOnce();
    const { resolve } = registerHooks.mock.calls[0][0];
    expect(resolve("./lib.js", { parentURL }, vi.fn())).toEqual({
      url: sourceURL,
      shortCircuit: true
    });
    expect(module._resolveFilename("./lib.js", parent, false)).toBe(fileURLToPath(sourceURL));
  });
});
