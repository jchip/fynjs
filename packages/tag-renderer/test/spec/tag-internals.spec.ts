import { describe, expect, it, vi } from "vitest";

import {
  RenderContext,
  TagRenderer,
  Token,
  createTemplateTags,
  createTemplateTagsFromArray,
} from "../../src/index.js";
import { executeTagTemplate, executeSteps } from "../../src/tag/render-execute.js";
import type { RenderStep } from "../../src/tag/render-processor.js";
import { TAG_TYPE } from "../../src/tag/symbols.js";
import { getFunctionTagHandler, type TagTemplate } from "../../src/tag/tag-template.js";

function deferred<Value = void>(): {
  promise: Promise<Value>;
  resolve: (value: Value | PromiseLike<Value>) => void;
} {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("tag execution internals", () => {
  it("tolerates incomplete compiled steps without corrupting output", async () => {
    const renderer = new TagRenderer({ templateTags: createTemplateTags`` });
    await renderer.initializeRenderer();
    const template = renderer._template!;
    template._steps = [
      { code: executeSteps.STEP_SUB_TEMPLATE },
      { code: executeSteps.STEP_FUNC_HANDLER },
      { code: executeSteps.STEP_HANDLER },
      { code: executeSteps.STEP_HANDLER, token: Token("NO_HANDLER"), insertTokenId: true },
      { code: executeSteps.STEP_HANDLER, token: Token("NO_DEBUG_HANDLER") },
      { code: executeSteps.STEP_STR_TOKEN, data: 42 },
      { code: executeSteps.STEP_LITERAL_HANDLER, data: "literal", insertTokenId: true },
      { code: executeSteps.STEP_NO_HANDLER },
    ] satisfies RenderStep[];
    const context = new RenderContext({}, renderer);

    const result = await executeTagTemplate(template, context);

    expect(result).toBe("<!-- BEGIN NO_HANDLER props: {} -->\n<!-- NO_HANDLER END -->\nliteral");
  });

  it("executes a prepared template as a subtemplate without closing output", async () => {
    const renderer = new TagRenderer({ templateTags: createTemplateTags`nested` });
    await renderer.initializeRenderer();
    const context = new RenderContext({}, renderer);

    expect(await executeTagTemplate(renderer._template!, context, true)).toBeUndefined();
    await context.closeDeferred();
    expect(await context.output.close()).toBe("nested");
  });

  it("adds debug boundaries around synchronous and asynchronous token handlers", async () => {
    const renderer = new TagRenderer({
      templateTags: createTemplateTags`${Token("SYNC")}${Token("ASYNC")}`,
      insertTokenIds: true,
      tokenHandlers: () => ({
        SYNC: () => "sync",
        ASYNC: async () => "async",
      }),
    });

    const context = await renderer.render({});

    expect(context.result).toBe(
      "<!-- BEGIN SYNC props: {} -->\nsync<!-- SYNC END -->\n" +
        "<!-- BEGIN ASYNC props: {} -->\nasync<!-- ASYNC END -->\n",
    );
  });

  it("classifies ignored tags, buffers, and untagged functions", async () => {
    const taggedObject = { [TAG_TYPE]: "unsupported" as const };
    const renderer = new TagRenderer({
      templateTags: createTemplateTagsFromArray([
        null,
        undefined,
        false,
        "",
        42,
        {},
        taggedObject,
        Buffer.from("buffer"),
      ]),
    });

    const context = await renderer.render({});

    expect(context.result).toBe("buffer");
    expect(renderer._template?._templateTags[6]).toEqual({ ...taggedObject, pos: 6 });
    expect(getFunctionTagHandler("not tagged")).toBeUndefined();
  });

  it("uses cached opcodes and all token-index selectors", async () => {
    const renderer = new TagRenderer({
      templateTags: createTemplateTags`<main>${Token("BODY")}</main>`,
    });
    await renderer.initializeRenderer();
    const template = renderer._template!;
    const opcode = await template.getTagOpCode(0);

    expect(await template.getTagOpCode(0)).toBe(opcode);
    expect(template._findTokenIndex("", /main/)).toBe(0);
    expect(() => template._findTokenIndex("", "", 1.5)).toThrow("invalid id, str, and index");
    expect(template.findTokensByStr(/main/, 1)).toHaveLength(1);
  });

  it("prepares a module step without a bound handler or debug boundary", async () => {
    const renderer = new TagRenderer({
      templateTags: createTemplateTags`ok`,
      insertTokenIds: true,
    });
    await renderer.initializeRenderer();
    const token = Token("#virtual", { _noInsertId: true });
    token.custom = { process: () => "unused" };

    const step = await renderer._processor!.makeStep(token);

    expect(step).toMatchObject({
      code: executeSteps.STEP_HANDLER,
      handler: undefined,
      insertTokenId: false,
    });
  });

  it("runs a reset requested during active initialization", async () => {
    const gate = deferred<Record<string, string>>();
    const provider = vi.fn(() => gate.promise);
    const renderer = new TagRenderer({
      templateTags: createTemplateTags`${Token("VALUE")}`,
      tokenHandlers: provider,
    });

    const first = renderer.initializeRenderer();
    const reset = renderer.initializeRenderer(true);
    gate.resolve({ VALUE: "ready" });
    await Promise.all([first, reset]);

    expect(provider).toHaveBeenCalledOnce();
    expect((await renderer.render({})).result).toBe("ready");
  });

  it("rolls back replacement registrations for applied and pending providers", async () => {
    let fail = false;
    const applied = vi.fn(() => {
      if (fail) throw new Error("applied replacement failed");
      return { VALUE: "applied" };
    });
    const renderer = new TagRenderer({
      templateTags: createTemplateTags`${Token("VALUE")}`,
      tokenHandlers: applied,
    });
    await renderer.initializeRenderer();
    fail = true;

    await expect(
      renderer.registerTokenIds("replacement", Symbol("applied"), applied),
    ).rejects.toThrow("applied replacement failed");
    expect(renderer.lookupTokenHandler(Token("VALUE"))).toBe("applied");

    const pending = vi.fn(() => {
      throw new Error("pending replacement failed");
    });
    const pendingRenderer = new TagRenderer({
      templateTags: createTemplateTags`ok`,
      tokenHandlers: pending,
    });
    await expect(
      pendingRenderer.registerTokenIds("pending", Symbol("pending"), pending),
    ).rejects.toThrow("pending replacement failed");
    expect(pendingRenderer._tokenHandlers).toHaveLength(1);
  });

  it("rebuilds applied providers while retaining priority winners", async () => {
    const high = vi.fn(() => ({ VALUE: "high", HIGH: "yes" }));
    const low = vi.fn(() => ({ VALUE: "low", LOW: "yes" }));
    const lower = vi.fn(() => ({ VALUE: "lower" }));
    const renderer = new TagRenderer({
      templateTags: createTemplateTags`${Token("VALUE")}`,
      tokenHandlers: [high, low],
    });
    renderer.addTokenIds("high", high, 10);
    renderer.addTokenIds("lower", lower, -1);
    await renderer.initializeRenderer();
    expect(renderer.lookupTokenHandler(Token("VALUE"))).toBe("high");

    const internal = renderer as unknown as {
      _initializeTokenHandlers(handlers: unknown[]): Promise<void>;
      _tokenHandlers: unknown[];
    };
    await internal._initializeTokenHandlers(internal._tokenHandlers);

    renderer.addTokenIds("low-again", low, 0);
    await renderer.initializeRenderer(true);

    expect(renderer.lookupTokenHandler(Token("VALUE"))).toBe("high");
    expect(renderer.lookupTokenHandler(Token("LOW"))).toBe("yes");
    expect(renderer.lookupTokenHandler(Token("HIGH"))).toBe("yes");
  });

  it("retains the first equal-priority winner when provider order is older", async () => {
    const renderer = new TagRenderer({
      templateTags: createTemplateTags`ok`,
      tokenHandlers: [() => ({ VALUE: "first" }), () => ({ VALUE: "second" })],
    });
    await renderer.initializeRenderer();
    const internal = renderer as unknown as {
      _tokenHandlers: Array<{ order: number }>;
      rebuildTokenRegistry(): void;
    };
    internal._tokenHandlers[0].order = 10;
    internal._tokenHandlers[1].order = 1;

    internal.rebuildTokenRegistry();

    expect(renderer.lookupTokenHandler(Token("VALUE"))).toBe("first");
  });

  it("rejects an internal rebuild containing an unloaded provider", () => {
    const renderer = new TagRenderer({
      templateTags: createTemplateTags`ok`,
      tokenHandlers: () => ({ VALUE: "pending" }),
    });
    const internal = renderer as unknown as { rebuildTokenRegistry(): void };

    expect(() => internal.rebuildTokenRegistry()).toThrow(
      "cannot rebuild an unloaded token provider",
    );
  });
});
