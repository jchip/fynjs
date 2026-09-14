import { TokenModule } from "../runtime/index.js";
import type { RenderContext, TokenModuleFactory, TokenProperties } from "../runtime/index.js";
import type { RenderProcessor, RenderStep } from "./render-processor.js";
import { TAG_TYPE } from "./symbols.js";
import type { TagRenderer } from "./tag-renderer.js";

export type TemplateTags = unknown[] & { [TAG_TYPE]: "template" };
export type TemplateFunction = (context: RenderContext) => unknown;
export type TokenIdHandler = (context: Record<string, unknown>, renderer?: TagRenderer) => unknown;

export interface RegisterTokenIdsTag {
  (context: { asyncTemplate: { registerTokenIds: RegisterTokenIdsMethod } }): void | Promise<void>;
  [TAG_TYPE]: "register-token-ids";
}

type RegisterTokenIdsMethod = (
  name: string | undefined,
  uniqueId: symbol,
  handler: TokenIdHandler,
  priority?: number,
) => void | Promise<void>;

interface TaggedValue {
  [TAG_TYPE]?: string;
  pos?: number;
}

interface FunctionTag extends TaggedValue {
  [TAG_TYPE]: "function";
  pos: number;
  func: TemplateFunction;
}

export const createTemplateTags = (
  literals: TemplateStringsArray,
  ...values: unknown[]
): TemplateTags => {
  const tags: unknown[] = [];

  for (let index = 0; index < values.length; index++) {
    const literal = literals[index].trim();
    if (literal) tags.push({ str: literal });
    tags.push(values[index]);
  }

  tags.push({ str: literals[values.length] });
  return Object.assign(tags, { [TAG_TYPE]: "template" as const });
};

export const createTemplateTagsFromArray = (tags: readonly unknown[]): TemplateTags =>
  Object.assign([...tags], { [TAG_TYPE]: "template" as const });

export const Token = (id: string, props: TokenProperties = {}): TokenModule & TaggedValue => {
  const token = new TokenModule(id, -1, props, process.cwd()) as TokenModule & TaggedValue;
  token[TAG_TYPE] = "token";
  return token;
};

export const TokenInvoke = (
  handler: TokenModuleFactory,
  props: TokenProperties = {},
): TokenModule & TaggedValue => {
  const token = new TokenModule("#tokenInvoke", -1, props, process.cwd()) as TokenModule &
    TaggedValue;
  token.tokenMod = handler;
  token[TAG_TYPE] = "token";
  return token;
};

export const RegisterTokenIds = (handler: TokenIdHandler, name?: string): RegisterTokenIdsTag => {
  const uniqueId = Symbol(`register-token-${name ?? "unnamed"}`);
  const register = (context: { asyncTemplate: { registerTokenIds: RegisterTokenIdsMethod } }) =>
    context.asyncTemplate.registerTokenIds(name, uniqueId, handler);

  return Object.assign(register, { [TAG_TYPE]: "register-token-ids" as const });
};

export interface TagTemplateOptions {
  templateTags: readonly unknown[];
  templateDir?: string;
  processor: RenderProcessor;
}

export class TagTemplate {
  readonly _templateTags: unknown[];
  readonly _tagOpCodes: Array<RenderStep | null | undefined>;
  _steps: readonly RenderStep[] = [];
  readonly _templateDir?: string;
  readonly _processor: RenderProcessor;

  constructor(options: TagTemplateOptions) {
    this._templateTags = options.templateTags.map((tag, index) => {
      if (tag instanceof TokenModule) return tag.clone(index, options.templateDir);
      if (isTaggedValue(tag)) {
        return typeof tag === "function" || isTemplateTags(tag) ? tag : { ...tag, pos: index };
      }
      if (typeof tag === "function") {
        return {
          [TAG_TYPE]: "function",
          pos: index,
          func: tag as TemplateFunction,
        } satisfies FunctionTag;
      }
      return tag;
    });
    this._tagOpCodes = new Array(this._templateTags.length);
    this._templateDir = options.templateDir;
    this._processor = options.processor;
  }

  getTag(index: number): unknown {
    return this._templateTags[index];
  }

  async getTagOpCode(index: number): Promise<RenderStep | null> {
    if (this._tagOpCodes[index] === undefined) {
      this._tagOpCodes[index] = await this._processor.makeStep(
        this.getTag(index),
        this._templateDir,
      );
    }
    return this._tagOpCodes[index] ?? null;
  }

  async initTagOpCode(): Promise<void> {
    for (let index = 0; index < this._templateTags.length; index++) {
      await this.getTagOpCode(index);
    }
    this._steps = Object.freeze(
      this._tagOpCodes.filter((step): step is RenderStep => step !== null && step !== undefined),
    );
  }

  async handleSubTemplate(templateTags: readonly unknown[]): Promise<TagTemplate> {
    const template = new TagTemplate({
      templateTags,
      templateDir: this._templateDir,
      processor: this._processor,
    });
    await this._processor.loadTokenModules(template);
    await template.initTagOpCode();
    return template;
  }

  _findTokenIndex(
    id = "",
    str: string | RegExp = "",
    index = 0,
    instance = 0,
    message = "TagTemplate._findTokenIndex",
  ): number | false {
    let found: Array<{ index: number; token: unknown }>;

    if (id) {
      found = this.findTokensById(id, instance + 1);
    } else if (str) {
      found = this.findTokensByStr(str, instance + 1);
    } else if (!Number.isInteger(index)) {
      throw new Error(`${message}: invalid id, str, and index`);
    } else if (index < 0 || index >= this._templateTags.length) {
      throw new Error(`${message}: index ${index} is out of range.`);
    } else {
      return index;
    }

    return found[instance]?.index ?? false;
  }

  findTokensById(id: string, count = Infinity): Array<{ index: number; token: unknown }> {
    const limit = Number.isInteger(count) ? count : this._templateTags.length;
    const found: Array<{ index: number; token: unknown }> = [];

    for (let index = 0; index < this._templateTags.length && found.length < limit; index++) {
      const token = this._templateTags[index];
      if (isObject(token) && token.id === id) found.push({ index, token });
    }
    return found;
  }

  findTokensByStr(
    matcher: string | RegExp,
    count = Infinity,
  ): Array<{ index: number; token: unknown }> {
    const limit = Number.isInteger(count) ? count : this._templateTags.length;
    let matches: (value: string) => boolean;

    if (typeof matcher === "string") {
      matches = (value) => value.includes(matcher);
    } else if (matcher instanceof RegExp) {
      matches = (value) => matcher.test(value);
    } else {
      throw new Error("TagTemplate.findTokensByStr: matcher must be a string or RegExp");
    }

    const found: Array<{ index: number; token: unknown }> = [];
    for (let index = 0; index < this._templateTags.length && found.length < limit; index++) {
      const token = this._templateTags[index];
      if (isObject(token) && typeof token.str === "string" && matches(token.str)) {
        found.push({ index, token });
      }
    }
    return found;
  }
}

export const isTemplateTags = (value: unknown): value is TemplateTags =>
  Array.isArray(value) && (value as Partial<TemplateTags>)[TAG_TYPE] === "template";

export const isTaggedValue = (value: unknown): value is TaggedValue =>
  (typeof value === "object" && value !== null && TAG_TYPE in value) ||
  (typeof value === "function" && TAG_TYPE in value);

export const getTagType = (value: unknown): string | undefined =>
  isTaggedValue(value) ? value[TAG_TYPE] : undefined;

export const getFunctionTagHandler = (value: unknown): TemplateFunction | undefined => {
  if (getTagType(value) !== "function") return undefined;
  return (value as FunctionTag).func;
};

const isObject = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === "object" && value !== null;
