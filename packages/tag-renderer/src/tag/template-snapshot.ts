import { TOKEN_HANDLER, TokenModule } from "../runtime/index.js";
import type { TokenProperties } from "../runtime/index.js";
import { Token, createTemplateTagsFromArray, isTemplateTags } from "./tag-template.js";
import type { TemplateTags } from "./tag-template.js";

export const TEMPLATE_SNAPSHOT_FORMAT = "@fynjs/tag-renderer/template" as const;
export const TEMPLATE_SNAPSHOT_VERSION = 1 as const;

export type TemplateSnapshotJson =
  | null
  | boolean
  | number
  | string
  | TemplateSnapshotJson[]
  | { [key: string]: TemplateSnapshotJson };

export type TemplateSnapshotTag =
  | { type: "text"; value: string }
  | { type: "string"; value: string }
  | { type: "bytes"; subtype: "buffer" | "uint8array"; data: number[] }
  | { type: "token"; id: string; props: { [key: string]: TemplateSnapshotJson } }
  | { type: "array" | "template"; tags: TemplateSnapshotTag[] };

export interface TemplateSnapshot {
  format: typeof TEMPLATE_SNAPSHOT_FORMAT;
  version: typeof TEMPLATE_SNAPSHOT_VERSION;
  tags: TemplateSnapshotTag[];
}

export function encodeTemplateSnapshot(templateTags: TemplateTags): TemplateSnapshot {
  if (!isTemplateTags(templateTags)) throw snapshotError("$", "expected TemplateTags");
  return {
    format: TEMPLATE_SNAPSHOT_FORMAT,
    version: TEMPLATE_SNAPSHOT_VERSION,
    tags: encodeTags(templateTags, "$.tags", new WeakSet()),
  };
}

export function decodeTemplateSnapshot(snapshot: unknown): TemplateTags {
  if (!isPlainRecord(snapshot)) throw snapshotError("$", "expected an object");
  if (snapshot.format !== TEMPLATE_SNAPSHOT_FORMAT) {
    throw snapshotError("$.format", `expected ${JSON.stringify(TEMPLATE_SNAPSHOT_FORMAT)}`);
  }
  if (snapshot.version !== TEMPLATE_SNAPSHOT_VERSION) {
    throw snapshotError("$.version", `unsupported version ${String(snapshot.version)}`);
  }
  return createTemplateTagsFromArray(decodeTags(snapshot.tags, "$.tags"));
}

function encodeTags(
  tags: readonly unknown[],
  path: string,
  ancestors: WeakSet<object>,
): TemplateSnapshotTag[] {
  if (ancestors.has(tags)) throw snapshotError(path, "circular template");
  ancestors.add(tags);
  try {
    return Array.from({ length: tags.length }, (_, index) => {
      if (!(index in tags)) throw snapshotError(`${path}[${index}]`, "sparse template");
      return encodeTag(tags[index], `${path}[${index}]`, ancestors);
    });
  } finally {
    ancestors.delete(tags);
  }
}

function encodeTag(tag: unknown, path: string, ancestors: WeakSet<object>): TemplateSnapshotTag {
  if (tag instanceof TokenModule) return encodeToken(tag, path, ancestors);
  if (isTemplateTags(tag)) {
    return { type: "template", tags: encodeTags(tag, `${path}.tags`, ancestors) };
  }
  if (Array.isArray(tag)) {
    return { type: "array", tags: encodeTags(tag, `${path}.tags`, ancestors) };
  }
  if (Buffer.isBuffer(tag)) {
    return { type: "bytes", subtype: "buffer", data: [...tag] };
  }
  if (tag instanceof Uint8Array) {
    return { type: "bytes", subtype: "uint8array", data: [...tag] };
  }
  if (typeof tag === "string") return { type: "string", value: tag };
  if (typeof tag === "function") {
    throw snapshotError(path, "executable template tags cannot be snapshotted");
  }
  if (isPlainRecord(tag) && typeof tag.str === "string" && Object.keys(tag).length === 1) {
    return { type: "text", value: tag.str };
  }
  throw snapshotError(path, `unsupported tag value ${describeValue(tag)}`);
}

function encodeToken(
  token: TokenModule,
  path: string,
  ancestors: WeakSet<object>,
): Extract<TemplateSnapshotTag, { type: "token" }> {
  const state = token as unknown as Record<PropertyKey, unknown>;
  if (typeof token.id !== "string") throw snapshotError(`${path}.id`, "expected a string");
  if (token.id === "#tokenInvoke" || state.injectedModule !== undefined) {
    throw snapshotError(path, "executable tokens cannot be snapshotted");
  }
  if (
    token.pos !== -1 ||
    token.custom !== undefined ||
    token.wantsNext !== undefined ||
    token[TOKEN_HANDLER] !== null
  ) {
    throw snapshotError(path, "only pristine tokens can be snapshotted");
  }
  return {
    type: "token",
    id: token.id,
    props: copyJsonObject(token.props, `${path}.props`, ancestors),
  };
}

function copyJson(value: unknown, path: string, ancestors: WeakSet<object>): TemplateSnapshotJson {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw snapshotError(path, "expected a finite JSON number");
    }
    return value;
  }
  if (Array.isArray(value)) {
    assertDenseDataArray(value, path);
    if (ancestors.has(value)) throw snapshotError(path, "circular property value");
    ancestors.add(value);
    try {
      return value.map((item, index) => copyJson(item, `${path}[${index}]`, ancestors));
    } finally {
      ancestors.delete(value);
    }
  }
  if (isPlainRecord(value)) return copyJsonObject(value, path, ancestors);
  throw snapshotError(path, `expected JSON data, received ${describeValue(value)}`);
}

function copyJsonObject(
  value: unknown,
  path: string,
  ancestors: WeakSet<object>,
): { [key: string]: TemplateSnapshotJson } {
  if (!isPlainRecord(value)) throw snapshotError(path, "expected a plain object");
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw snapshotError(path, "symbol properties are not JSON data");
  }
  if (
    Object.getOwnPropertyNames(value).some(
      (key) => !Object.prototype.propertyIsEnumerable.call(value, key),
    )
  ) {
    throw snapshotError(path, "non-enumerable properties are not JSON data");
  }
  if (ancestors.has(value)) throw snapshotError(path, "circular property value");
  ancestors.add(value);
  try {
    return Object.fromEntries(
      Object.keys(value).map((key) => [key, copyJson(value[key], `${path}.${key}`, ancestors)]),
    );
  } finally {
    ancestors.delete(value);
  }
}

function decodeTags(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw snapshotError(path, "expected an array");
  assertDenseDataArray(value, path);
  return value.map((tag, index) => decodeTag(tag, `${path}[${index}]`));
}

function decodeTag(value: unknown, path: string): unknown {
  if (!isPlainRecord(value)) throw snapshotError(path, "expected a tag object");
  switch (value.type) {
    case "text":
      if (typeof value.value !== "string")
        throw snapshotError(`${path}.value`, "expected a string");
      return { str: value.value };
    case "string":
      if (typeof value.value !== "string")
        throw snapshotError(`${path}.value`, "expected a string");
      return value.value;
    case "bytes":
      return decodeBytes(value, path);
    case "token": {
      if (typeof value.id !== "string") throw snapshotError(`${path}.id`, "expected a string");
      const props = copyJsonObject(value.props, `${path}.props`, new WeakSet());
      return Token(value.id, props as TokenProperties);
    }
    case "array":
      return decodeTags(value.tags, `${path}.tags`);
    case "template":
      return createTemplateTagsFromArray(decodeTags(value.tags, `${path}.tags`));
    default:
      throw snapshotError(`${path}.type`, `unsupported tag type ${JSON.stringify(value.type)}`);
  }
}

function decodeBytes(value: Record<PropertyKey, unknown>, path: string): Buffer | Uint8Array {
  if (value.subtype !== "buffer" && value.subtype !== "uint8array") {
    throw snapshotError(`${path}.subtype`, "expected buffer or uint8array");
  }
  if (!Array.isArray(value.data)) throw snapshotError(`${path}.data`, "expected an array");
  assertDenseDataArray(value.data, `${path}.data`);
  const data = value.data.map((byte, index) => {
    if (!Number.isInteger(byte) || (byte as number) < 0 || (byte as number) > 255) {
      throw snapshotError(`${path}.data[${index}]`, "expected a byte");
    }
    return byte as number;
  });
  return value.subtype === "buffer" ? Buffer.from(data) : Uint8Array.from(data);
}

function assertDenseDataArray(value: readonly unknown[], path: string): void {
  const keys = Reflect.ownKeys(value).filter((key) => key !== "length");
  if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) {
    throw snapshotError(path, "expected a dense data array");
  }
}

function isPlainRecord(value: unknown): value is Record<PropertyKey, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  return typeof value === "object" ? Object.prototype.toString.call(value) : typeof value;
}

function snapshotError(path: string, message: string): TypeError {
  return new TypeError(`template snapshot ${path}: ${message}`);
}
