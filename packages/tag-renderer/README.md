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

Token handlers may return strings, buffers, readable streams, promises, or nested tag templates.
Promise-returning handlers are awaited in template order. A handler that starts independent work
can reserve its output position so later handlers may continue without moving their output ahead:

```ts
${(context) => {
  const spot = context.output.reserve();
  void loadContent().then((content) => {
    spot.add(content);
    spot.close();
  });
}}
```

## Public API

The package root exports the template-authoring API:

- `TagRenderer`
- `TagTemplate`, `createTemplateTags`, and `createTemplateTagsFromArray`
- `Token`, `TokenInvoke`, and `RegisterTokenIds`
- `RenderContext`, `RenderOutput`, and `SpotOutput`, including the types needed by token handlers

Advanced integrations may import the underlying runtime from `@fynjs/tag-renderer/runtime`. That
subpath additionally exports `BaseOutput`, `MainOutput`, `TokenModule`, token-module loading symbols
and helpers, and stream-detection helpers.

## Output modes

Rendering is buffered by default. A handler can configure the render context for callback-based or
streaming output before producing content. Reserved output spots retain template order in every
mode.
