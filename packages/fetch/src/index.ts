import { HttpError, TimeoutError } from "./errors.js";
import { drain } from "./drain.js";
import { stream } from "./stream.js";
import { mergeOptions, prepareRequest, isStream } from "./options.js";
import { buildUrl } from "./url.js";
import type {
  FynFetchOptions,
  RetryOptions,
  FynFetchInstance,
  FynFetchHooks,
  BeforeRetryContext,
  SearchParamsInit,
} from "./types.js";

export { HttpError, TimeoutError };
export { drain };
export { stream };
export type {
  FynFetchOptions,
  RetryOptions,
  FynFetchInstance,
  FynFetchHooks,
  BeforeRetryContext,
  SearchParamsInit,
};

const DEFAULT_RETRY_STATUSES = [408, 429, 500, 502, 503, 504];

/**
 * Methods retried by default. Non-idempotent methods (POST, PATCH) are skipped
 * because a retry can double-submit if the server processed the first attempt
 * before failing. Opt them in with an explicit `retry.retryOn` predicate.
 */
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "PUT", "DELETE", "OPTIONS", "TRACE"]);

/** Fraction of the computed delay added as random jitter to desynchronize retries. */
const JITTER_RATIO = 0.25;

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  if (!signal) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? new Error("Aborted"));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason ?? new Error("Aborted"));
    };

    signal.addEventListener("abort", onAbort);
  });
}

type ResolvedRetry = Required<Omit<RetryOptions, "retryOn">> & {
  retryOn?: RetryOptions["retryOn"];
};

function resolveRetryOptions(retry: number | RetryOptions | undefined): ResolvedRetry | null {
  if (retry === undefined || retry === 0) {
    return null;
  }

  const raw: RetryOptions = typeof retry === "number" ? { retries: retry } : retry;
  const retries = raw.retries ?? 0;

  if (!Number.isInteger(retries) || retries < 0) {
    throw new TypeError(
      `'retry.retries' must be a non-negative integer, received ${String(retries)}`
    );
  }

  return {
    retries,
    minTimeout: raw.minTimeout ?? 500,
    factor: raw.factor ?? 2,
    maxTimeout: raw.maxTimeout ?? 10_000,
    statusCodes: raw.statusCodes ?? DEFAULT_RETRY_STATUSES,
    retryOn: raw.retryOn,
  };
}

/**
 * Parses a `Retry-After` header (delta-seconds or HTTP-date) into milliseconds.
 */
function parseRetryAfter(res: Response | null): number | null {
  const raw = res?.headers.get("retry-after");
  if (!raw) return null;

  const seconds = Number(raw);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const at = Date.parse(raw);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

/**
 * Exponential backoff, overridden by a server `Retry-After` when present.
 * Both are capped by `maxTimeout` and carry additive jitter.
 */
function computeBackoff(config: ResolvedRetry, attempt: number, res: Response | null): number {
  const retryAfter = parseRetryAfter(res);
  const base =
    retryAfter !== null
      ? Math.min(retryAfter, config.maxTimeout)
      : Math.min(config.minTimeout * Math.pow(config.factor, attempt - 1), config.maxTimeout);

  return base + Math.random() * base * JITTER_RATIO;
}

/** Whether the default (non-`retryOn`) policy permits retrying this method. */
function isRetryableMethod(method: string | undefined): boolean {
  return IDEMPOTENT_METHODS.has((method ?? "GET").toUpperCase());
}

/**
 * Runs `afterResponse` hooks and applies `throwOnHttpError`. Shared by real
 * responses and by `beforeRequest` short-circuit responses so both observe the
 * same lifecycle. Drains the body if a hook throws, so the socket is released.
 */
async function finalizeResponse(
  res: Response,
  options: FynFetchOptions,
  hooks: FynFetchHooks | undefined,
  throwOnHttpError: boolean
): Promise<Response> {
  let current = res;

  if (hooks?.afterResponse) {
    for (const hook of hooks.afterResponse) {
      let hookRes: Response | void;
      try {
        hookRes = await hook(current, options);
      } catch (err) {
        await drain(current).catch(() => {});
        throw err;
      }
      if (hookRes instanceof Response && hookRes !== current) {
        await drain(current);
        current = hookRes;
      }
    }
  }

  if (throwOnHttpError && !current.ok) {
    throw await HttpError.fromResponse(current);
  }

  return current;
}

async function executeFetch(
  url: string | URL,
  options: FynFetchOptions = {}
): Promise<Response> {
  // Run beforeRequest hooks if present. The hook sees the fully resolved target
  // URL (prefixUrl + searchParams applied), re-derived each time so a hook that
  // mutates those options is reflected in what the next hook observes.
  if (options.hooks?.beforeRequest) {
    for (const hook of options.hooks.beforeRequest) {
      const hookUrl = buildUrl(url, options.prefixUrl, options.searchParams);
      const hookRes = await hook(options, hookUrl);
      if (hookRes instanceof Response) {
        // Short-circuit responses still run afterResponse and throwOnHttpError.
        return finalizeResponse(
          hookRes,
          options,
          options.hooks,
          options.throwOnHttpError ?? false
        );
      }
    }
  }

  const initialPrep = prepareRequest(url, options);
  const retryConfig = resolveRetryOptions(initialPrep.retry);
  if (
    retryConfig &&
    retryConfig.retries > 0 &&
    initialPrep.init.body &&
    isStream(initialPrep.init.body) &&
    !initialPrep.bodyFactory
  ) {
    throw new TypeError(
      "Cannot retry a request with a streaming body without 'bodyFactory'. Provide a 'bodyFactory' function or disable retries."
    );
  }
  const maxAttempts = (retryConfig?.retries ?? 0) + 1;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // 1. Reuse the prep built above for the first attempt; rebuild afterwards so
    //    beforeRetry mutations take effect.
    const {
      targetUrl,
      init,
      timeout,
      throwOnHttpError,
      bodyFactory,
      hooks,
    } = attempt === 1 ? initialPrep : prepareRequest(url, options);

    // 2. Prepare body if using factory
    const currentInit: any = { ...init };
    if (bodyFactory && (attempt > 1 || !currentInit.body)) {
      const newBody = await bodyFactory();
      currentInit.body = newBody;
      if (newBody && isStream(newBody) && !(currentInit as any).duplex) {
        (currentInit as any).duplex = "half";
      }
    }

    // 3. Setup timeout controller and combine with caller signal
    const timeoutController = new AbortController();
    let timeoutTimer: NodeJS.Timeout | undefined;
    let timedOut = false;

    if (timeout && timeout > 0) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        timeoutController.abort(
          new TimeoutError(timeout, `Request to ${targetUrl} timed out after ${timeout}ms`)
        );
      }, timeout);
      // The timer stays armed past the response headers so it also bounds the
      // body read; unref it so a pending deadline never holds the process open.
      timeoutTimer.unref?.();
    }

    const clearTimeoutTimer = () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = undefined;
      }
    };

    const signals: AbortSignal[] = [timeoutController.signal];
    if (init.signal) {
      signals.push(init.signal);
    }
    const effectiveSignal =
      signals.length === 1
        ? signals[0]
        : (AbortSignal as any).any(signals);

    currentInit.signal = effectiveSignal;

    let res: Response | null = null;
    try {
      lastError = null;
      res = await fetch(targetUrl, currentInit);
    } catch (err: any) {
      lastError = err;
      clearTimeoutTimer();
      if (timedOut || timeoutController.signal.aborted) {
        if (!init.signal || !init.signal.aborted) {
          lastError = new TimeoutError(
            timeout!,
            `Request to ${targetUrl} timed out after ${timeout}ms`
          );
        }
      }
    }

    // Handle network / fetch errors
    if (!res) {
      // If caller's own signal was aborted, do not retry
      if (init.signal?.aborted) {
        throw lastError;
      }

      if (retryConfig && attempt < maxAttempts) {
        const shouldRetry = retryConfig.retryOn
          ? retryConfig.retryOn(lastError, null)
          : isRetryableMethod(init.method);

        if (shouldRetry) {
          if (hooks?.beforeRetry) {
            for (const hook of hooks.beforeRetry) {
              await hook({ error: lastError, response: null, attempt, options });
            }
          }
          await sleep(computeBackoff(retryConfig, attempt, null), init.signal);
          continue;
        }
      }

      throw lastError;
    }

    // Check if retry is needed based on response status
    if (retryConfig && attempt < maxAttempts) {
      const shouldRetry = retryConfig.retryOn
        ? retryConfig.retryOn(null, res)
        : retryConfig.statusCodes.includes(res.status) && isRetryableMethod(init.method);

      if (shouldRetry) {
        const backoff = computeBackoff(retryConfig, attempt, res);
        await drain(res);
        clearTimeoutTimer();
        if (hooks?.beforeRetry) {
          for (const hook of hooks.beforeRetry) {
            await hook({ error: null, response: res, attempt, options });
          }
        }
        await sleep(backoff, init.signal);
        continue;
      }
    }

    // Non-retryable response (or exhausted retries). The timeout stays armed
    // across the body read, so only clear it once we know we are not returning
    // this response to the caller.
    try {
      return await finalizeResponse(res, options, hooks, throwOnHttpError);
    } catch (err) {
      clearTimeoutTimer();
      throw err;
    }
  }

  /* c8 ignore next 3 -- unreachable: the final attempt always returns or throws,
     and `retries` is validated to a non-negative integer above. */
  throw lastError ?? new Error(`Request failed after ${maxAttempts} attempts`);
}

export function createInstance(defaultOptions: FynFetchOptions = {}): FynFetchInstance {
  const instance = async function (
    url: string | URL,
    options?: FynFetchOptions
  ): Promise<Response> {
    const merged = mergeOptions(defaultOptions, options);
    return executeFetch(url, merged);
  } as FynFetchInstance;

  instance.defaults = defaultOptions;

  instance.create = (opts?: FynFetchOptions) => createInstance(opts ?? {});
  instance.extend = (opts?: FynFetchOptions) =>
    createInstance(mergeOptions(defaultOptions, opts));

  instance.get = (url, opts) => instance(url, { ...opts, method: "GET" });
  instance.post = (url, opts) => instance(url, { ...opts, method: "POST" });
  instance.put = (url, opts) => instance(url, { ...opts, method: "PUT" });
  instance.patch = (url, opts) => instance(url, { ...opts, method: "PATCH" });
  instance.delete = (url, opts) => instance(url, { ...opts, method: "DELETE" });
  instance.head = async (url, opts) => {
    const res = await instance(url, { ...opts, method: "HEAD" });
    await drain(res);
    return res;
  };

  instance.json = async <T = any>(url: string | URL, opts?: FynFetchOptions): Promise<T> => {
    const res = await instance(url, {
      ...opts,
      throwOnHttpError: opts?.throwOnHttpError ?? defaultOptions.throwOnHttpError ?? true,
    });
    return (await res.json()) as T;
  };

  instance.text = async (url: string | URL, opts?: FynFetchOptions): Promise<string> => {
    const res = await instance(url, {
      ...opts,
      throwOnHttpError: opts?.throwOnHttpError ?? defaultOptions.throwOnHttpError ?? true,
    });
    return await res.text();
  };

  instance.buffer = async (url: string | URL, opts?: FynFetchOptions): Promise<Buffer> => {
    const res = await instance(url, {
      ...opts,
      throwOnHttpError: opts?.throwOnHttpError ?? defaultOptions.throwOnHttpError ?? true,
    });
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  };

  instance.arrayBuffer = async (url: string | URL, opts?: FynFetchOptions): Promise<ArrayBuffer> => {
    const res = await instance(url, {
      ...opts,
      throwOnHttpError: opts?.throwOnHttpError ?? defaultOptions.throwOnHttpError ?? true,
    });
    return await res.arrayBuffer();
  };

  instance.blob = async (url: string | URL, opts?: FynFetchOptions): Promise<Blob> => {
    const res = await instance(url, {
      ...opts,
      throwOnHttpError: opts?.throwOnHttpError ?? defaultOptions.throwOnHttpError ?? true,
    });
    return await res.blob();
  };

  instance.stream = (url, destination, opts) =>
    stream(url, destination, mergeOptions(defaultOptions, opts));

  instance.drain = drain;

  return instance;
}

export const fynFetch: FynFetchInstance = createInstance({});
export default fynFetch;
