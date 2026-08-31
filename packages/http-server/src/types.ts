import type { AsyncEventEmitter } from "./async-event-emitter.js";
import type {
  FastifyServerOptions,
  FastifyPluginOptions,
  FastifyPluginCallback,
  FastifyInstance
} from "fastify";

export type {
  LightMyRequestChain,
  InjectOptions,
  LightMyRequestResponse,
  LightMyRequestCallback,
  FastifyRequest,
  RequestGenericInterface,
  FastifyReply,
  FastifyPluginCallback,
  FastifyPluginAsync,
  FastifyPluginOptions,
  FastifyListenOptions,
  FastifyInstance,
  PrintRoutesOptions,
  FastifyLoggerOptions,
  FastifyBaseLogger,
  FastifyLogFn,
  LogLevel,
  FastifyContextConfig,
  RouteHandler,
  RouteHandlerMethod,
  RouteOptions,
  RouteShorthandMethod,
  RouteShorthandOptions,
  RouteShorthandOptionsWithHandler,
  RouteGenericInterface,
  FastifyRegister,
  FastifyRegisterOptions,
  RegisterOptions,
  FastifyBodyParser,
  FastifyContentTypeParser,
  AddContentTypeParser,
  hasContentTypeParser,
  getDefaultJsonParser,
  ProtoAction,
  ConstructorAction,
  FastifyError,
  FastifySchema,
  FastifySchemaCompiler,
  HTTPMethods,
  RawServerBase,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  RawServerDefault,
  ContextConfigDefault,
  RequestBodyDefault,
  RequestQuerystringDefault,
  RequestParamsDefault,
  RequestHeadersDefault,
  DoneFuncWithErrOrRes,
  HookHandlerDoneFunction,
  RequestPayload,
  onCloseAsyncHookHandler,
  onCloseHookHandler,
  onErrorAsyncHookHandler,
  onErrorHookHandler,
  onReadyAsyncHookHandler,
  onReadyHookHandler,
  onRegisterHookHandler,
  onRequestAsyncHookHandler,
  onRequestHookHandler,
  onResponseAsyncHookHandler,
  onResponseHookHandler,
  onRouteHookHandler,
  onSendAsyncHookHandler,
  onSendHookHandler,
  onTimeoutAsyncHookHandler,
  onTimeoutHookHandler,
  preHandlerAsyncHookHandler,
  preHandlerHookHandler,
  preParsingAsyncHookHandler,
  preParsingHookHandler,
  preSerializationAsyncHookHandler,
  preSerializationHookHandler,
  preValidationAsyncHookHandler,
  preValidationHookHandler,
  FastifyServerFactory,
  FastifyServerFactoryHandler,
  FastifyTypeProvider,
  FastifyTypeProviderDefault,
  FastifyErrorCodes
} from "fastify";

/**
 * The live address info of a listening server.
 */
export type ServerInfo = { address: string; port: number };

/**
 * A fastify instance with this module's added decorations.
 */
export interface FynHttpServerInstance extends FastifyInstance {
  /** live `{ address, port }` of the underlying node server */
  info: ServerInfo;
  /** start listening - only useful when `config.deferStart` is `true` */
  start: () => Promise<any>;
  /** application scope, seeded with the composed `config` */
  app: { config: any } & Record<string, any>;
}

/**
 * Specify a plugin to register for fastify
 */
export type PluginOptions = {
  /**
   * determine the order this plugin gets register, lower the value, earlier it's register
   */
  priority?: number;

  /**
   * Set to `false` to disable this plugin
   *
   * - **Default**: `true`
   * - useful for multi env config composition to disable a plugin for certain env
   */
  enable?: boolean;

  /**
   * The path as the origin dir to call require to load the module for this plugin
   */
  requireFromPath?: string;

  /**
   * name/path of the module to load the plugin's register
   *
   * - If this is not set, then use the field name of this plugin within plugin config
   *   as the module name.
   * - Set to `false` to require that `register` is given directly.
   */
  module?: string | false | { name: string; requireFromPath?: string };

  /**
   * Use this to specify the plugin's register function directly
   *
   * - If this is set, then `module` field is ignored.
   */
  register?: FastifyPluginCallback;

  /**
   * options that will be passed to the plugin's register function
   */
  options?: FastifyPluginOptions;

  /**
   * Set to `false` to skip wrapping the plugin's register with `fastify-plugin`,
   * or pass options to forward to `fastify-plugin`.
   */
  fastifyPluginDecorate?: false | Record<string, any>;
};

/**
 * Plugins config for specifying plugins that will register with fastify
 */
export type PluginsConfig =
  | Record<string, PluginOptions>
  | {
      /**
       * The path as the origin dir to call require to load any plugin modules.
       * - Note: this means you would not be able to specify a plugin with this key.
       */
      requireFromPath?: string;
    };

/**
 * Connection params for fastify
 */
export type ConnectionConfig = {
  /** hostname for server */
  host?: string;
  /** IP address to listen on. **Default**: `"0.0.0.0"` */
  address?: string;
  /** port number to listen on */
  port?: number;
};

/**
 * settings specific to this module's add-ons for the fastify server
 */
export type ElectrodeOptions = {
  /** timeout in milliseconds to wait for events such as register plugins. **Default**: `10000` */
  eventTimeout?: number;
  /** keep alive connection timeout in milliseconds. **Default**: `60000` */
  keepAliveTimeout?: number;
  /** which internal config file contributed last */
  source?: string;
  [key: string]: any;
};

/**
 * The names of the lifecycle events emitted while starting the server, in order.
 */
export type ServerEvent =
  | "config-composed"
  | "server-created"
  | "plugins-sorted"
  | "plugins-registered"
  | "server-started"
  | "complete";

/**
 * Config for starting a fastify server with this module's add-ons
 */
export type FynHttpServerConfig = {
  /** if `true` then don't call start on the fastify server so user code can add routes and call start after */
  deferStart?: boolean;
  /** specify connection params for fastify */
  connection?: ConnectionConfig;
  /**
   * specify plugins that will register with fastify
   *
   * - normally, specifying a simple plugin can be done simply as:
   *
   * ```js
   * {
   *   requireFromPath: import.meta.dirname,
   *   "./plugins/demo-plugin": {}
   * }
   * ```
   */
  plugins?: PluginsConfig;
  /**
   * options to be passed to fastify verbatim
   *
   * **Note:**
   * - `requestIdHeader` defaults to `false` in Fastify 5
   * - Router options like `maxParamLength`, `ignoreTrailingSlash`, etc. belong
   *   under `routerOptions`
   */
  server?: FastifyServerOptions;
  /** settings specific to this module's add-ons for the fastify server */
  electrode?: ElectrodeOptions;
  /** hook to register handlers for the lifecycle events */
  listener?: (emitter: AsyncEventEmitter) => void;
};

/** back compat alias for the config type */
export type ElectrodeServerConfig = FynHttpServerConfig;

export type { EventHandler } from "./async-event-emitter.js";
