import { RenderContext } from "../runtime/index.js";
import type { RenderContextOptions, TokenModule, TokenProvider } from "../runtime/index.js";
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
  order: number;
  unnamedIndex: number;
  loaded?: LoadedTokenIds;
}

interface TokenWinner {
  order: number;
  priority: number;
  value: unknown;
}

interface PreparedTokenProvider {
  entries: Array<[string, unknown]>;
  loaded: LoadedTokenIds;
  provider: TokenIdProvider;
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
  deferConcurrency?: number;
  [key: string]: unknown;
}

export interface TagRenderStream {
  readonly stream: NodeJS.ReadableStream;
  readonly context: RenderContext;
  readonly completed: Promise<RenderContext>;
  readonly finished: Promise<RenderContext>;
  abort(reason?: unknown): void;
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
  private pendingTokenProviders: TokenIdProvider[] = [];
  private readonly tokenProvidersByHandler = new Map<TokenIdHandler, TokenIdProvider>();
  private readonly tokenWinners = new Map<string, TokenWinner>();
  private readonly appliedTokenProviders = new Set<TokenIdProvider>();
  private nextProviderOrder = 0;
  private registryNeedsRebuild = false;
  private readonly tokenIdRegistrations = new Map<symbol, Promise<void>>();
  private registrationTail: Promise<void> = Promise.resolve();
  private _initializing?: Promise<void>;
  private readonly deferConcurrency: number;

  constructor(options: TagRendererOptions) {
    if (!Array.isArray(options.templateTags)) {
      throw new TypeError("@fynjs/tag-renderer: templateTags must be an array");
    }
    if (
      options.deferConcurrency !== undefined &&
      (!Number.isInteger(options.deferConcurrency) || options.deferConcurrency < 1)
    ) {
      throw new TypeError("@fynjs/tag-renderer: deferConcurrency must be a positive integer");
    }

    this._options = options;
    this._tokens = options.templateTags;
    this.deferConcurrency = options.deferConcurrency ?? 8;
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
      await this._initializeTokenHandlers(this.pendingTokenProviders);
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

  render(options: RenderContextOptions = {}): Promise<RenderContext> {
    const context = new RenderContext(options, this, this.deferConcurrency);
    return this.executeRender(context);
  }

  renderStream(options: RenderContextOptions = {}): TagRenderStream {
    const context = new RenderContext(options, this, this.deferConcurrency);
    const stream = context.setMunchyOutput();
    context.output.flush();
    context.result = stream;

    let resolveStreamFinished!: () => void;
    let streamFinished = false;
    const streamCompletion = new Promise<void>((resolve) => {
      resolveStreamFinished = resolve;
    });
    const finishStream = (): void => {
      if (streamFinished) return;
      streamFinished = true;
      resolveStreamFinished();
    };
    const onError = (error: Error): void => context._handleOutputError(error);
    const onEnd = (): void => finishStream();
    const onClose = (): void => {
      if (!stream.readableEnded) context._handleOutputError(new Error("Render stream destroyed"));
      stream.removeListener("error", onError);
      stream.removeListener("end", onEnd);
      finishStream();
    };
    stream.on("error", onError);
    stream.once("end", onEnd);
    stream.once("close", onClose);

    const completed = new Promise<RenderContext>((resolve) => {
      queueMicrotask(() => {
        void this.executeRender(context).then((result) => {
          resolve(result);
        });
      });
    });
    const finished = Promise.all([completed, streamCompletion]).then(([result]) => result);

    return {
      stream,
      context,
      completed,
      finished,
      abort: (reason?: unknown) => context.abort(reason),
    };
  }

  private async executeRender(context: RenderContext): Promise<RenderContext> {
    try {
      if (context.options.signal?.aborted) context.abort(context.options.signal.reason);
      if (context.signal.aborted) throw context.signal.reason;
      if (!this._processor || this._initializing) {
        await context._awaitSuspension(this.initializeRenderer(false));
      }
      if (context.signal.aborted) throw context.signal.reason;
      const result = await context._awaitSuspension(
        this._processor!.render(this._template!, context),
      );
      context.result = context.isVoidStop ? context.voidResult : result;
    } catch (error) {
      context.handleError(error);
      context.result = context.error;
    }
    return context;
  }

  addTokenIds(name: string | undefined, handler: TokenIdHandler, priority = 0): void {
    this.addTokenProvider(name, handler, priority);
  }

  async registerTokenIds(
    name: string | undefined,
    uniqueId: symbol,
    handler: TokenIdHandler,
    priority = 0,
  ): Promise<void> {
    const existing = this.tokenIdRegistrations.get(uniqueId);
    if (existing) return existing;

    const registration = this.registrationTail.then(async () => {
      const previousProvider = this.tokenProvidersByHandler.get(handler);
      const previousIndex = previousProvider ? this._tokenHandlers.indexOf(previousProvider) : -1;
      const previousPendingIndex = previousProvider
        ? this.pendingTokenProviders.indexOf(previousProvider)
        : -1;
      const previousNeedsRebuild = this.registryNeedsRebuild;
      const previousNextOrder = this.nextProviderOrder;
      const provider = this.addTokenProvider(name, handler, priority);
      try {
        await this._initializeTokenHandlers(this.pendingTokenProviders);
      } catch (error) {
        this._tokenHandlers = this._tokenHandlers.filter((entry) => entry !== provider);
        this.pendingTokenProviders = this.pendingTokenProviders.filter(
          (entry) => entry !== provider,
        );
        if (previousProvider) {
          this._tokenHandlers.splice(previousIndex, 0, previousProvider);
          if (previousPendingIndex >= 0) {
            this.pendingTokenProviders.splice(previousPendingIndex, 0, previousProvider);
          }
          this.tokenProvidersByHandler.set(handler, previousProvider);
        } else {
          this.tokenProvidersByHandler.delete(handler);
        }
        this.registryNeedsRebuild = previousNeedsRebuild;
        this.nextProviderOrder = previousNextOrder;
        throw error;
      }
    });

    this.tokenIdRegistrations.set(uniqueId, registration);
    this.registrationTail = registration.catch(() => undefined);

    try {
      await registration;
    } catch (error) {
      this.tokenIdRegistrations.delete(uniqueId);
      throw error;
    }
  }

  async _initializeTokenHandlers(handlers: TokenIdProvider[]): Promise<void> {
    const pending = [...handlers];
    const prepared: PreparedTokenProvider[] = [];
    for (const provider of pending) {
      let loaded = provider.loaded;
      if (!loaded) {
        const result = await provider.handler(this._handlerContext, this);
        const configured = isTokenIdsWithMetadata(result)
          ? result
          : { tokens: requireTokenMap(result) };
        loaded = {
          name:
            configured.name || provider.name || `unnamed-token-id-handler-${provider.unnamedIndex}`,
          tokens: configured.tokens,
          priority: provider.priority,
        };
      }
      prepared.push({ provider, loaded, entries: Object.entries(loaded.tokens) });
    }

    for (const { provider, loaded } of prepared) provider.loaded = loaded;
    if (this.registryNeedsRebuild) {
      this.rebuildTokenRegistry();
    } else {
      for (const provider of prepared) this.applyTokenProvider(provider);
    }
    const processed = new Set(pending);
    this.pendingTokenProviders = this.pendingTokenProviders.filter(
      (provider) => !processed.has(provider),
    );
  }

  private addTokenProvider(
    name: string | undefined,
    handler: TokenIdHandler,
    priority: number,
  ): TokenIdProvider {
    const previous = this.tokenProvidersByHandler.get(handler);
    if (previous) {
      this._tokenHandlers = this._tokenHandlers.filter((provider) => provider !== previous);
      this.pendingTokenProviders = this.pendingTokenProviders.filter(
        (provider) => provider !== previous,
      );
      if (this.appliedTokenProviders.has(previous)) this.registryNeedsRebuild = true;
    }

    const provider: TokenIdProvider = {
      name,
      handler,
      priority,
      order: this.nextProviderOrder++,
      unnamedIndex: this._tokenHandlers.length,
    };
    this._tokenHandlers.push(provider);
    this.pendingTokenProviders.push(provider);
    this.tokenProvidersByHandler.set(handler, provider);
    return provider;
  }

  private applyTokenProvider(prepared: PreparedTokenProvider): void {
    const { entries, loaded, provider } = prepared;
    if (this.appliedTokenProviders.has(provider)) return;

    this.handlersMap[loaded.name] = loaded;
    for (const [id, value] of entries) {
      const winner = this.tokenWinners.get(id);
      if (
        !winner ||
        provider.priority > winner.priority ||
        (provider.priority === winner.priority && provider.order > winner.order)
      ) {
        this.tokenWinners.set(id, {
          order: provider.order,
          priority: provider.priority,
          value,
        });
        this._tokenIdLookupMap[id] = value;
      }
    }
    this.appliedTokenProviders.add(provider);
  }

  private rebuildTokenRegistry(): void {
    const handlersMap = Object.create(null) as Record<string, LoadedTokenIds>;
    const tokenLookup = Object.create(null) as TokenMap;
    const tokenWinners = new Map<string, TokenWinner>();
    const prepared = this._tokenHandlers.map((provider) => {
      if (!provider.loaded) {
        throw new Error("@fynjs/tag-renderer: cannot rebuild an unloaded token provider");
      }
      return { provider, loaded: provider.loaded, entries: Object.entries(provider.loaded.tokens) };
    });

    for (const { entries, loaded, provider } of prepared) {
      handlersMap[loaded.name] = loaded;
      for (const [id, value] of entries) {
        const winner = tokenWinners.get(id);
        if (
          !winner ||
          provider.priority > winner.priority ||
          (provider.priority === winner.priority && provider.order > winner.order)
        ) {
          tokenWinners.set(id, {
            order: provider.order,
            priority: provider.priority,
            value,
          });
          tokenLookup[id] = value;
        }
      }
    }

    for (const name of Object.keys(this.handlersMap)) delete this.handlersMap[name];
    Object.assign(this.handlersMap, handlersMap);
    this._tokenIdLookupMap = tokenLookup;
    this.tokenWinners.clear();
    for (const [id, winner] of tokenWinners) this.tokenWinners.set(id, winner);
    this.appliedTokenProviders.clear();
    for (const provider of this._tokenHandlers) this.appliedTokenProviders.add(provider);
    this.registryNeedsRebuild = false;
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
