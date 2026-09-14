import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  loadTokenModuleHandler,
  RenderContext,
  resolveTokenModulePath,
  TEMPLATE_DIR,
  TOKEN_HANDLER,
  TokenModule,
  tokenModuleDirectory,
  type TokenModuleFactory,
  type TokenModuleInstance,
  type TokenModuleLoader,
} from "../../src/runtime/index.js";

const fixturesDirectory = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/runtime");

async function loadFallback(factory: TokenModuleFactory): Promise<TokenModuleInstance> {
  const instance = await factory();
  if (!instance) throw new Error("expected fallback token instance");
  return instance;
}

describe("module-backed tokens", () => {
  it("recognizes factory IDs and both named-call property forms", async () => {
    const factory: TokenModuleFactory = () => ({ process: () => "factory" });
    const ordinary = new TokenModule(factory, 0);
    expect(ordinary.isModule).toBe(false);

    const stringCall = new TokenModule(
      "#./custom-call.js",
      0,
      { _call: "prepare" },
      fixturesDirectory,
    );
    await stringCall.load({ prefix: "string" });
    expect(stringCall[TOKEN_HANDLER]?.(new RenderContext({ value: "context" }))).toBe(
      "string:#./custom-call.js:context:undefined",
    );

    const arrayCall = new TokenModule(
      "#./custom-call.js",
      0,
      { _call: ["prepare"] },
      fixturesDirectory,
    );
    await arrayCall.load({ prefix: "array" });
    expect(arrayCall[TOKEN_HANDLER]?.(new RenderContext({ value: "context" }))).toBe(
      "array:#./custom-call.js:context:undefined",
    );
  });

  it("loads an asynchronous default factory relative to the template", async () => {
    const token = new TokenModule("require('./default-handler.js')", 2, {}, fixturesDirectory);
    await token.load({ value: "loaded" });

    expect(token.modPath).toBe("./default-handler.js");
    expect(token.isModule).toBe(true);
    expect(token.pos).toBe(2);
    expect(token[TEMPLATE_DIR]).toBe(fixturesDirectory);
    expect(token[TOKEN_HANDLER]?.(new RenderContext())).toBe("default:loaded");
  });

  it("loads a named tokenHandler export", async () => {
    const token = new TokenModule("#./named-handler.js", 0, {}, fixturesDirectory);
    await token.load();
    expect(token[TOKEN_HANDLER]?.(new RenderContext())).toBe("named");
  });

  it("calls a named setup export with options, token, and configured arguments", async () => {
    const token = new TokenModule(
      "#./custom-call.js",
      0,
      { _call: ["prepare", ["suffix"]] },
      fixturesDirectory,
    );
    await token.load({ prefix: "setup" });

    expect(token[TOKEN_HANDLER]?.(new RenderContext({ value: "context" }))).toBe(
      "setup:#./custom-call.js:context:suffix",
    );
  });

  it("accepts a null factory result as an intentionally disabled token", async () => {
    const token = new TokenModule("#./null-handler.js", 0, {}, fixturesDirectory);
    await token.load();
    expect(token.custom).toBeNull();
    expect(token[TOKEN_HANDLER]).toBeNull();
  });

  it("supports directly injected token factories", async () => {
    const token = new TokenModule("#injected", 0);
    token.tokenMod = () => ({ process: () => "injected" });
    await token.load();
    expect(token[TOKEN_HANDLER]?.(new RenderContext())).toBe("injected");
  });

  it("preserves injected factories and independent props when cloning", async () => {
    const token = new TokenModule(
      "#injected",
      0,
      { value: "source", [TEMPLATE_DIR]: fixturesDirectory },
      fixturesDirectory,
    );
    token.tokenMod = (_options, runtimeToken) => ({
      process: (_context, next) =>
        `${(runtimeToken as TokenModule).props.value}:${(next as TokenModule).pos}`,
    });
    const clone = token.clone(3, "/ignored");
    clone.props.value = "clone";
    await clone.load();

    expect(token.props.value).toBe("source");
    expect(clone.pos).toBe(3);
    expect(clone[TEMPLATE_DIR]).toBe(fixturesDirectory);
    expect(clone.wantsNext).toBe(true);
    expect(clone[TOKEN_HANDLER]?.(new RenderContext())).toBe("clone:3");
  });

  it("does not load ordinary token IDs", async () => {
    const token = new TokenModule("TITLE", 0);
    await token.load();
    expect(token.isModule).toBe(false);
    expect(token[TOKEN_HANDLER]).toBeNull();
  });

  it("keeps cache identity scoped to the resolved module path", async () => {
    const first = new TokenModule("#./shared-handler.js", 0, {}, join(fixturesDirectory, "a"));
    const second = new TokenModule("#./shared-handler.js", 0, {}, join(fixturesDirectory, "b"));
    await Promise.all([first.load(), second.load()]);
    expect(first[TOKEN_HANDLER]?.(new RenderContext())).toBe("from-a");
    expect(second[TOKEN_HANDLER]?.(new RenderContext())).toBe("from-b");
  });

  it("returns descriptive handlers for missing and failed modules", async () => {
    const missing = await loadTokenModuleHandler("./missing.js", fixturesDirectory);
    const broken = await loadTokenModuleHandler("./broken-handler.js", fixturesDirectory);
    const missingInstance = await loadFallback(missing as TokenModuleFactory);
    const brokenInstance = await loadFallback(broken as TokenModuleFactory);
    expect(missingInstance.process(new RenderContext())).toContain("not found");
    expect(brokenInstance.process(new RenderContext())).toContain("failed to load");

    const typeError = await loadTokenModuleHandler("./type-error-handler.js", fixturesDirectory);
    const typeErrorInstance = await loadFallback(typeError as TokenModuleFactory);
    expect(typeErrorInstance.process(new RenderContext())).toContain("failed to load");
  });

  it("rejects modules without a supported export", async () => {
    await expect(loadTokenModuleHandler("./invalid-handler.js", fixturesDirectory)).rejects.toThrow(
      "token module invalid",
    );
  });

  it("reports malformed injected loaders and instances", async () => {
    const missingCall = new TokenModule("#injected", 0, { _call: "missing" });
    missingCall.tokenMod = {};
    await expect(missingCall.load()).rejects.toThrow("'missing' not found");

    const noFactory = new TokenModule("#injected", 0);
    noFactory.tokenMod = {};
    await expect(noFactory.load()).rejects.toThrow("has no factory");

    for (const instance of [undefined, {}, { process: "invalid" }]) {
      const malformed = new TokenModule("#injected", 0);
      malformed.tokenMod = (() => instance) as unknown as TokenModuleLoader;
      await expect(malformed.load()).rejects.toThrow("doesn't have process method");
    }
  });

  it("resolves file URLs and exposes the module directory helper", () => {
    const fixtureUrl = new URL("../fixtures/runtime/default-handler.js", import.meta.url);
    expect(resolveTokenModulePath(fixtureUrl.href)).toBe(fileURLToPath(fixtureUrl));
    expect(tokenModuleDirectory(import.meta.url)).toBe(dirname(fileURLToPath(import.meta.url)));
  });
});
