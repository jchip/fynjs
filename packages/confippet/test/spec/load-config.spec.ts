import Path from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { loadConfig } from "../../src/load-config.js";

const CACHED_SYMBOL = "Symbol(confippet loadConfig cached config)";
const CONFIG1 = Path.join(import.meta.dirname, "../config1");

// NODE_ENV wins over an explicit `context.deployment`, and the test runner sets
// it to "test" - for which config1 has no partial
const savedNodeEnv = process.env["NODE_ENV"];
beforeAll(() => {
  delete process.env["NODE_ENV"];
});
afterAll(() => {
  if (savedNodeEnv !== undefined) process.env["NODE_ENV"] = savedNodeEnv;
});

describe("confippet loadConfig", () => {
  it("should compose config from directory", () => {
    const config: any = loadConfig(
      {
        dir: CONFIG1,
        context: { deployment: "default" }
      },
      { foo: "bar" }
    );

    expect(config).toHaveProperty("foo");
    expect(config.js).toBe("1");
  });

  it("should hand back cached config", () => {
    const config: any = loadConfig(
      {
        dir: CONFIG1,
        context: { deployment: "default" }
      },
      { foo: "bar2" }
    );

    const symbols = Object.getOwnPropertySymbols(config).map(x => x.toString());
    expect(symbols).toContain(CACHED_SYMBOL);
    // the cached copy keeps the defaults from the first load
    expect(config.foo).toBe("bar");
    expect(config.js).toBe("1");
  });

  it("should reload cached config", () => {
    const config: any = loadConfig(
      {
        dir: CONFIG1,
        context: { deployment: "default" }
      },
      { foo: "bar2" },
      true
    );
    expect(config.foo).toBe("bar2");
  });

  it("should allow loading new copy w/o cache", () => {
    const config: any = loadConfig(
      {
        dir: CONFIG1,
        context: { deployment: "default" },
        cache: false
      },
      { foo: "bar3" }
    );
    const symbols = Object.getOwnPropertySymbols(config).map(x => x.toString());
    expect(symbols).not.toContain(CACHED_SYMBOL);
    expect(config.foo).toBe("bar3");
  });

  it("should load config from transpiled ES modules", () => {
    const config: any = loadConfig(
      {
        dir: Path.join(import.meta.dirname, "../esm-config"),
        context: { deployment: "test" }
      },
      { foo: "bar2" }
    );
    expect(config.esm).toBe(true);
    expect(config.test).toBe("test");
    // __esModule flag should've been hidden
    expect(Object.keys(config)).not.toContain("__esModule");
  });

  it("should load config from native ES modules", () => {
    const config: any = loadConfig({
      dir: Path.join(import.meta.dirname, "../native-esm-config"),
      context: { deployment: "test" }
    });
    // default.js has a default export, so that is the partial
    expect(config.native).toBe("esm");
    // test.js has no default export, so the whole namespace is the partial
    expect(config.named).toBe("no-default");
    expect(Object.keys(config)).not.toContain("__esModule");
  });
});
