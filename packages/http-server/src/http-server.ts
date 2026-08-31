import fastify from "fastify";
import type { FastifyListenOptions } from "fastify";
import { runTimeout, TimeoutError } from "xaa";
import { AsyncEventEmitter } from "./async-event-emitter.js";
import { checkNodeEnv } from "./check-node-env.js";
import { composeConfig, merge } from "./compose-config.js";
import { convertPluginsToArray } from "./load-plugins.js";
import { startFailed } from "./start-failed.js";
import type { FynHttpServerConfig, FynHttpServerInstance } from "./types.js";

const DEFAULT_KEEPALIVE_TIMEOUT = 60000;
const DEFAULT_EVENT_TIMEOUT = 10000;

/**
 * Emit a lifecycle event and wait for every handler to finish.
 *
 * A handler that neither calls `next` nor settles its promise would hang
 * startup forever, so the wait is bounded by `config.electrode.eventTimeout`.
 * Both failure modes are re-thrown with a code `startFailed` knows how to
 * explain.
 */
async function emitEvent(context: any, event: string): Promise<void> {
  const timeout = context?.config?.electrode?.eventTimeout ?? DEFAULT_EVENT_TIMEOUT;

  if (context.emitter.listenerCount(event) === 0) {
    return;
  }

  let promise: Promise<void> = new Promise((resolve, reject) => {
    context.emitter.emit(event, context, (err: any) => (err ? reject(err) : resolve()));
  });

  if (Number.isInteger(timeout) && timeout > 0) {
    promise = runTimeout(promise, timeout);
  }

  try {
    await promise;
  } catch (error: any) {
    const err: any = error;
    err.timeout = timeout;
    err.event = event;
    if (error instanceof TimeoutError) {
      err.message = `timeout waiting for event '${event}' handler`;
      err.code = "XEVENT_TIMEOUT";
    } else {
      err.message = `event '${event}' handler failed: ${err.message}`;
      err.code = "XEVENT_FAILED";
    }
    throw err;
  }
}

/**
 * Register the plugins, wire up `server.start`, and - unless the caller asked to
 * defer - listen.
 */
async function startHttpServer(context: any): Promise<FynHttpServerInstance> {
  const server = context.server as FynHttpServerInstance;
  const config = context.config;
  let started = false;

  const errorRegisterMessage = (plg: any) => {
    if (plg.module) {
      const fromPath = plg.requireFromPath ? ` from path: '${plg.requireFromPath}'` : "";
      return `with module '${JSON.stringify(plg.module)}'${fromPath}`;
    }
    return `with register function`;
  };

  const regFail = (err: any, plugin: any) => {
    let err2 = err;
    if (!err || !Object.prototype.hasOwnProperty.call(err, "message")) {
      err2 = new Error(err);
    } else if (err.code === "ERR_AVVIO_PLUGIN_TIMEOUT") {
      err2.message = `plugin '${plugin.__name}' with register function timeout \
- did you return a resolved promise?`;
    }
    err2.code = "XPLUGIN_FAILED";
    err2.plugin = plugin;
    err2.method = errorRegisterMessage(plugin);
    return err2;
  };

  /**
   * Wrap a plugin's register so a failure can be attributed back to the plugin.
   *
   * A register that throws synchronously would otherwise escape avvio as an
   * uncaught exception and take the process down, so the throw is routed into
   * the callback (or the returned promise) where `ready()` can surface it.
   *
   * The wrapper has to preserve two things: the arity, because avvio dispatches
   * callback-style vs promise-style on `fn.length`, and the symbols
   * `fastify-plugin` stamped on the original - without those the plugin gets its
   * own encapsulation context and its decorations never reach the root server.
   */
  const guardRegister = (plugin: any) => {
    const orig = plugin.register;

    const guarded =
      orig.length >= 3
        ? function (this: any, instance: any, opts: any, done: any) {
            let settled = false;
            // tag whichever way the plugin reports failure - `done(err)` or a throw
            const guardedDone = (err?: any) => {
              if (settled) return;
              settled = true;
              plugin.__finished = true;
              done(err ? regFail(err, plugin) : undefined);
            };
            plugin.__started = true;
            try {
              return orig.call(this, instance, opts, guardedDone);
            } catch (err) {
              guardedDone(err);
              return undefined;
            }
          }
        : async function (this: any, instance: any, opts: any) {
            plugin.__started = true;
            try {
              return await orig.call(this, instance, opts);
            } catch (err) {
              throw regFail(err, plugin);
            } finally {
              plugin.__finished = true;
            }
          };

    for (const sym of Object.getOwnPropertySymbols(orig)) {
      (guarded as any)[sym] = orig[sym];
    }

    return guarded;
  };

  const handleFail = async (err: any) => {
    if (started) {
      await server.close();
    }
    return await startFailed(err);
  };

  /**
   * A plugin that never finishes is reported by fastify against the plugin's
   * source text rather than our descriptor, so re-tag it on the way out.
   *
   * Plugins register one at a time, so the one still started-but-not-finished is
   * the culprit - which beats pattern matching on the message.
   */
  const tagPluginTimeout = (err: any) => {
    if (
      err &&
      !err.plugin &&
      (err.code === "FST_ERR_PLUGIN_TIMEOUT" || err.code === "ERR_AVVIO_PLUGIN_TIMEOUT")
    ) {
      const stuck = context.plugins?.find((p: any) => p.__started && !p.__finished);
      return regFail(err, stuck || { __name: "unknown" });
    }
    return err;
  };

  const startServer = async (): Promise<void> => {
    try {
      //
      // all register calls are made up front in setupServer; ready() is what
      // actually executes them, and rejects if any one fails
      //
      await context.server.ready();
      await emitEvent(context, "plugins-registered");
      await server.listen({
        port: config.connection.port,
        host: config.connection.address
      } as FastifyListenOptions);
      started = true;
      await emitEvent(context, "server-started");
      await emitEvent(context, "complete");
    } catch (err) {
      await handleFail(tagPluginTimeout(err));
    }
  };

  const setupServer = async (): Promise<void> => {
    context.server.decorate("start", startServer);
    await emitEvent(context, "server-created");
    context.plugins = await convertPluginsToArray(config.plugins);
    await emitEvent(context, "plugins-sorted");
    for (const plugin of context.plugins) {
      server.register(guardRegister(plugin), plugin.options);
    }
  };

  try {
    await setupServer();
  } catch (err) {
    return await handleFail(err);
  }

  if (!context.config.deferStart) {
    await startServer();
  }

  return server;
}

/**
 * Build the options object handed to fastify.
 *
 * `config.server` passes through verbatim, `config.connection` is merged on top,
 * and the composed config is parked on `app` so it is reachable from the server
 * and from every request.
 */
function makeFastifyServerConfig(context: any): Record<string, any> {
  const config = context.config;
  const fastifyServerConfig: Record<string, any> = {
    app: {
      fynHttpServer: true
    },
    keepAliveTimeout:
      config.keepAliveTimeout ?? config.electrode?.keepAliveTimeout ?? DEFAULT_KEEPALIVE_TIMEOUT
  };

  merge(fastifyServerConfig, config.server);
  Object.assign(fastifyServerConfig, config.connection);

  //
  // This will allow Fastify to make config available through
  // server.settings.app.config
  //
  fastifyServerConfig.app.config = config;

  return fastifyServerConfig;
}

/**
 * Add the decorations that let Hapi-shaped code run unchanged on fastify:
 * `request.path`, `request.info`, `request.app`, `server.info`, `server.app`.
 */
function decorateServer(server: FynHttpServerInstance, context: any, settings: any): void {
  const SYM_PATH = Symbol("request.path");
  const SYM_INFO = Symbol("request.info");
  const SYM_APP = Symbol("request.app");
  const SERVER_SYM_INFO = Symbol("server.info");

  server.decorateRequest("path", {
    getter(this: any) {
      return this[SYM_PATH] || (this[SYM_PATH] = this.raw.url.match("^[^?]*")[0]);
    }
  });

  server.decorateRequest("info", {
    getter(this: any) {
      return this[SYM_INFO] || (this[SYM_INFO] = { remoteAddress: this.ip });
    }
  });

  // request.app, should be different for each request
  server.decorateRequest("app", {
    getter(this: any) {
      return this[SYM_APP] || (this[SYM_APP] = { config: context.config });
    }
  });

  //
  // server.info mimics Hapi, reading through to the live node server so it stays
  // correct after listening on port 0
  //
  server.decorate("info", {
    getter(this: any) {
      return (
        this[SERVER_SYM_INFO] ||
        (this[SERVER_SYM_INFO] = {
          get port() {
            const address = server.server.address() as any;
            return address && address.port;
          },
          get address() {
            const address = server.server.address() as any;
            return address && address.address;
          }
        })
      );
    }
  });

  server.decorate("settings", settings);
  server.decorate("app", { config: context.config });
}

/**
 * Create and start an HTTP server using fastify.
 *
 * @param appConfig - configuration, applied last so it wins over the internal
 *   defaults, the NODE_ENV overlay, and any `decors`
 * @param decors - extra config objects (or functions returning one) layered in
 *   before `appConfig`; each may also carry a `listener` to register event handlers
 *
 * @returns the fastify instance, listening unless `config.deferStart` is set
 */
export async function httpServer<TConfig = FynHttpServerConfig>(
  appConfig: TConfig = {} as TConfig,
  decors?: any
): Promise<FynHttpServerInstance> {
  checkNodeEnv();

  const decorList: any[] = (Array.isArray(decors) ? decors : [].concat(decors as any))
    .filter(Boolean)
    .map(x => (typeof x === "function" ? x() : x));

  const context: any = { emitter: new AsyncEventEmitter() };

  for (const d of decorList) {
    if (d.listener) {
      d.listener(context.emitter);
    }
  }
  if ((appConfig as any)?.listener) {
    (appConfig as any).listener(context.emitter);
  }

  context.config = composeConfig(appConfig, decorList);

  //
  // a failure this early has no server to close, but it still gets the same
  // diagnostics as any later one
  //
  try {
    await emitEvent(context, "config-composed");
  } catch (err) {
    return startFailed(err);
  }

  const settings = makeFastifyServerConfig(context);
  const server = (context.server = fastify(settings) as unknown as FynHttpServerInstance);

  decorateServer(server, context, settings);

  return startHttpServer(context);
}

/**
 * Drop-in alias for code written against `electrode-server` /
 * `@xarc/fastify-server`.
 */
export const electrodeServer = httpServer;

export { default as fastify } from "fastify";
