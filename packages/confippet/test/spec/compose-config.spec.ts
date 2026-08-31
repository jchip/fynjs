import Path from "path";
import { describe, it, expect, vi, afterEach } from "vitest";
import Confippet from "../../src/index.js";
import providerTypes from "../../src/provider-types.js";
import util from "../../src/util.js";
import { composedResult } from "../composed-result.js";

const CONFIG_DIR = Path.join(import.meta.dirname, "../config");
const DATA_DIR = Path.join(import.meta.dirname, "../data");

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.CONFIPPET_0;
  delete process.env.NODE_CONFIG;
});

describe("confippet composeConfig", () => {
  it("should compose config from directory", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = util.merge(
      {
        foo: { bar: "env" },
        node: { config: "xyz" }
      },
      composedResult()
    );

    process.env.CONFIPPET_0 = JSON.stringify({ foo: { bar: "env" } });
    process.env.NODE_CONFIG = JSON.stringify({ node: { config: "xyz" } });

    const data = Confippet.composeConfig({
      dir: CONFIG_DIR,
      verbose: true,
      providers: {
        env: { type: providerTypes.required }
      },
      context: { instance: "0" }
    });

    const env = data.env;
    delete data.env;

    expect(data).toEqual(result);
    expect(env).toEqual(process.env);

    const composeLogs = log.mock.calls.filter(c => String(c[0]).startsWith("Confippet.compose:"));
    expect(composeLogs.length).toBeGreaterThan(0);
  });

  it("should compose extensions according to extSearch", () => {
    const data = Confippet.composeConfig({
      dir: CONFIG_DIR,
      extSearch: ["js", "json", "yaml"],
      context: { instance: "0" }
    });
    expect(data.js).toBe("yaml");
  });

  it("should not fail required when requested not to", () => {
    process.env.CONFIPPET_0 = JSON.stringify({ foo: { bar: "env" } });
    const data = Confippet.composeConfig({
      dir: DATA_DIR,
      failMissing: false
    });
    expect(data.foo.bar).toBe("env");
  });

  it("should warn if warn provider missing", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    Confippet.composeConfig({
      dir: CONFIG_DIR,
      warnMissing: true,
      context: { instance: "0" }
    });
    const warns = err.mock.calls.filter(c => String(c[0]).startsWith("WARNING:"));
    expect(warns.length).toBeGreaterThan(0);
  });

  it("should not warn if requested not to", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    Confippet.composeConfig({
      dir: CONFIG_DIR,
      warnMissing: false,
      context: { instance: "0" }
    });
    const warns = err.mock.calls.filter(c => String(c[0]).startsWith("WARNING:"));
    expect(warns.length).toBe(0);
  });

  it("should throw when no config can be found", () => {
    expect(() => Confippet.composeConfig()).toThrow(Error);
  });

  it("should throw when no config provided", () => {
    expect(() => Confippet.composeConfig({ useDefaults: false })).toThrow(Error);
  });

  it("should throw when provider type missing", () => {
    expect(() =>
      Confippet.composeConfig({
        failMissing: false,
        warnMissing: false,
        providers: {
          a: { handler: () => undefined }
        }
      })
    ).toThrow(Error);
  });

  it("should throw when providers resolve to empty", () => {
    expect(() =>
      Confippet.composeConfig({
        failMissing: false,
        warnMissing: false,
        providerList: []
      })
    ).toThrow(Error);
  });

  it("should turn off all default providers by flag", () => {
    expect(() =>
      Confippet.composeConfig({
        failMissing: false,
        warnMissing: false,
        context: { defaultFilter: "" }
      })
    ).toThrow(Error);
  });

  it("should turn all default required to optional by flag", () => {
    expect(() =>
      Confippet.composeConfig({
        warnMissing: false,
        context: { defaultType: providerTypes.optional }
      })
    ).not.toThrow();
  });

  it("should call provider w/o order as -1", () => {
    let bCalled = false;
    let cCalled = false;

    Confippet.composeConfig({
      failMissing: false,
      warnMissing: false,
      providerList: ["a", "b", "c", "e"],
      providers: {
        c: {
          type: providerTypes.required,
          handler: () => {
            cCalled = true;
          },
          order: "-2"
        },
        b: {
          type: providerTypes.required,
          handler: () => {
            expect(cCalled).toBe(true);
            bCalled = true;
          },
          filter: "enabled",
          order: 0
        },
        a: {
          type: providerTypes.required,
          handler: () => {
            expect(bCalled).toBe(false);
          }
        },
        d: {
          type: providerTypes.required,
          handler: () => {
            throw new Error("not expect provider d to be called");
          }
        },
        e: {
          type: providerTypes.required,
          handler: () => {
            throw new Error("not expect provider e to be called");
          },
          filter: false
        }
      }
    });
  });

  it("should throw when a searched extension has no handler", () => {
    expect(() =>
      Confippet.composeConfig({
        dir: CONFIG_DIR,
        extSearch: ["yaml"],
        // extHandlers merges over the defaults, so blank the entry rather than
        // passing an empty object
        extHandlers: { yaml: false },
        failMissing: false,
        warnMissing: false,
        context: { instance: "0" }
      })
    ).toThrow(/Config handler for extension yaml missing/);
  });

  it("custom extHandlers must not leak into the shared defaults", () => {
    // lodash merges in place, so defaultOpts() must hand out its own copy
    expect(() =>
      Confippet.composeConfig({
        dir: CONFIG_DIR,
        extSearch: ["yaml"],
        extHandlers: { yaml: false },
        failMissing: false,
        warnMissing: false,
        context: { instance: "0" }
      })
    ).toThrow(/Config handler for extension yaml missing/);

    // the very next compose, with no custom handlers, must still work
    const data = Confippet.composeConfig({
      dir: CONFIG_DIR,
      warnMissing: false,
      context: { instance: "0" }
    });
    expect(data.yaml).toBe("yaml");
    expect(Confippet.extHandlers.yaml).toBeTypeOf("function");
  });

  it("should compose from multiple dirs in order", () => {
    const data = Confippet.composeConfig({
      dirs: [CONFIG_DIR, Path.join(import.meta.dirname, "../config1")],
      warnMissing: false,
      context: { instance: "0", deployment: "production" }
    });
    expect(data.default1).toBe("json");
    expect(data.deployment1).toBe("production");
    // config1 wins for keys both dirs define
    expect(data.js).toBe("1");
  });
});
