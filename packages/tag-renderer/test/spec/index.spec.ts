import { describe, expect, it } from "vitest";

import * as tagRenderer from "../../src/index.js";
import * as runtime from "../../src/runtime.js";
import type {
  InterceptState,
  LoadedTemplateSnapshot,
  RegisterTokenIdsTag,
  RenderHost,
  RenderTransform,
  RenderValue,
  TagRendererOptions,
  TagTemplateOptions,
  TemplateSnapshot,
  TemplateSnapshotJson,
  TemplateSnapshotTag,
  TemplateFunction,
  TemplateTags,
  TokenHandler,
  TokenIdHandler,
  TokenRegistry,
} from "../../src/index.js";
import type {
  OutputSend,
  OutputContext,
  RenderChunk,
  RenderContextOptions,
  RenderStream,
  StreamErrorResult,
  TokenModuleFactory,
  TokenModuleId,
  TokenModuleInstance,
  TokenModuleLoader,
  TokenModuleNamespace,
  TokenModuleProcess,
  TokenProvider,
  TokenProperties,
  TokenRegistration,
} from "../../src/runtime.js";

type RootTypes =
  | InterceptState
  | LoadedTemplateSnapshot
  | RegisterTokenIdsTag
  | RenderHost
  | RenderTransform
  | RenderValue
  | TagRendererOptions
  | TagTemplateOptions
  | TemplateSnapshot
  | TemplateSnapshotJson
  | TemplateSnapshotTag
  | TemplateFunction
  | TemplateTags
  | TokenHandler
  | TokenIdHandler
  | TokenRegistry;

type RuntimeTypes =
  | OutputSend
  | OutputContext
  | RenderChunk
  | RenderContextOptions
  | RenderStream
  | StreamErrorResult
  | TokenModuleFactory
  | TokenModuleId
  | TokenModuleInstance
  | TokenModuleLoader
  | TokenModuleNamespace
  | TokenModuleProcess
  | TokenProvider
  | TokenProperties
  | TokenRegistration;

void (0 as unknown as RootTypes);
void (0 as unknown as RuntimeTypes);

describe("@fynjs/tag-renderer public surface", () => {
  it("exposes only template-authoring and handler-facing runtime values at the root", () => {
    expect(Object.keys(tagRenderer).sort()).toEqual([
      "RegisterTokenIds",
      "RenderContext",
      "RenderOutput",
      "SpotOutput",
      "TEMPLATE_SNAPSHOT_FORMAT",
      "TEMPLATE_SNAPSHOT_VERSION",
      "TagRenderer",
      "TagTemplate",
      "Token",
      "TokenInvoke",
      "createTemplateTags",
      "createTemplateTagsFromArray",
      "decodeTemplateSnapshot",
      "encodeTemplateSnapshot",
      "exportTemplateSnapshot",
      "loadTemplateSnapshot",
    ]);
  });

  it("exposes lower-level integrations from the runtime subpath", () => {
    expect(runtime).toMatchObject({
      BaseOutput: expect.any(Function),
      MainOutput: expect.any(Function),
      RenderContext: tagRenderer.RenderContext,
      RenderOutput: tagRenderer.RenderOutput,
      SpotOutput: tagRenderer.SpotOutput,
      TokenModule: expect.any(Function),
      isReadableStream: expect.any(Function),
      isRenderStream: expect.any(Function),
      loadTokenModuleHandler: expect.any(Function),
      munchyHandleStreamError: expect.any(Function),
      renderStreamError: expect.any(Function),
      resolveTokenModulePath: expect.any(Function),
      tokenModuleDirectory: expect.any(Function),
    });
    expect(typeof runtime.TEMPLATE_DIR).toBe("symbol");
    expect(typeof runtime.TOKEN_HANDLER).toBe("symbol");
  });
});
