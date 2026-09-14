import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  loadTokenModuleHandler,
  RenderContext,
  TEMPLATE_DIR,
  TOKEN_HANDLER,
  TokenModule,
  type TokenModuleFactory,
  type TokenModuleInstance,
} from "../../src/runtime/index.js";

const fixturesDirectory = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/runtime");

async function loadFallback(factory: TokenModuleFactory): Promise<TokenModuleInstance> {
  const instance = await factory();
  if (!instance) throw new Error("expected fallback token instance");
  return instance;
}

describe("module-backed tokens", () => {
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
  });

  it("rejects modules without a supported export", async () => {
    await expect(loadTokenModuleHandler("./invalid-handler.js", fixturesDirectory)).rejects.toThrow(
      "token module invalid",
    );
  });
});
