import { join } from "node:path";
import { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import {
  RegisterTokenIds,
  RenderContext,
  TagRenderer,
  Token,
  TokenInvoke,
  createTemplateTags,
  createTemplateTagsFromArray,
} from "../../src/index.js";
import { TAG_TYPE } from "../../src/tag/symbols.js";

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<string | Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

describe("tag templates", () => {
  it("creates tagged templates from literals and arrays", () => {
    const template = createTemplateTags` before ${"value"} after `;
    const fromArray = createTemplateTagsFromArray(["one", "two"]);

    expect((template[0] as { str: string }).str).toBe("before");
    expect(template[1]).toBe("value");
    expect((template[2] as { str: string }).str).toBe(" after ");
    expect(template[TAG_TYPE]).toBe("template");
    expect([...fromArray]).toEqual(["one", "two"]);
    expect(fromArray[TAG_TYPE]).toBe("template");
  });

  it("finds tokens and literal strings", () => {
    const template = createTemplateTags`<html>${Token("BODY")}<footer>`;
    const renderer = new TagRenderer({ templateTags: template });

    return renderer.initializeRenderer().then(() => {
      const prepared = renderer._template!;
      expect(prepared.findTokensById("BODY")[0]?.index).toBe(1);
      expect(prepared.findTokensByStr(/html/)[0]?.index).toBe(0);
      expect(prepared.findTokensByStr("missing")).toEqual([]);
      expect(prepared._findTokenIndex("BODY")).toBe(1);
      expect(prepared._findTokenIndex("missing")).toBe(false);
      expect(prepared._findTokenIndex("", "", 2)).toBe(2);
      expect(() => prepared._findTokenIndex("", "", -1)).toThrow("out of range");
      expect(() => prepared.findTokensByStr(null as never)).toThrow(
        "matcher must be a string or RegExp",
      );
    });
  });
});

describe("TagRenderer", () => {
  it("executes promised interpolations strictly in template order", async () => {
    const events: string[] = [];
    const template = createTemplateTags`
      ${async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        events.push("first");
        return "A";
      }}
      ${() => {
        events.push("second");
        return "B";
      }}
    `;

    const context = await new TagRenderer({ templateTags: template }).render({});

    expect(context.result).toBe("AB\n    ");
    expect(events).toEqual(["first", "second"]);
  });

  it("waits for reserved async output while preserving its template position", async () => {
    const template = createTemplateTags`${(context: RenderContext) => {
      const spot = context.output.reserve();
      spot.add("start");
      setTimeout(() => {
        spot.add("-end");
        spot.close();
      }, 10);
    }}middle${() => "tail"}`;

    const context = await new TagRenderer({ templateTags: template }).render({});

    expect(context.result).toBe("start-endmiddletail");
  });

  it("streams handler output in template order", async () => {
    const template = createTemplateTags`before${(context: RenderContext) => {
      context.setMunchyOutput();
      return Readable.from(["-stream-"]);
    }}after`;

    const context = await new TagRenderer({ templateTags: template }).render({});

    expect(await readStream(context.result as NodeJS.ReadableStream)).toBe("before-stream-after");
  });

  it("rejects handler-returned streams in buffered output", async () => {
    const template = createTemplateTags`${() => Readable.from(["stream"])}`;

    const context = await new TagRenderer({ templateTags: template }).render({});

    expect(context.error).toBeInstanceOf(TypeError);
    expect((context.error as Error).message).toContain(
      "call context.setMunchyOutput() before returning it",
    );
  });

  it("streams handler-returned async iterables", async () => {
    const template = createTemplateTags`${(context: RenderContext) => {
      context.setMunchyOutput();
      return (async function* () {
        yield "first";
        yield "-second";
      })();
    }}`;

    const context = await new TagRenderer({ templateTags: template }).render({});

    expect(await readStream(context.result as NodeJS.ReadableStream)).toBe("first-second");
  });

  it("renders static, returned, promised, and array subtemplates", async () => {
    const child = createTemplateTags`<b>${async () => "child"}</b>`;
    const template = createTemplateTags`${child}|${() => child}|${async () => child}|${[
      "array",
      async () => "-child",
    ]}`;

    const context = await new TagRenderer({ templateTags: template }).render({});

    expect(context.result).toBe("<b>child</b>|<b>child</b>|<b>child</b>|array-child");
  });

  it("registers token IDs in a template and lets higher priority providers win", async () => {
    const lower = vi.fn(() => ({ VALUE: "low" }));
    const higher = vi.fn(() => ({ name: "high", tokens: { VALUE: "high" } }));
    const registered = vi.fn(async () => ({ LOCAL: "local" }));
    const template = createTemplateTags`${RegisterTokenIds(registered, "local")}${Token(
      "VALUE",
    )}:${Token("LOCAL")}`;
    const renderer = new TagRenderer({ templateTags: template, tokenHandlers: lower });
    renderer.addTokenIds("high", higher, 10);

    const context = await renderer.render({});

    expect(context.result).toBe("high:local");
    expect(lower).toHaveBeenCalledOnce();
    expect(higher).toHaveBeenCalledOnce();
    expect(registered).toHaveBeenCalledOnce();
    expect(context.getTokens("high")).toEqual({ VALUE: "high" });
  });

  it("uses the later provider when priorities are equal", async () => {
    const template = createTemplateTags`${Token("VALUE")}`;
    const renderer = new TagRenderer({
      templateTags: template,
      tokenHandlers: [() => ({ VALUE: "first" }), () => ({ VALUE: "second" })],
    });

    expect((await renderer.render({})).result).toBe("second");
  });

  it("isolates compiled handlers when renderers share an authoring template", async () => {
    const template = createTemplateTags`${Token("VALUE")}`;
    const first = new TagRenderer({
      templateTags: template,
      tokenHandlers: () => ({ VALUE: "first" }),
    });
    const second = new TagRenderer({
      templateTags: template,
      tokenHandlers: () => ({ VALUE: "second" }),
    });

    await Promise.all([first.initializeRenderer(), second.initializeRenderer()]);

    expect((await first.render({})).result).toBe("first");
    expect((await second.render({})).result).toBe("second");
  });

  it("invokes a token module directly with props", async () => {
    const setup = vi.fn((_options: unknown, token: unknown) => {
      const props = (token as { props: Record<string, unknown> }).props;
      return { process: async () => `hello ${String(props.name)}` };
    });
    const template = createTemplateTags`${TokenInvoke(setup, { name: "Ada" })}`;

    const context = await new TagRenderer({ templateTags: template }).render({});

    expect(context.result).toBe("hello Ada");
    expect(setup).toHaveBeenCalledOnce();
  });

  it("loads module-backed tokens before executing their opcode", async () => {
    const template = createTemplateTags`${Token("#./async-module.js", { value: "loaded" })}`;

    const context = await new TagRenderer({
      templateTags: template,
      templateDir: join(import.meta.dirname, "../fixtures/tag"),
    }).render({});

    expect(context.result).toBe("async loaded");
  });

  it("omits null handlers and results but comments unhandled IDs", async () => {
    const template = createTemplateTags`
      ${RegisterTokenIds(() => ({ NULL_TOKEN: null }))}
      ${Token("NULL_TOKEN")}
      ${Token("MISSING")}
      ${TokenInvoke(() => null)}
      ${() => null}${async () => undefined}
    `;

    const context = await new TagRenderer({ templateTags: template }).render({});

    expect(context.result).toBe("<!-- unhandled token MISSING -->\n\n    ");
  });

  it("adds debug boundaries and explanations for removed tokens", async () => {
    const template = createTemplateTags`
      ${RegisterTokenIds(() => ({ TEXT: "value", NULL_TOKEN: null }))}
      ${Token("TEXT", { mode: "test" })}
      ${Token("NULL_TOKEN")}
      ${TokenInvoke(() => null)}
      ${Token("MISSING")}
    `;

    const context = await new TagRenderer({
      templateTags: template,
      insertTokenIds: true,
    }).render({});

    expect(context.result).toContain('<!-- BEGIN TEXT props: {"mode":"test"} -->\n');
    expect(context.result).toContain("value<!-- TEXT END -->\n");
    expect(context.result).toContain(
      "<!-- NULL_TOKEN removed due to its handler set to null -->\n",
    );
    expect(context.result).toContain(
      "<!-- #tokenInvoke removed due to its process return null -->\n",
    );
    expect(context.result).toContain("<!-- unhandled token MISSING -->\n");
  });

  it("respects _noInsertId for debug boundaries", async () => {
    const template = createTemplateTags`${RegisterTokenIds(() => ({ TEXT: "value" }))}${Token(
      "TEXT",
      { _noInsertId: true },
    )}`;

    const context = await new TagRenderer({
      templateTags: template,
      insertTokenIds: true,
    }).render({});

    expect(context.result).toBe("value");
  });

  it("returns synchronous and asynchronous handler errors on the context", async () => {
    const syncError = new Error("sync failure");
    const asyncError = new Error("async failure");
    const syncContext = await new TagRenderer({
      templateTags: createTemplateTags`${() => {
        throw syncError;
      }}`,
    }).render({});
    const asyncContext = await new TagRenderer({
      templateTags: createTemplateTags`${async () => {
        throw asyncError;
      }}`,
    }).render({});

    expect(syncContext.result).toBe(syncError);
    expect(syncContext.error).toBe(syncError);
    expect(asyncContext.result).toBe(asyncError);
    expect(asyncContext.error).toBe(asyncError);
  });

  it("returns a void-stop replacement and skips later tags", async () => {
    const template = createTemplateTags`${(context: RenderContext) => {
      context.voidStop("replacement");
      return "discarded";
    }}${() => "not rendered"}`;

    const context = await new TagRenderer({ templateTags: template }).render({});

    expect(context.result).toBe("replacement");
  });

  it("returns accumulated output on full stop and skips later tags", async () => {
    const template = createTemplateTags`before${(context: RenderContext) => {
      context.fullStop();
      return "-stop";
    }}${() => "not rendered"}`;

    const context = await new TagRenderer({ templateTags: template }).render({});

    expect(context.result).toBe("before-stop");
  });

  it("returns interception details on the render context", async () => {
    const responseHandler = vi.fn();
    const template = createTemplateTags`${(context: RenderContext) =>
      context.intercept({ responseHandler })}${() => "not rendered"}`;

    const context = await new TagRenderer({ templateTags: template }).render({});

    expect(context.intercepted).toEqual({ responseHandler });
    expect(context.error).toMatchObject({ name: "RenderInterceptError" });
    expect(context.result).toBe(context.error);
  });

  it("prepares opcodes once unless reset is requested", async () => {
    const provider = vi.fn(() => ({ VALUE: "ready" }));
    const template = createTemplateTags`${RegisterTokenIds(provider)}${Token("VALUE")}`;
    const renderer = new TagRenderer({ templateTags: template });

    await renderer.initializeRenderer();
    const processor = renderer._processor;
    expect(renderer._template?._tagOpCodes.every((value) => value !== undefined)).toBe(true);

    await renderer.initializeRenderer();
    expect(renderer._processor).toBe(processor);

    await renderer.initializeRenderer(true);
    expect(renderer._processor).not.toBe(processor);
    expect(provider).toHaveBeenCalledOnce();
  });

  it("shares one initialization across concurrent renders", async () => {
    const provider = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { VALUE: "ready" };
    });
    const renderer = new TagRenderer({
      templateTags: createTemplateTags`${Token("VALUE")}`,
      tokenHandlers: provider,
    });

    const [first, second] = await Promise.all([renderer.render({}), renderer.render({})]);

    expect(first.result).toBe("ready");
    expect(second.result).toBe("ready");
    expect(provider).toHaveBeenCalledOnce();
  });

  it("fails fast for invalid renderer and token provider inputs", async () => {
    expect(() => new TagRenderer({ templateTags: null as never })).toThrow(
      "templateTags must be an array",
    );

    const renderer = new TagRenderer({
      templateTags: createTemplateTags`ok`,
      tokenHandlers: () => null,
    });
    const context = await renderer.render({});
    expect(context.result).toBeInstanceOf(TypeError);
    expect(context.error).toBe(context.result);
  });
});
