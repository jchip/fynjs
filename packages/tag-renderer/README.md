# @fynjs/tag-renderer

An asynchronous renderer for JavaScript template literals. It supports async token handlers,
nested templates, ordered concurrent output, buffers, readable streams, transforms, and controlled
render termination.

The package is private while its API is being prepared for the fynjs app engine.

## Usage

```ts
import { TagRenderer, Token, createTemplateTags } from "@fynjs/tag-renderer";

const templateTags = createTemplateTags`<!doctype html>
<html>
  <body>${Token("CONTENT")}</body>
</html>`;

const renderer = new TagRenderer({
  templateTags,
  tokenHandlers: () => ({
    CONTENT: async () => "Rendered asynchronously",
  }),
});

const context = await renderer.render({});
console.log(context.result);
```

Token handlers may return strings, buffers, promises, or nested tag templates. In streaming output
mode they may also return readable streams and synchronous or asynchronous iterables. Promise-returning
handlers are awaited in template order. A handler can explicitly defer independent work so later
handlers continue without moving its output ahead. Deferred work is bounded by `deferConcurrency`
(default 8), receives a render-scoped cancellation signal, and retires in template order:

```ts
${(context) => context.defer((signal) => loadContent({ signal }))}
```

Ordinary promise-returning handlers remain sequential. `context.output.reserve()` remains available
as a low-level primitive for integrations that manage their own lifetime.

For progressive output, `renderStream()` returns immediately while initialization and rendering run
in the background:

```ts
const { stream, completed, finished, abort } = renderer.renderStream();
stream.pipe(response);
const context = await completed;
const deliveredContext = await finished;
```

`completed` tracks producer orchestration and may resolve before stream delivery. `finished` waits for
both producer completion and stream end or close, so it requires stream consumption or an abort.
Deferred scheduling may backpressure producer completion while an ordered source is still draining.
Destroying the stream or calling `abort()` cancels outstanding deferred work and settles `finished`.
The returned `stream` is the raw output stream; configured result transforms still apply only to
`context.result`.

## Public API

The package root exports the template-authoring API:

- `TagRenderer`
- `TagTemplate`, `createTemplateTags`, and `createTemplateTagsFromArray`
- `encodeTemplateSnapshot`, `decodeTemplateSnapshot`, `exportTemplateSnapshot`, and
  `loadTemplateSnapshot`
- `Token`, `TokenInvoke`, and `RegisterTokenIds`
- `RenderContext`, `RenderOutput`, and `SpotOutput`, including the types needed by token handlers

Advanced integrations may import the underlying runtime from `@fynjs/tag-renderer/runtime`. That
subpath additionally exports `BaseOutput`, `MainOutput`, `TokenModule`, token-module loading symbols
and helpers, and stream-detection helpers.

## Template snapshots

A trusted ESM template can be imported once and exported as a versioned JSON snapshot. The runtime
loader reconstructs its template tags without importing the original template module:

```ts
await exportTemplateSnapshot("templates/page.js", "templates/page.template.json");

const loaded = await loadTemplateSnapshot("templates/page.template.json");
const renderer = new TagRenderer({ ...loaded, tokenHandlers });
```

Snapshots support literal strings, byte arrays, nested templates, and pristine string-ID tokens
whose properties contain only JSON data. Export rejects executable tags such as functions,
`TokenInvoke`, and `RegisterTokenIds`. Relative module-backed tokens resolve from the snapshot file's
directory.

## Output modes

Rendering is buffered by default. Call `context.setMunchyOutput()` before returning a readable stream
or iterable from a handler. Buffered and callback output reject those values instead of implicitly
collecting an unbounded stream into memory. The output mode locks on the first flush or close.
Reserved output spots retain template order in every mode.

## Benchmarks

The committed benchmark suite covers static rendering, registry construction, and ordered deferred
work. Run the raw warm-render benchmark with:

```sh
fyn bench:static
```

It renders the same 64 KiB static HTML payload split across 1, 16, 256, 512, 1,024, 2,048, 3,072, and
4,096 literal tags. The renderer is initialized before timing, and the templates contain no functions,
promises, tokens, or dynamic modules. Results include arithmetic mean, median, and p95 time per render;
renders and MiB per second; median nanoseconds per tag; and median absolute deviation. MiB per second is
logical rendered output, not string-flattening or I/O throughput. Timing statistics summarize batched
per-render sample averages rather than request-tail latency.
`fyn bench:static:smoke` runs the same cases with shorter sampling.
