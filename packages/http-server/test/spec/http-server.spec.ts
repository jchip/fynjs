import Path from "path";
import { describe, it, expect, afterEach } from "vitest";
import { httpServer, electrodeServer } from "../../src/http-server.js";
import type { FynHttpServerInstance } from "../../src/types.js";

const FIXTURES = Path.join(import.meta.dirname, "..", "fixtures");

let server: FynHttpServerInstance | undefined;

/** every test starts on port 0 so they can run without fighting over a port */
const start = async (config: any = {}, decors?: any) => {
  server = await httpServer({ connection: { port: 0 }, ...config }, decors);
  return server;
};

afterEach(async () => {
  if (server) {
    await server.close();
    server = undefined;
  }
});

describe("httpServer", () => {
  it("starts a listening server and reports its address through server.info", async () => {
    await start();
    expect(server!.info.port).toBeGreaterThan(0);
    expect(server!.info.address).toBe("0.0.0.0");
  });

  it("serves a route added before start", async () => {
    await start({
      plugins: {
        hello: {
          register: (s: any, opts: any, next: any) => {
            s.get("/hello", async () => ({ hello: "world" }));
            next();
          }
        }
      }
    });

    const res = await fetch(`http://localhost:${server!.info.port}/hello`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hello: "world" });
  });

  it("exposes the composed config on server.app and server.settings", async () => {
    await start({ electrode: { marker: "abc" } });
    expect(server!.app.config.electrode.marker).toBe("abc");
    expect((server as any).settings.app.config).toBe(server!.app.config);
    expect((server as any).settings.app.fynHttpServer).toBe(true);
  });

  it("decorates request with path, info.remoteAddress and app", async () => {
    let seen: any;
    await start({
      plugins: {
        probe: {
          register: (s: any, opts: any, next: any) => {
            s.get("/probe", async (request: any) => {
              seen = {
                path: request.path,
                remoteAddress: request.info.remoteAddress,
                config: request.app.config
              };
              // second read exercises the memoized branch
              expect(request.path).toBe(seen.path);
              expect(request.info.remoteAddress).toBe(seen.remoteAddress);
              expect(request.app.config).toBe(seen.config);
              return { ok: true };
            });
            next();
          }
        }
      }
    });

    await fetch(`http://localhost:${server!.info.port}/probe?query=1`);

    expect(seen.path).toBe("/probe");
    expect(seen.remoteAddress).toBeTruthy();
    expect(seen.config).toBe(server!.app.config);
  });

  it("passes config.server through to fastify verbatim", async () => {
    await start({ server: { bodyLimit: 12345 } });
    expect((server as any).initialConfig.bodyLimit).toBe(12345);
  });

  it("uses the default keepAliveTimeout, and honors an override", async () => {
    await start();
    expect(server!.server.keepAliveTimeout).toBe(60000);
    await server!.close();

    server = await httpServer({
      connection: { port: 0 },
      electrode: { keepAliveTimeout: 1234 }
    });
    expect(server.server.keepAliveTimeout).toBe(1234);
  });

  it("honors a top level keepAliveTimeout over the electrode one", async () => {
    server = await httpServer({
      connection: { port: 0 },
      keepAliveTimeout: 4321,
      electrode: { keepAliveTimeout: 1234 }
    } as any);
    expect(server.server.keepAliveTimeout).toBe(4321);
  });

  it("is exported under the electrodeServer alias", () => {
    expect(electrodeServer).toBe(httpServer);
  });

  describe("deferStart", () => {
    it("does not listen until start is called", async () => {
      server = await httpServer({ connection: { port: 0 }, deferStart: true });
      expect(server.server.address()).toBeNull();

      await server.start();
      expect(server.info.port).toBeGreaterThan(0);
    });

    it("lets routes be added between create and start", async () => {
      server = await httpServer({ connection: { port: 0 }, deferStart: true });
      server.get("/late", async () => ({ late: true }));
      await server.start();

      const res = await fetch(`http://localhost:${server.info.port}/late`);
      expect(await res.json()).toEqual({ late: true });
    });
  });

  describe("events", () => {
    it("emits the lifecycle events in order", async () => {
      const events: string[] = [];
      await start({
        listener: (emitter: any) => {
          for (const name of [
            "config-composed",
            "server-created",
            "plugins-sorted",
            "plugins-registered",
            "server-started",
            "complete"
          ]) {
            emitter.on(name, (ctx: any, next: any) => {
              events.push(name);
              next();
            });
          }
        }
      });

      expect(events).toEqual([
        "config-composed",
        "server-created",
        "plugins-sorted",
        "plugins-registered",
        "server-started",
        "complete"
      ]);
    });

    it("gives the handler a context carrying config and server", async () => {
      // the context is one object mutated as startup progresses, so each
      // handler has to be sampled at the moment it runs
      let portAtCompose: any;
      let serverAtCompose: any;
      let serverAtCreated: any;
      await start({
        listener: (emitter: any) => {
          emitter.on("config-composed", (ctx: any, next: any) => {
            portAtCompose = ctx.config.connection.port;
            serverAtCompose = ctx.server;
            next();
          });
          emitter.on("server-created", (ctx: any, next: any) => {
            serverAtCreated = ctx.server;
            next();
          });
        }
      });

      expect(portAtCompose).toBe(0);
      expect(serverAtCompose).toBeUndefined();
      expect(serverAtCreated).toBe(server);
    });

    it("fails startup with XEVENT_FAILED when a handler errors", async () => {
      const err = await httpServer({
        connection: { port: 0 },
        listener: (emitter: any) => {
          emitter.on("config-composed", (ctx: any, next: any) => next(new Error("handler boom")));
        }
      }).catch(e => e);

      expect(err.code).toBe("XEVENT_FAILED");
      expect(err.event).toBe("config-composed");
      expect(err.message).toContain("handler boom");
      expect(err.moreInfo.reason).toContain("config-composed");
    });

    it("fails startup with XEVENT_TIMEOUT when a handler never completes", async () => {
      const err = await httpServer({
        connection: { port: 0 },
        electrode: { eventTimeout: 50 },
        listener: (emitter: any) => {
          emitter.on("config-composed", () => undefined);
        }
      }).catch(e => e);

      expect(err.code).toBe("XEVENT_TIMEOUT");
      expect(err.event).toBe("config-composed");
      expect(err.timeout).toBe(50);
      expect(err.message).toContain("timeout waiting for event");
    });

    it("does not time out when eventTimeout is zero", async () => {
      await start({
        electrode: { eventTimeout: 0 },
        listener: (emitter: any) => {
          emitter.on("config-composed", (ctx: any, next: any) => setTimeout(next, 30));
        }
      });
      expect(server!.info.port).toBeGreaterThan(0);
    });
  });

  describe("decors", () => {
    it("applies a decor object", async () => {
      await start({}, { electrode: { fromDecor: true } });
      expect(server!.app.config.electrode.fromDecor).toBe(true);
    });

    it("calls a decor given as a function", async () => {
      await start({}, () => ({ electrode: { fromDecorFn: true } }));
      expect(server!.app.config.electrode.fromDecorFn).toBe(true);
    });

    it("applies an array of decors in order, appConfig winning", async () => {
      await start({ electrode: { who: "app" } }, [
        { electrode: { who: "first", onlyFirst: true } },
        null,
        { electrode: { who: "second" } }
      ]);
      expect(server!.app.config.electrode.who).toBe("app");
      expect(server!.app.config.electrode.onlyFirst).toBe(true);
    });

    it("registers event listeners from a decor", async () => {
      const events: string[] = [];
      await start({}, {
        listener: (emitter: any) => {
          emitter.on("complete", (ctx: any, next: any) => {
            events.push("decor-complete");
            next();
          });
        }
      });
      expect(events).toEqual(["decor-complete"]);
    });
  });

  describe("plugins", () => {
    it("registers plugins in priority order, lower first", async () => {
      const order: string[] = [];
      const mark = (name: string) => (s: any, opts: any, next: any) => {
        order.push(name);
        next();
      };

      await start({
        plugins: {
          last: { priority: 300, register: mark("last") },
          first: { priority: 100, register: mark("first") },
          middle: { priority: 200, register: mark("middle") },
          unranked: { register: mark("unranked") }
        }
      });

      expect(order).toEqual(["first", "middle", "last", "unranked"]);
    });

    it("accepts a priority given as a numeric string", async () => {
      const order: string[] = [];
      const mark = (name: string) => (s: any, opts: any, next: any) => {
        order.push(name);
        next();
      };

      await start({
        plugins: {
          b: { priority: "20", register: mark("b") },
          a: { priority: "10", register: mark("a") }
        }
      });

      expect(order).toEqual(["a", "b"]);
    });

    it("skips a plugin with enable false", async () => {
      const order: string[] = [];
      await start({
        plugins: {
          on: {
            register: (s: any, o: any, next: any) => {
              order.push("on");
              next();
            }
          },
          off: {
            enable: false,
            register: (s: any, o: any, next: any) => {
              order.push("off");
              next();
            }
          }
        }
      });
      expect(order).toEqual(["on"]);
    });

    it("passes options to the plugin's register", async () => {
      let seen: any;
      await start({
        plugins: {
          opts: {
            options: { marker: "passed" },
            register: (s: any, o: any, next: any) => {
              seen = o;
              next();
            }
          }
        }
      });
      expect(seen.marker).toBe("passed");
    });

    it("makes a plugin's decorations visible on the server", async () => {
      await start({
        plugins: {
          decorator: {
            register: (s: any, o: any, next: any) => {
              s.decorate("addedByPlugin", 42);
              next();
            }
          }
        }
      });
      expect((server as any).addedByPlugin).toBe(42);
    });

    it("loads a plugin module from requireFromPath", async () => {
      await start({
        plugins: {
          requireFromPath: FIXTURES,
          "./plugin-plugin-field.cjs": {}
        }
      });
      expect((server as any).fromPluginField).toBe(true);
    });

    it("finds the register on each supported export field", async () => {
      await start({
        plugins: {
          requireFromPath: FIXTURES,
          fromFastifyPlugin: { module: "./plugin-fastify-plugin.cjs", options: { marker: "fp" } },
          fromPlugin: { module: "./plugin-plugin-field.cjs" },
          fromDefault: { module: "./plugin-default-field.cjs" },
          fromModule: { module: "./plugin-module-itself.cjs" }
        }
      });

      expect((server as any).fromFastifyPluginField).toBe("fp");
      expect((server as any).fromPluginField).toBe(true);
      expect((server as any).fromDefaultField).toBe(true);
      expect((server as any).fromModuleItself).toBe(true);
    });

    it("accepts module given as an object with its own requireFromPath", async () => {
      await start({
        plugins: {
          viaObject: {
            module: { name: "./plugin-plugin-field.cjs", requireFromPath: FIXTURES }
          }
        }
      });
      expect((server as any).fromPluginField).toBe(true);
    });

    it("fails when a plugin module cannot be loaded", async () => {
      const err = await httpServer({
        connection: { port: 0 },
        plugins: { missing: { module: "./no-such-module.cjs", requireFromPath: FIXTURES } }
      }).catch(e => e);

      expect(err.message).toContain("Failed loading module ./no-such-module.cjs");
    });

    it("fails when a plugin's register is not a function", async () => {
      const err = await httpServer({
        connection: { port: 0 },
        plugins: {
          bad: { module: "./plugin-not-a-function.cjs", requireFromPath: FIXTURES }
        }
      }).catch(e => e);

      expect(err.message).toContain("register of plugin is not a function");
    });

    it("fails when module is false and no register is given", async () => {
      const err = await httpServer({
        connection: { port: 0 },
        plugins: { orphan: { module: false } }
      }).catch(e => e);

      expect(err.message).toContain("disable 'module' but has no 'register' field");
    });

    it("fails when a module object has no name", async () => {
      const err = await httpServer({
        connection: { port: 0 },
        plugins: { nameless: { module: {} } }
      } as any).catch(e => e);

      expect(err.message).toContain("'module' must have 'name' field");
    });

    it("fails when module.requireFromPath is not a string", async () => {
      const err = await httpServer({
        connection: { port: 0 },
        plugins: { bad: { module: { name: "x", requireFromPath: 123 } } }
      } as any).catch(e => e);

      expect(err.message).toContain("'module.requireFromPath' must be a string");
    });

    it("fails when plugins.requireFromPath is not a string", async () => {
      const err = await httpServer({
        connection: { port: 0 },
        plugins: { requireFromPath: 123 }
      } as any).catch(e => e);

      expect(err.message).toContain("config.plugins.requireFromPath must be a string");
    });

    it("reports XPLUGIN_FAILED when a plugin's register throws", async () => {
      const err = await httpServer({
        connection: { port: 0 },
        plugins: {
          exploding: {
            register: () => {
              throw new Error("plugin boom");
            }
          }
        }
      }).catch(e => e);

      expect(err.code).toBe("XPLUGIN_FAILED");
      expect(err.plugin.__name).toBe("exploding");
      expect(err.method).toBe("with register function");
      expect(err.message).toContain("plugin boom");
    });

    it("supports an async plugin that returns a promise instead of calling next", async () => {
      await start({
        plugins: {
          asyncPlugin: {
            register: async (s: any) => {
              await new Promise(resolve => setTimeout(resolve, 5));
              s.decorate("fromAsyncPlugin", true);
            }
          }
        }
      });
      expect((server as any).fromAsyncPlugin).toBe(true);
    });

    it("attributes a rejection from an async plugin", async () => {
      const err = await httpServer({
        connection: { port: 0 },
        plugins: {
          asyncBoom: {
            register: async () => {
              throw new Error("async plugin boom");
            }
          }
        }
      }).catch(e => e);

      expect(err.code).toBe("XPLUGIN_FAILED");
      expect(err.plugin.__name).toBe("asyncBoom");
      expect(err.message).toContain("async plugin boom");
    });

    it("attributes a plugin that never finishes", async () => {
      const err = await httpServer({
        connection: { port: 0 },
        server: { pluginTimeout: 100 },
        plugins: {
          neverFinishes: {
            // arity 3 puts it on the callback path, and it never calls done
            register: (s: any, o: any, done: any) => undefined
          }
        }
      }).catch(e => e);

      expect(err.code).toBe("XPLUGIN_FAILED");
      expect(err.plugin.__name).toBe("neverFinishes");
      expect(err.method).toBe("with register function");
    });

    it("names the module in the failure message for a module plugin", async () => {
      const err = await httpServer({
        connection: { port: 0 },
        plugins: {
          exploding: {
            module: "./plugin-plugin-field.cjs",
            requireFromPath: FIXTURES,
            register: (s: any, o: any, next: any) => next(new Error("module plugin boom"))
          }
        }
      }).catch(e => e);

      expect(err.code).toBe("XPLUGIN_FAILED");
      expect(err.method).toContain("with module '\"./plugin-plugin-field.cjs\"'");
    });
  });

  describe("start failures", () => {
    it("reports EADDRINUSE against an occupied port", async () => {
      await start();
      const port = server!.info.port;

      const err = await httpServer({ connection: { port } }).catch(e => e);

      expect(err.code).toBe("EADDRINUSE");
      expect(err.message).toContain("already in use");
      expect(err.moreInfo.resolution).toContain(`lsof -i :${port}`);
    });
  });
});
