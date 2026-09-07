export interface RetryOptions {
  /**
   * Number of retry attempts (default: 0, no retry)
   */
  retries?: number;
  /**
   * Initial delay in milliseconds before the first retry (default: 500ms)
   */
  minTimeout?: number;
  /**
   * Exponential backoff factor (default: 2)
   */
  factor?: number;
  /**
   * Maximum backoff delay in milliseconds (default: 10_000ms)
   */
  maxTimeout?: number;
  /**
   * HTTP status codes that trigger a retry.
   * Default: [408, 429, 500, 502, 503, 504]
   */
  statusCodes?: number[];
  /**
   * Custom predicate to determine whether to retry.
   * Returns true to retry, false to stop.
   */
  retryOn?: (err: Error | null, res: Response | null) => boolean;
}

export type SearchParamsInit =
  | string
  | URLSearchParams
  | Record<string, string | number | boolean | undefined | null>;

export interface BeforeRetryContext {
  error: Error | null;
  response: Response | null;
  attempt: number;
  options: FynFetchOptions;
}

export interface FynFetchHooks {
  /**
   * Executed before sending a request. Can modify options or return a Response to short-circuit.
   */
  beforeRequest?: ((
    options: FynFetchOptions,
    url: string
  ) => void | Response | Promise<void | Response>)[];
  /**
   * Executed before retrying a failed request.
   */
  beforeRetry?: ((context: BeforeRetryContext) => void | Promise<void>)[];
  /**
   * Executed after receiving a response. Can inspect response or return a replacement Response.
   */
  afterResponse?: ((
    response: Response,
    options: FynFetchOptions
  ) => Response | void | Promise<Response | void>)[];
}

export interface FynFetchOptions extends Omit<RequestInit, "body"> {
  /**
   * Request body. Supports standard RequestInit body, Node.js Readable streams, or null.
   */
  body?: RequestInit["body"] | NodeJS.ReadableStream | null;
  /**
   * Node.js fetch duplex option. Auto-detected as 'half' for streams.
   */
  duplex?: "half";
  /**
   * Timeout in milliseconds. Merged with any caller-supplied `signal`.
   */
  timeout?: number;
  /**
   * Retry configuration or integer count of retries.
   */
  retry?: number | RetryOptions;
  /**
   * Automatically throw `HttpError` when `!res.ok`.
   * Default: false (except in .json(), .text(), .buffer(), etc. where default is true)
   */
  throwOnHttpError?: boolean;
  /**
   * Factory function to generate a fresh body for streaming retries.
   */
  bodyFactory?: () => RequestInit["body"] | Promise<RequestInit["body"]>;

  // Ky-inspired features
  /**
   * Base URL to prepend to relative URL paths.
   */
  prefixUrl?: string | URL;
  /**
   * Query parameters to append to the URL.
   */
  searchParams?: SearchParamsInit;
  /**
   * Shortcut to send JSON body. Automatically stringifies and sets
   * `Content-Type: application/json` and `Accept: application/json` if unset.
   */
  json?: any;
  /**
   * Request lifecycle hooks.
   */
  hooks?: FynFetchHooks;

  // Needle-inspired features
  /**
   * Shortcut to send `application/x-www-form-urlencoded` body.
   */
  form?: Record<string, any> | URLSearchParams;
  /**
   * Username for HTTP Basic Authentication.
   */
  username?: string;
  /**
   * Password for HTTP Basic Authentication.
   */
  password?: string;
  /**
   * Key-value map of cookies to set in the `Cookie` header.
   */
  cookies?: Record<string, string>;
}

export interface FynFetchInstance {
  (url: string | URL, options?: FynFetchOptions): Promise<Response>;

  // HTTP verb shortcuts
  get(url: string | URL, options?: FynFetchOptions): Promise<Response>;
  post(url: string | URL, options?: FynFetchOptions): Promise<Response>;
  put(url: string | URL, options?: FynFetchOptions): Promise<Response>;
  patch(url: string | URL, options?: FynFetchOptions): Promise<Response>;
  delete(url: string | URL, options?: FynFetchOptions): Promise<Response>;
  head(url: string | URL, options?: FynFetchOptions): Promise<Response>;

  // Body shortcuts
  json<T = any>(url: string | URL, options?: FynFetchOptions): Promise<T>;
  text(url: string | URL, options?: FynFetchOptions): Promise<string>;
  buffer(url: string | URL, options?: FynFetchOptions): Promise<Buffer>;
  arrayBuffer(url: string | URL, options?: FynFetchOptions): Promise<ArrayBuffer>;
  blob(url: string | URL, options?: FynFetchOptions): Promise<Blob>;

  // Stream & socket drain
  stream(
    url: string | URL,
    destination: string | NodeJS.WritableStream,
    options?: FynFetchOptions
  ): Promise<Response>;
  drain(res: Response | null | undefined): Promise<void>;

  // Factory / configuration
  create(defaultOptions?: FynFetchOptions): FynFetchInstance;
  extend(defaultOptions?: FynFetchOptions): FynFetchInstance;
  defaults: FynFetchOptions;
}
