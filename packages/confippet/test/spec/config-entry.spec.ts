import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { composedResult } from "../composed-result.js";

const ENV_KEYS = ["NODE_CONFIG_DIR", "NODE_APP_INSTANCE", "NODE_ENV", "NODE_CONFIG"];
const saved: Record<string, string | undefined> = {};

beforeAll(() => {
  ENV_KEYS.forEach(k => (saved[k] = process.env[k]));
  ENV_KEYS.forEach(k => delete process.env[k]);
  // the subpath entry composes at import time, so the env must be set first
  process.env["NODE_CONFIG_DIR"] = "test/config";
  process.env["NODE_APP_INSTANCE"] = "0";
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterAll(() => {
  vi.restoreAllMocks();
  ENV_KEYS.forEach(k => delete process.env[k]);
  for (const k of ENV_KEYS) {
    if (saved[k] !== undefined) process.env[k] = saved[k];
  }
});

describe("the ./config subpath entry", () => {
  it("composes the preset config from the environment on import", async () => {
    const mod = await import("../../src/config.js");
    expect({ ...mod.config }).toEqual(composedResult());
    expect(mod.default).toBe(mod.config);
  });

  it("is the same store the main export's config getter returns", async () => {
    const mod = await import("../../src/config.js");
    const Confippet = (await import("../../src/index.js")).default;
    expect(Confippet.config).toBe(mod.config);
  });
});
