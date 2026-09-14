import { TOKEN_HANDLER, TokenModule } from "../runtime/index.js";
import type { RenderContext, TokenHandler } from "../runtime/index.js";
import { executeTagTemplate, executeSteps } from "./render-execute.js";
import type { TagRenderer } from "./tag-renderer.js";
import {
  TagTemplate,
  createTemplateTagsFromArray,
  getFunctionTagHandler,
  getTagType,
  isTemplateTags,
} from "./tag-template.js";

export { executeSteps } from "./render-execute.js";

type ExecuteStepCode = (typeof executeSteps)[keyof typeof executeSteps];

export interface RenderStep {
  code: ExecuteStepCode;
  token?: TokenModule;
  data?: unknown;
  handler?: TokenHandler;
  template?: TagTemplate;
  insertTokenId?: boolean;
}

export class RenderProcessor {
  readonly _insertTokenIds: boolean;
  readonly _renderer: TagRenderer;

  constructor(options: { insertTokenIds?: boolean; asyncTemplate: TagRenderer }) {
    this._insertTokenIds = Boolean(options.insertTokenIds);
    this._renderer = options.asyncTemplate;
  }

  async loadTokenModules(template: TagTemplate): Promise<void> {
    for (const tag of template._templateTags) {
      if (tag instanceof TokenModule) {
        await tag.load({ ...this._renderer._handlerContext, ...this._renderer._options });
      }
    }
  }

  makeNullRemovedStep(token: TokenModule, cause: string): RenderStep {
    return {
      token,
      insertTokenId: false,
      code: executeSteps.STEP_LITERAL_HANDLER,
      data: `<!-- ${String(token.id)} removed due to its ${cause} -->\n`,
    };
  }

  makeHandlerStep(token: TokenModule): RenderStep | null {
    const handler = this._renderer.lookupTokenHandler(token);
    if (handler === null) {
      return this._insertTokenIds ? this.makeNullRemovedStep(token, "handler set to null") : null;
    }
    if (handler === undefined) {
      return { token, code: executeSteps.STEP_NO_HANDLER };
    }
    if (typeof handler !== "function") {
      return {
        token,
        code: executeSteps.STEP_LITERAL_HANDLER,
        insertTokenId: this._insertTokenIds && !token.props._noInsertId,
        data: handler,
      };
    }

    return {
      token,
      code: executeSteps.STEP_HANDLER,
      handler: handler as TokenHandler,
      insertTokenId: this._insertTokenIds && !token.props._noInsertId,
    };
  }

  async makeStep(tag: unknown, templateDir?: string): Promise<RenderStep | null> {
    if (tag === null || tag === undefined || tag === false || tag === "") return null;

    const tagType = getTagType(tag);
    if (tagType === "function") {
      return { code: executeSteps.STEP_FUNC_HANDLER, handler: getFunctionTagHandler(tag) };
    }
    if (tagType === "register-token-ids") {
      await (tag as (context: { asyncTemplate: TagRenderer }) => void | Promise<void>)({
        asyncTemplate: this._renderer,
      });
      return null;
    }
    if (isTemplateTags(tag) || Array.isArray(tag)) {
      const tags = isTemplateTags(tag) ? tag : createTemplateTagsFromArray(tag);
      const template = new TagTemplate({ templateTags: tags, templateDir, processor: this });
      await this.loadTokenModules(template);
      await template.initTagOpCode();
      return { code: executeSteps.STEP_SUB_TEMPLATE, template };
    }
    if (isRecord(tag) && typeof tag.str === "string") {
      return { code: executeSteps.STEP_STR_TOKEN, data: tag.str };
    }
    if (typeof tag === "string" || Buffer.isBuffer(tag)) {
      return { code: executeSteps.STEP_LITERAL_HANDLER, data: tag };
    }
    if (!(tag instanceof TokenModule)) return null;

    if (!tag.isModule) return this.makeHandlerStep(tag);
    if (tag.custom === null) {
      return this._insertTokenIds ? this.makeNullRemovedStep(tag, "process return null") : null;
    }

    return {
      token: tag,
      code: executeSteps.STEP_HANDLER,
      handler: getTokenHandler(tag) ?? undefined,
      insertTokenId: this._insertTokenIds && !tag.props._noInsertId,
    };
  }

  render(template: TagTemplate, context: RenderContext): Promise<unknown> {
    return executeTagTemplate(template, context);
  }
}

export const getTokenHandler = (token: TokenModule): TokenHandler | null => token[TOKEN_HANDLER];

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === "object" && value !== null;
