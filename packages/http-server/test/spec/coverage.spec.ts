import { afterEach, describe, expect, it, vi } from "vitest";
import { httpServer } from "../../src/http-server.js";
import { convertPluginsToArray } from "../../src/load-plugins.js";
import type { FynHttpServerInstance } from "../../src/types.js";

let server: FynHttpServerInstance | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  if (server) {
    await server.close();
    server = undefined;
  }
});

const captureStartFailure = async (config: any): Promise<any> => {
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
  return httpServer({ connection: { port: 0 }, ...config }).catch(error => error);
};

describe("HTTP server coverage boundaries", () => {
  it("wraps a non-Error callback failure for a named module", async () => {
    const error = await captureStartFailure({
      plugins: {
        rawFailure: {
          module: "virtual-plugin",
          register: (_instance: any, _options: any, done: any) => done("raw failure")
        }
      }
    });

    expect(error.code).toBe("XPLUGIN_FAILED");
    expect(error.message).toContain("raw failure");
    expect(error.method).toBe("with module '\"virtual-plugin\"'");
  });

  it("explains an Avvio callback timeout", async () => {
    const timeout = Object.assign(new Error("original timeout"), {
      code: "ERR_AVVIO_PLUGIN_TIMEOUT"
    });
    const error = await captureStartFailure({
      plugins: {
        timedOut: {
          register: (_instance: any, _options: any, done: any) => done(timeout)
        }
      }
    });

    expect(error.code).toBe("XPLUGIN_FAILED");
    expect(error.message).toContain("did you return a resolved promise");
  });

  it("routes a synchronous callback-plugin throw through startup failure", async () => {
    const error = await captureStartFailure({
      plugins: {
        throws: {
          register: (_instance: any, _options: any, _done: any) => {
            throw new Error("callback throw");
          }
        }
      }
    });

    expect(error.code).toBe("XPLUGIN_FAILED");
    expect(error.message).toContain("callback throw");
  });

  it("ignores a second callback completion", async () => {
    server = await httpServer({
      connection: { port: 0 },
      plugins: {
        twice: {
          register: (_instance: any, _options: any, done: any) => {
            done();
            done(new Error("too late"));
          }
        }
      }
    });

    expect(server.info.port).toBeGreaterThan(0);
  });

  it("closes a listening server after a late lifecycle failure", async () => {
    let created: FynHttpServerInstance | undefined;
    const error = await captureStartFailure({
      listener: (emitter: any) => {
        emitter.on("server-created", (context: any, next: any) => {
          created = context.server;
          next();
        });
        emitter.on("server-started", (_context: any, next: any) => {
          next(new Error("late failure"));
        });
      }
    });

    expect(error.code).toBe("XEVENT_FAILED");
    expect(created!.server.address()).toBeNull();
  });

  it("attributes an unowned Fastify timeout to an unknown plugin", async () => {
    const error = await captureStartFailure({
      server: { pluginTimeout: 20 },
      listener: (emitter: any) => {
        emitter.on("server-created", (context: any, next: any) => {
          context.server.register(
            (_instance: any, _options: any, _done: any) => undefined
          );
          next();
        });
      }
    });

    expect(error.code).toBe("XPLUGIN_FAILED");
    expect(error.plugin.__name).toBe("unknown");
  });
});

describe("plugin resolution coverage boundaries", () => {
  it("loads a bare package without a require path", async () => {
    const plugins = await convertPluginsToArray({
      packagePlugin: { module: "fastify-plugin" }
    });

    expect(plugins[0].requireFromPath).toBe("");
    expect(typeof plugins[0].register).toBe("function");
  });

  it("resolves a relative module without a require path", async () => {
    const plugins = await convertPluginsToArray({
      relativePlugin: { module: "./test/fixtures/plugin-plugin-field.cjs" }
    });

    expect(plugins[0].requireFromPath).toBe("");
    expect(typeof plugins[0].register).toBe("function");
  });

  it("reports a missing relative module without a require path", async () => {
    await expect(
      convertPluginsToArray({
        missing: { module: "./test/fixtures/no-such-module.cjs" }
      })
    ).rejects.toThrow("Failed loading module ./test/fixtures/no-such-module.cjs");
  });
});

describe("default config coverage boundaries", () => {
  it("reads APP_SERVER_PORT when it is set", async () => {
    const original = process.env.APP_SERVER_PORT;

    try {
      process.env.APP_SERVER_PORT = "4321";
      vi.resetModules();
      const { default: config } = await import("../../src/config/default.js");
      expect(config.connection.port).toBe(4321);
    } finally {
      if (original === undefined) {
        delete process.env.APP_SERVER_PORT;
      } else {
        process.env.APP_SERVER_PORT = original;
      }
    }
  });
});
