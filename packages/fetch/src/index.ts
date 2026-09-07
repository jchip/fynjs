import { HttpError, TimeoutError } from "./errors.js";
import { drain } from "./drain.js";
import { stream } from "./stream.js";
import { mergeOptions, prepareRequest, isStream } from "./options.js";
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

function resolveRetryOptions(
  retry: number | RetryOptions | undefined
): (Required<Omit<RetryOptions, "retryOn">> & { retryOn?: RetryOptions["retryOn"] }) | null {
  if (retry === undefined || retry === 0) {
    return null;
  }
  if (typeof retry === "number") {
    return {
      retries: retry,
      minTimeout: 500,
      factor: 2,
      maxTimeout: 10_000,
      statusCodes: DEFAULT_RETRY_STATUSES,
    };
  }
  return {
    retries: retry.retries ?? 0,
    minTimeout: retry.minTimeout ?? 500,
    factor: retry.factor ?? 2,
    maxTimeout: retry.maxTimeout ?? 10_000,
    statusCodes: retry.statusCodes ?? DEFAULT_RETRY_STATUSES,
    retryOn: retry.retryOn,
  };
}

async function executeFetch(
  url: string | URL,
  options: FynFetchOptions = {}
): Promise<Response> {
  // Run beforeRequest hooks if present
  if (options.hooks?.beforeRequest) {
    for (const hook of options.hooks.beforeRequest) {
      const hookRes = await hook(options, typeof url === "string" ? url : url.toString());
      if (hookRes instanceof Response) {
        return hookRes;
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
  let lastResponse: Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // 1. Prepare per-attempt request options so beforeRetry mutations take effect
    const {
      targetUrl,
      init,
      timeout,
      throwOnHttpError,
      bodyFactory,
      hooks,
    } = prepareRequest(url, options);

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
    }

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
      if (timedOut || timeoutController.signal.aborted) {
        if (!init.signal || !init.signal.aborted) {
          lastError = new TimeoutError(
            timeout!,
            `Request to ${targetUrl} timed out after ${timeout}ms`
          );
        }
      }
    } finally {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
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
          : true;

        if (shouldRetry) {
          if (hooks?.beforeRetry) {
            for (const hook of hooks.beforeRetry) {
              await hook({ error: lastError, response: null, attempt, options });
            }
          }
          const backoff = Math.min(
            retryConfig.minTimeout * Math.pow(retryConfig.factor, attempt - 1),
            retryConfig.maxTimeout
          );
          await sleep(backoff, init.signal);
          continue;
        }
      }

      throw lastError;
    }

    lastResponse = res;

    // Check if retry is needed based on response status
    if (retryConfig && attempt < maxAttempts) {
      const shouldRetry = retryConfig.retryOn
        ? retryConfig.retryOn(null, res)
        : retryConfig.statusCodes.includes(res.status);

      if (shouldRetry) {
        await drain(res);
        if (hooks?.beforeRetry) {
          for (const hook of hooks.beforeRetry) {
            await hook({ error: null, response: res, attempt, options });
          }
        }
        const backoff = Math.min(
          retryConfig.minTimeout * Math.pow(retryConfig.factor, attempt - 1),
          retryConfig.maxTimeout
        );
        await sleep(backoff, init.signal);
        continue;
      }
    }

    // Non-retryable response (or exhausted retries):
    // Execute afterResponse hooks
    if (hooks?.afterResponse) {
      for (const hook of hooks.afterResponse) {
        const hookRes = await hook(res, options);
        if (hookRes instanceof Response && hookRes !== res) {
          await drain(res);
          res = hookRes;
        }
      }
    }

    if (throwOnHttpError && !res.ok) {
      throw await HttpError.fromResponse(res);
    }

    return res;
  }

  if (lastResponse) {
    if (initialPrep.throwOnHttpError && !lastResponse.ok) {
      throw await HttpError.fromResponse(lastResponse);
    }
    return lastResponse;
  }

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
      throwOnHttpError: opts?.throwOnHttpError ?? true,
    });
    return (await res.json()) as T;
  };

  instance.text = async (url: string | URL, opts?: FynFetchOptions): Promise<string> => {
    const res = await instance(url, {
      ...opts,
      throwOnHttpError: opts?.throwOnHttpError ?? true,
    });
    return await res.text();
  };

  instance.buffer = async (url: string | URL, opts?: FynFetchOptions): Promise<Buffer> => {
    const res = await instance(url, {
      ...opts,
      throwOnHttpError: opts?.throwOnHttpError ?? true,
    });
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  };

  instance.arrayBuffer = async (url: string | URL, opts?: FynFetchOptions): Promise<ArrayBuffer> => {
    const res = await instance(url, {
      ...opts,
      throwOnHttpError: opts?.throwOnHttpError ?? true,
    });
    return await res.arrayBuffer();
  };

  instance.blob = async (url: string | URL, opts?: FynFetchOptions): Promise<Blob> => {
    const res = await instance(url, {
      ...opts,
      throwOnHttpError: opts?.throwOnHttpError ?? true,
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
