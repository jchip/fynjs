# @fynjs/http-server

A configurable [Fastify] web server for use in the fynjs monorepo's tests.

Private package. It mirrors the surface, API and features of [electrode-server]
and its Fastify variant [@xarc/fastify-server], so code written against either
drops in, but it is built on current Fastify and carries none of the legacy
dependency tree that got `electrode-server` removed from `packages/fyn` (it
hard-pins EOL `@hapi/hapi@18`, which has open advisories and no upstream fix).

## Usage

```js
import { httpServer } from "@fynjs/http-server";

const server = await httpServer({
  connection: { port: 0 }, // 0 picks a free port, good for tests
  plugins: {
    routes: {
      register: (fastify, options, next) => {
        fastify.get("/hello", async () => ({ hello: "world" }));
        next();
      }
    }
  }
});

console.log(server.info.port);
await server.close();
```

The package is ESM, and Node >= 22.12 can `require()` it directly, so CJS test
fixtures work too:

```js
const { httpServer } = require("@fynjs/http-server");
```

`electrodeServer` is exported as an alias of `httpServer` for drop-in
compatibility.

## Config

| field         | description                                                          |
| ------------- | -------------------------------------------------------------------- |
| `connection`  | `{ host, address = "0.0.0.0", port }`                                 |
| `plugins`     | plugins to register, see below                                        |
| `server`      | options passed to Fastify verbatim                                    |
| `electrode`   | `{ eventTimeout = 10000, keepAliveTimeout = 60000 }`                  |
| `deferStart`  | `true` to skip listening, so you can add routes then call `start()`   |
| `listener`    | `emitter => …` hook to register lifecycle event handlers              |

### Composition

Config is composed with [@fynjs/confippet]: internal defaults, then the
`NODE_ENV` overlay (`development`, `production`, `qa`, `staging`, `test`), then
each `decors` entry in order, then your `appConfig`, then confippet's own
environment provider. Each layer is a confippet handler provider — the internal
config files are static imports, so nothing is read from disk and a bundler
keeps them.

That means all of confippet's semantics apply:

- objects merge key by key; arrays replace, unless the key starts with `+`, in
  which case the layers' arrays are unioned under that same `+` key
- `NODE_CONFIG`, and any `CONFIPPET*` environment variable, is parsed as JSON
  and merged last — over your `appConfig`
- `{{…}}` templates in the result are resolved afterwards, against the config
  itself (`{{config.connection.port}}`), the environment (`{{env.HOST}}`,
  `{{getEnv:AWS_REGION:upperCase}}`), `{{readFile:/run/secrets/token}}` and
  `{{deployment}}`. A reference nothing resolves becomes `""`; `{{-…}}` keeps
  the rest literal.

The composed config is a confippet store, so it also carries a non-enumerable
`$(path)` reader — `server.app.config.$("connection.port")`.

### deferStart

```js
const server = await httpServer({ connection: { port: 0 }, deferStart: true });
server.get("/late", async () => ({ late: true }));
await server.start();
```

## Plugins

```js
{
  plugins: {
    requireFromPath: import.meta.dirname,
    "./plugins/demo": { priority: 100, options: { … } },
    inline: { register: (fastify, options, next) => next() },
    disabled: { enable: false, register: … }
  }
}
```

- `priority` — lower registers earlier; anything non-numeric sorts last
- `enable: false` — skip the plugin, useful for per-env config composition
- `module` — `string`, `{ name, requireFromPath }`, or `false` to require that
  `register` is given directly. Defaults to the plugin's own key.
- `register` — supply the register function directly; `module` is then ignored
- `fastifyPluginDecorate: false` — skip the `fastify-plugin` wrapping

When loading from a module, the register is looked up in this order:
`fastifyPlugin`, `default.fastifyPlugin`, `plugin`, `default`, then the module
itself.

## Events

Emitted in this order while starting, each handler `(context, next)`, run
sequentially and bounded by `electrode.eventTimeout`:

`config-composed` → `server-created` → `plugins-sorted` → `plugins-registered` →
`server-started` → `complete`

```js
await httpServer({
  listener: emitter => {
    emitter.on("server-started", (context, next) => {
      console.log("up on", context.server.info.port);
      next();
    });
  }
});
```

A handler may call `next()`, `next(err)`, or return a promise.

## Hapi compatibility decorations

`server.info` (`{ port, address }`, read live off the node server), `server.app`
(`{ config }`), `server.settings`, `server.start()`, `request.path`,
`request.info.remoteAddress`, `request.app`.

## Errors

Startup failures are annotated with a code, printed to stderr with a suggested
resolution, and rejected with `err.moreInfo` set:

| code             | meaning                                         |
| ---------------- | ----------------------------------------------- |
| `XEVENT_FAILED`  | a lifecycle event handler errored               |
| `XEVENT_TIMEOUT` | a handler never completed within `eventTimeout` |
| `XPLUGIN_FAILED` | a plugin failed to register                     |
| `EADDRINUSE`     | the port is already taken                       |

## Differences from @xarc/fastify-server

Behavioral differences, all deliberate:

- **Dependencies.** `async-eventemitter` (unmaintained, pulls `async@2`) and
  `require-at` are replaced by a small internal async emitter and
  `node:module`'s `createRequire`; `electrode-confippet` is replaced by
  [@fynjs/confippet], which is the same composer on current dependencies. What
  remains is `fastify`, `fastify-plugin`, `xaa`, `chalk` and `@fynjs/confippet`.
- **A `config-composed` handler failure** goes through the same `startFailed`
  reporting as every later event, rather than escaping bare.
- **A plugin whose register throws synchronously** is reported as
  `XPLUGIN_FAILED` instead of escaping avvio as an uncaught exception and killing
  the process.
- **A plugin that never finishes** is attributed to the specific plugin that
  stalled, by tracking which one started but never completed.
- Registration waits on `server.ready()` rather than per-plugin `after()`, whose
  promisified form does not settle against current avvio.

[Fastify]: https://fastify.dev
[@fynjs/confippet]: ../confippet
[electrode-server]: https://github.com/electrode-io/electrode-server
[@xarc/fastify-server]: https://github.com/electrode-io/fastify-server
