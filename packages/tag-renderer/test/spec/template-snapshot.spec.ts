import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  RegisterTokenIds,
  TagRenderer,
  Token,
  TokenInvoke,
  createTemplateTags,
  createTemplateTagsFromArray,
  exportTemplateSnapshot,
  loadTemplateSnapshot,
} from "../../src/index.js";
import { TOKEN_HANDLER } from "../../src/runtime/index.js";
import {
  TEMPLATE_SNAPSHOT_FORMAT,
  decodeTemplateSnapshot,
  encodeTemplateSnapshot,
} from "../../src/tag/template-snapshot.js";

describe("template snapshots", () => {
  const fixtureTemplate = Symbol.for("@fynjs/tag-renderer/test-template");
  const packageTemp = join(import.meta.dirname, "../../.temp");
  let tempDir: string;

  beforeEach(async () => {
    await mkdir(packageTemp, { recursive: true });
    tempDir = await mkdtemp(join(packageTemp, "snapshot-"));
  });

  afterEach(async () => {
    delete (globalThis as Record<PropertyKey, unknown>)[fixtureTemplate];
    await rm(tempDir, { recursive: true });
  });

  it("round trips supported evaluated template values through JSON", async () => {
    const nestedTemplate = createTemplateTagsFromArray([{ str: "nested:" }, Token("NESTED")]);
    const template = createTemplateTagsFromArray([
      { str: "<main>" },
      "raw",
      Buffer.from(" buffer"),
      new Uint8Array([1, 2, 255]),
      Token("BODY", { enabled: true, config: { count: 2 }, values: [null, "x"] }),
      [" array ", Token("ARRAY")],
      nestedTemplate,
      { str: "</main>" },
    ]);

    const serialized = JSON.stringify(encodeTemplateSnapshot(template));
    const decoded = decodeTemplateSnapshot(JSON.parse(serialized));

    expect(decoded[0]).toEqual({ str: "<main>" });
    expect(decoded[1]).toBe("raw");
    expect(Buffer.isBuffer(decoded[2])).toBe(true);
    expect(decoded[2]).toEqual(Buffer.from(" buffer"));
    expect(decoded[3]).toEqual(new Uint8Array([1, 2, 255]));
    expect(decoded[4]).toMatchObject({
      id: "BODY",
      pos: -1,
      props: (template[4] as ReturnType<typeof Token>).props,
    });
    expect(Array.isArray(decoded[5])).toBe(true);
    expect(encodeTemplateSnapshot(decoded)).toEqual(encodeTemplateSnapshot(template));

    const renderer = new TagRenderer({
      templateTags: decoded,
      tokenHandlers: () => ({ BODY: " body ", ARRAY: "array", NESTED: "nested" }),
    });
    expect((await renderer.render({})).result).toBe(
      "<main>raw buffer body  array arraynested:nested</main>",
    );
  });

  it("uses a versioned, explicit JSON schema", () => {
    expect(encodeTemplateSnapshot(createTemplateTags`hello`)).toEqual({
      format: TEMPLATE_SNAPSHOT_FORMAT,
      version: 1,
      tags: [{ type: "text", value: "hello" }],
    });
  });

  it("reports executable tags at their exact paths", () => {
    const cases = [() => "dynamic", TokenInvoke(() => null), RegisterTokenIds(() => undefined)];

    for (const tag of cases) {
      expect(() => encodeTemplateSnapshot(createTemplateTagsFromArray([[tag]]))).toThrow(
        "$.tags[0].tags[0]",
      );
    }
  });

  it("rejects non-pristine and injected token state", () => {
    const mutations: Array<[string, (token: ReturnType<typeof Token>) => void, string]> = [
      ["cloned", (token) => Object.assign(token, { pos: 2 }), "only pristine tokens"],
      ["custom", (token) => Object.assign(token, { custom: null }), "only pristine tokens"],
      ["wants next", (token) => Object.assign(token, { wantsNext: false }), "only pristine tokens"],
      ["handler", (token) => token.setHandler(() => "ready"), "only pristine tokens"],
      ["injected", (token) => (token.tokenMod = () => null), "executable tokens"],
    ];

    for (const [_name, mutate, message] of mutations) {
      const token = Token("VALUE");
      mutate(token);
      expect(() => encodeTemplateSnapshot(createTemplateTagsFromArray([token]))).toThrow(message);
    }
  });

  it("rejects non-string token IDs", () => {
    const id = Token("VALUE");
    Object.assign(id as unknown as Record<string, unknown>, { id: () => null });
    expect(() => encodeTemplateSnapshot(createTemplateTagsFromArray([id]))).toThrow(
      "$.tags[0].id: expected a string",
    );
  });

  it("rejects properties that do not round trip through JSON", () => {
    const symbol = Symbol("hidden");
    const badProperties: Array<[unknown, string]> = [
      [{ nested: { value: undefined } }, "$.tags[0].props.nested.value"],
      [{ value: Number.NaN }, "$.tags[0].props.value"],
      [{ value: -0 }, "$.tags[0].props.value"],
      [{ value: new Date() }, "$.tags[0].props.value"],
      [{ [symbol]: "value" }, "$.tags[0].props"],
    ];

    for (const [props, path] of badProperties) {
      expect(() =>
        encodeTemplateSnapshot(
          createTemplateTagsFromArray([Token("VALUE", props as Record<PropertyKey, unknown>)]),
        ),
      ).toThrow(path);
    }

    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(() =>
      encodeTemplateSnapshot(createTemplateTagsFromArray([Token("VALUE", circular)])),
    ).toThrow("$.tags[0].props.self: circular property value");
  });

  it("rejects unsupported top-level and nested tag data with paths", () => {
    expect(() => encodeTemplateSnapshot([] as never)).toThrow("$: expected TemplateTags");
    expect(() => encodeTemplateSnapshot(createTemplateTagsFromArray([null]))).toThrow(
      "$.tags[0]: unsupported tag value null",
    );
    expect(() => encodeTemplateSnapshot(createTemplateTagsFromArray([[undefined]]))).toThrow(
      "$.tags[0].tags[0]: unsupported tag value undefined",
    );
    expect(() =>
      encodeTemplateSnapshot(createTemplateTagsFromArray([{ str: "text", extra: true }])),
    ).toThrow("$.tags[0]: unsupported tag value");

    const circular = createTemplateTagsFromArray([]);
    circular.push(circular);
    expect(() => encodeTemplateSnapshot(circular)).toThrow("circular template");

    const sparse = new Array(1);
    expect(() => encodeTemplateSnapshot(createTemplateTagsFromArray([sparse]))).toThrow(
      "sparse template",
    );
    expect(() => encodeTemplateSnapshot(createTemplateTagsFromArray([{ str: 1 }]))).toThrow(
      "unsupported tag value",
    );
    expect(() => encodeTemplateSnapshot(createTemplateTagsFromArray([true]))).toThrow(
      "unsupported tag value boolean",
    );
  });

  it("rejects token properties that are not objects", () => {
    const wrongProps = Token("VALUE");
    Object.assign(wrongProps as unknown as Record<string, unknown>, { props: [] });
    expect(() => encodeTemplateSnapshot(createTemplateTagsFromArray([wrongProps]))).toThrow(
      ".props: expected a plain object",
    );

    const circularArray: unknown[] = [];
    circularArray.push(circularArray);
    expect(() =>
      encodeTemplateSnapshot(
        createTemplateTagsFromArray([Token("VALUE", { values: circularArray })]),
      ),
    ).toThrow(".props.values[0]: circular property value");
  });

  it("rejects invalid snapshot envelopes and tag variants", () => {
    const valid = encodeTemplateSnapshot(createTemplateTags`ok`);
    expect(() => decodeTemplateSnapshot({ ...valid, format: "other" })).toThrow("$.format");
    expect(() => decodeTemplateSnapshot({ ...valid, version: 2 })).toThrow(
      "$.version: unsupported version 2",
    );
    expect(() =>
      decodeTemplateSnapshot({ ...valid, tags: [{ type: "future", value: "x" }] }),
    ).toThrow('$.tags[0].type: unsupported tag type "future"');
    expect(() =>
      decodeTemplateSnapshot({
        ...valid,
        tags: [{ type: "bytes", subtype: "buffer", data: [256] }],
      }),
    ).toThrow("$.tags[0].data[0]");
  });

  it("rejects malformed programmatic snapshot data", () => {
    const envelope = { format: TEMPLATE_SNAPSHOT_FORMAT, version: 1 };
    const invalidTags: Array<[unknown, string]> = [
      [null, "expected a tag object"],
      [{ type: "text", value: 1 }, ".value"],
      [{ type: "string", value: 1 }, ".value"],
      [{ type: "token", id: 1, props: {} }, ".id"],
      [{ type: "token", id: "VALUE", props: [] }, ".props"],
      [{ type: "token", id: "VALUE", props: { value: Number.NaN } }, ".props.value"],
      [{ type: "token", id: "VALUE", props: { value: undefined } }, ".props.value"],
      [{ type: "bytes", subtype: "future", data: [] }, ".subtype"],
      [{ type: "bytes", subtype: "buffer", data: null }, ".data"],
      [{ type: "array", tags: null }, ".tags"],
    ];

    for (const [tag, path] of invalidTags) {
      expect(() => decodeTemplateSnapshot({ ...envelope, tags: [tag] })).toThrow(path);
    }

    expect(() => decodeTemplateSnapshot(null)).toThrow("$: expected an object");
    expect(() => decodeTemplateSnapshot(envelope)).toThrow("$.tags: expected an array");
  });

  it("rejects object and array properties that JSON would alter", () => {
    const nullPrototype = Object.assign(Object.create(null) as Record<string, unknown>, {
      value: "supported",
    });
    expect(() =>
      encodeTemplateSnapshot(createTemplateTagsFromArray([Token("VALUE", nullPrototype)])),
    ).not.toThrow();

    const nonEnumerable = {};
    Object.defineProperty(nonEnumerable, "hidden", { value: true });
    expect(() =>
      encodeTemplateSnapshot(createTemplateTagsFromArray([Token("VALUE", nonEnumerable)])),
    ).toThrow("non-enumerable properties");

    const extraProperty = [true];
    Object.assign(extraProperty, { extra: true });
    const sparseArray = new Array(1);

    for (const [props, message] of [
      [extraProperty, "expected a dense data array"],
      [sparseArray, "expected a dense data array"],
    ] as const) {
      expect(() =>
        encodeTemplateSnapshot(createTemplateTagsFromArray([Token("VALUE", { props })])),
      ).toThrow(message);
    }
  });

  it("creates pristine tokens when decoding", () => {
    const decoded = decodeTemplateSnapshot({
      format: TEMPLATE_SNAPSHOT_FORMAT,
      version: 1,
      tags: [{ type: "token", id: "VALUE", props: { value: "safe" } }],
    });
    const token = decoded[0] as ReturnType<typeof Token>;

    expect(token).toMatchObject({ id: "VALUE", pos: -1, props: { value: "safe" } });
    expect(token.custom).toBeUndefined();
    expect(token.wantsNext).toBeUndefined();
    expect(token[TOKEN_HANDLER]).toBeNull();
  });

  it("exports an imported template and loads its JSON snapshot", async () => {
    const template = createTemplateTags`<main>${Token("CONTENT", { source: "fixture" })}</main>`;
    (globalThis as Record<PropertyKey, unknown>)[fixtureTemplate] = template;
    const moduleUrl = new URL("../fixtures/tag/snapshot-template.js", import.meta.url);
    moduleUrl.searchParams.set("case", "load");
    const snapshotFile = join(tempDir, "page.template.json");

    const snapshot = await exportTemplateSnapshot(moduleUrl, pathToFileURL(snapshotFile));
    expect(JSON.parse(await readFile(snapshotFile, "utf8"))).toEqual(snapshot);

    const loaded = await loadTemplateSnapshot(snapshotFile);
    expect(loaded.templateDir).toBe(tempDir);
    const result = await new TagRenderer({
      ...loaded,
      tokenHandlers: () => ({ CONTENT: "loaded" }),
    }).render({});
    expect(result.result).toBe("<main>loaded</main>");
  });

  it("reports invalid snapshot file locations and template modules", async () => {
    const snapshotFile = join(tempDir, "page.template.json");
    const noDefault = fileURLToPath(
      new URL("../fixtures/tag/snapshot-no-default.js", import.meta.url),
    );

    await expect(exportTemplateSnapshot(noDefault, snapshotFile)).rejects.toThrow(
      "template module has no default export",
    );
    await expect(
      exportTemplateSnapshot(new URL("https://example.test/template.js"), snapshotFile),
    ).rejects.toThrow("template module must be a file URL");

    (globalThis as Record<PropertyKey, unknown>)[fixtureTemplate] = createTemplateTags`ok`;
    const moduleUrl = new URL("../fixtures/tag/snapshot-template.js", import.meta.url);
    moduleUrl.searchParams.set("case", "invalid-output");
    await expect(
      exportTemplateSnapshot(moduleUrl, new URL("https://example.test/template.json")),
    ).rejects.toThrow("snapshot file must be a file URL");
    await expect(
      loadTemplateSnapshot(new URL("https://example.test/template.json")),
    ).rejects.toThrow("snapshot file must be a file URL");
  });
});
