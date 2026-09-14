import { loadTokenModuleHandler } from "./load-handler.js";
import { TEMPLATE_DIR, TOKEN_HANDLER } from "./symbols.js";
import type {
  TokenHandler,
  TokenModuleFactory,
  TokenModuleId,
  TokenModuleInstance,
  TokenModuleLoader,
  TokenModuleNamespace,
  TokenProperties,
} from "./types.js";

function parseModulePath(id: TokenModuleId): string | undefined {
  if (typeof id !== "string") return undefined;
  const requireMatch = id.match(/^require\(\s*['"]?([^'")]+)['"]?\s*\)$/);
  if (requireMatch) return requireMatch[1];
  if (id.startsWith("#")) return id.slice(1);
  return undefined;
}

function moduleCall(props: TokenProperties): readonly [string, readonly unknown[]] | undefined {
  if (typeof props._call === "string") return [props._call, []];
  if (Array.isArray(props._call)) return [props._call[0], props._call[1] ?? []];
  return undefined;
}

export class TokenModule {
  readonly id: TokenModuleId;
  readonly pos: number;
  readonly props: TokenProperties;
  readonly modPath?: string;
  readonly isModule: boolean;
  custom: TokenModuleInstance | null | undefined;
  wantsNext: boolean | undefined;
  [TEMPLATE_DIR]: string;
  [TOKEN_HANDLER]: TokenHandler | null = null;

  private injectedModule?: TokenModuleLoader;
  private readonly call?: readonly [string, readonly unknown[]];

  constructor(
    id: TokenModuleId,
    pos: number,
    props: TokenProperties | null = null,
    templateDir: string | null = null,
  ) {
    this.id = id;
    this.pos = pos;
    this.props = props ?? {};
    this.modPath = parseModulePath(id);
    this.isModule = this.modPath !== undefined;
    this.call = moduleCall(this.props);
    this[TEMPLATE_DIR] =
      (this.props[TEMPLATE_DIR] as string | undefined) ?? templateDir ?? process.cwd();
  }

  set tokenMod(module: TokenModuleLoader) {
    this.injectedModule = module;
  }

  async load(options: unknown = {}): Promise<void> {
    if (!this.isModule || this.custom !== undefined) return;

    const loaded =
      this.injectedModule ??
      (await loadTokenModuleHandler(this.modPath as string, this[TEMPLATE_DIR], this.call?.[0]));

    let instance: TokenModuleInstance | null;
    if (this.call) {
      const namespace = loaded as TokenModuleNamespace;
      const setup = namespace[this.call[0]];
      if (typeof setup !== "function") {
        throw new TypeError(
          `@fynjs/tag-renderer: _call of token ${this.id} - '${this.call[0]}' not found`,
        );
      }
      instance = await setup(options, this, ...this.call[1]);
    } else {
      if (typeof loaded !== "function") {
        throw new TypeError(`@fynjs/tag-renderer: token ${this.id} has no factory`);
      }
      instance = await (loaded as TokenModuleFactory)(options, this);
    }

    this.custom = instance;
    if (instance === null) return;
    if (!instance || typeof instance.process !== "function") {
      throw new TypeError(`custom token ${this.id} module doesn't have process method`);
    }

    this.wantsNext = instance.process.length > 1;
    this.setHandler((context) => instance.process(context, this));
  }

  setHandler(handler: TokenHandler): void {
    this[TOKEN_HANDLER] = handler;
  }
}
