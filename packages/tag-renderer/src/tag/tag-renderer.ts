import { RenderContext } from "../runtime/index.js";
import type { TokenModule, TokenProvider } from "../runtime/index.js";
import { RenderProcessor } from "./render-processor.js";
import { TagTemplate } from "./tag-template.js";
import type { TokenIdHandler } from "./tag-template.js";

type TokenMap = Record<string, unknown>;

interface LoadedTokenIds extends TokenProvider {
  name: string;
  tokens: TokenMap;
  priority: number;
}

interface TokenIdProvider {
  name?: string;
  handler: TokenIdHandler;
  priority: number;
  loaded?: LoadedTokenIds;
}

interface TokenIdsWithMetadata {
  name?: string;
  tokens: TokenMap;
}

export interface TagRendererOptions {
  templateTags: readonly unknown[];
  tokenHandlers?: TokenIdHandler | TokenIdHandler[];
  templateDir?: string;
  routeOptions?: unknown;
  insertTokenIds?: boolean;
  [key: string]: unknown;
}

export class TagRenderer {
  readonly _options: TagRendererOptions;
  readonly _tokens: readonly unknown[];
  readonly _handlerContext: Record<string, unknown>;
  readonly handlersMap: Record<string, LoadedTokenIds>;
  _tokenHandlers: TokenIdProvider[];
  _tokenIdLookupMap: TokenMap;
  _processor?: RenderProcessor;
  _template?: TagTemplate;
  private readonly registeredTokenIds = new Set<symbol>();
  private _initializing?: Promise<void>;

  constructor(options: TagRendererOptions) {
    if (!Array.isArray(options.templateTags)) {
      throw new TypeError("@fynjs/tag-renderer: templateTags must be an array");
    }

    this._options = options;
    this._tokens = options.templateTags;
    this._tokenHandlers = [];
    this.handlersMap = Object.create(null) as Record<string, LoadedTokenIds>;
    this._tokenIdLookupMap = Object.create(null) as TokenMap;
    this._handlerContext = {
      user: { routeOptions: options.routeOptions },
      ...options,
    };

    const initialHandlers = Array.isArray(options.tokenHandlers)
      ? options.tokenHandlers
      : [options.tokenHandlers];
    for (const handler of initialHandlers) {
      if (handler) this.addTokenIds("", handler);
    }
  }

  async initializeRenderer(reset = false): Promise<void> {
    if (this._initializing) {
      await this._initializing;
      if (!reset) return;
    }
    if (!reset && this._processor) return;

    const initialize = async (): Promise<void> => {
      await this._initializeTokenHandlers(this._tokenHandlers);
      const processor = new RenderProcessor({
        asyncTemplate: this,
        insertTokenIds: this._options.insertTokenIds,
      });
      const template = new TagTemplate({
        templateTags: this._tokens,
        templateDir: this._options.templateDir,
        processor,
      });
      await processor.loadTokenModules(template);
      await template.initTagOpCode();
      this._processor = processor;
      this._template = template;
    };

    this._initializing = initialize();
    try {
      await this._initializing;
    } finally {
      this._initializing = undefined;
    }
  }

  lookupTokenHandler(token: Pick<TokenModule, "id">): unknown {
    const id = String(token.id);
    return Object.hasOwn(this._tokenIdLookupMap, id) ? this._tokenIdLookupMap[id] : undefined;
  }

  async render(options: Record<string, unknown> = {}): Promise<RenderContext> {
    const context = new RenderContext(options, this);
    try {
      await this.initializeRenderer(false);
      const result = await this._processor!.render(this._template!, context);
      context.result = context.isVoidStop ? context.voidResult : result;
    } catch (error) {
      context.handleError(error);
      context.result = error;
      context.error = error;
    }
    return context;
  }

  addTokenIds(name: string | undefined, handler: TokenIdHandler, priority = 0): void {
    this._tokenHandlers = this._tokenHandlers.filter((provider) => provider.handler !== handler);
    this._tokenHandlers.push({ name, handler, priority });
  }

  async registerTokenIds(
    name: string | undefined,
    uniqueId: symbol,
    handler: TokenIdHandler,
    priority = 0,
  ): Promise<void> {
    if (this.registeredTokenIds.has(uniqueId)) return;
    this.registeredTokenIds.add(uniqueId);
    this.addTokenIds(name, handler, priority);
    await this._initializeTokenHandlers(this._tokenHandlers);
  }

  async _initializeTokenHandlers(handlers: TokenIdProvider[]): Promise<void> {
    const loaded: LoadedTokenIds[] = [];

    for (let index = 0; index < handlers.length; index++) {
      const provider = handlers[index];
      if (!provider.loaded) {
        const result = await provider.handler(this._handlerContext, this);
        const configured = isTokenIdsWithMetadata(result)
          ? result
          : { tokens: requireTokenMap(result) };
        provider.loaded = {
          name: configured.name || provider.name || `unnamed-token-id-handler-${index}`,
          tokens: configured.tokens,
          priority: provider.priority,
        };
      }
      loaded.push(provider.loaded);
    }

    for (const name of Object.keys(this.handlersMap)) delete this.handlersMap[name];
    for (const provider of loaded) this.handlersMap[provider.name] = provider;

    const tokenLookup = Object.create(null) as TokenMap;
    for (const provider of [...loaded].sort((left, right) => left.priority - right.priority)) {
      for (const id of Object.keys(provider.tokens)) tokenLookup[id] = provider.tokens[id];
    }
    this._tokenIdLookupMap = tokenLookup;
  }
}

const isTokenIdsWithMetadata = (value: unknown): value is TokenIdsWithMetadata =>
  typeof value === "object" &&
  value !== null &&
  "tokens" in value &&
  typeof value.tokens === "object" &&
  value.tokens !== null;

const requireTokenMap = (value: unknown): TokenMap => {
  if (typeof value !== "object" || value === null) {
    throw new TypeError("@fynjs/tag-renderer: a token ID handler must return a token map");
  }
  return value as TokenMap;
};
