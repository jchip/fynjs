import type { FynFetchOptions, FynFetchHooks, SearchParamsInit } from "./types.js";
import { appendSearchParams, buildUrl } from "./url.js";

export function isStream(body: any): boolean {
  if (!body || typeof body !== "object") return false;
  if (typeof body.pipe === "function" || typeof body.getReader === "function") return true;
  // Async iterables are valid undici bodies but are also one-shot.
  return typeof body[Symbol.asyncIterator] === "function";
}

/**
 * Normalizes a headers init into a plain lowercase-keyed record, dropping
 * `undefined` / `null` values instead of stringifying them into the header.
 */
export function normalizeHeaders(init?: RequestInit["headers"]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!init) return out;

  const source =
    init instanceof Headers || Array.isArray(init)
      ? init
      : Object.fromEntries(
          Object.entries(init as Record<string, any>)
            .filter(([, val]) => val !== undefined && val !== null)
            .map(([key, val]) => [key, String(val)])
        );

  new Headers(source as any).forEach((val, key) => {
    out[key] = val;
  });
  return out;
}

export function mergeHeaders(
  base?: RequestInit["headers"],
  override?: RequestInit["headers"]
): Record<string, string> {
  return { ...normalizeHeaders(base), ...normalizeHeaders(override) };
}

/**
 * Merges search params by key: params present in `override` replace the
 * same-named params from `base` rather than accumulating alongside them.
 * Repeated keys within a single init are preserved.
 */
export function mergeSearchParams(
  base?: SearchParamsInit,
  override?: SearchParamsInit
): SearchParamsInit | undefined {
  if (!base && !override) return undefined;
  const sp = new URLSearchParams();
  if (base) appendSearchParams(sp, base);
  if (override) {
    const ov = new URLSearchParams();
    appendSearchParams(ov, override);
    for (const key of new Set(ov.keys())) {
      sp.delete(key);
    }
    ov.forEach((val, key) => sp.append(key, val));
  }
  return sp;
}

export function mergeHooks(
  base?: FynFetchHooks,
  override?: FynFetchHooks
): FynFetchHooks | undefined {
  if (!base && !override) return undefined;
  return {
    beforeRequest: [
      ...(base?.beforeRequest ?? []),
      ...(override?.beforeRequest ?? []),
    ],
    beforeRetry: [
      ...(base?.beforeRetry ?? []),
      ...(override?.beforeRetry ?? []),
    ],
    afterResponse: [
      ...(base?.afterResponse ?? []),
      ...(override?.afterResponse ?? []),
    ],
  };
}

export function mergeOptions(
  base: FynFetchOptions = {},
  override: FynFetchOptions = {}
): FynFetchOptions {
  const result: FynFetchOptions = { ...base, ...override };

  if (base.headers || override.headers) {
    result.headers = mergeHeaders(base.headers, override.headers);
  }

  if (base.searchParams || override.searchParams) {
    result.searchParams = mergeSearchParams(base.searchParams, override.searchParams);
  }

  if (base.hooks || override.hooks) {
    result.hooks = mergeHooks(base.hooks, override.hooks);
  }

  if (base.cookies || override.cookies) {
    result.cookies = { ...base.cookies, ...override.cookies };
  }

  // Always clone object retry config so a hook mutating `options.retry` cannot
  // write back into the instance defaults it was inherited from.
  if (base.retry !== undefined || override.retry !== undefined) {
    if (override.retry !== undefined) {
      if (typeof override.retry === "object" && typeof base.retry === "object") {
        result.retry = { ...base.retry, ...override.retry };
      } else {
        result.retry =
          typeof override.retry === "object" ? { ...override.retry } : override.retry;
      }
    } else {
      result.retry = typeof base.retry === "object" ? { ...base.retry } : base.retry;
    }
  }

  return result;
}

export function prepareRequest(
  url: string | URL,
  options: FynFetchOptions
): {
  targetUrl: string;
  init: RequestInit;
  timeout?: number;
  retry?: FynFetchOptions["retry"];
  throwOnHttpError: boolean;
  bodyFactory?: FynFetchOptions["bodyFactory"];
  hooks?: FynFetchHooks;
} {
  const {
    prefixUrl,
    searchParams,
    json,
    form,
    username,
    password,
    cookies,
    timeout,
    retry,
    throwOnHttpError = false,
    bodyFactory,
    hooks,
    ...restInit
  } = options;

  const targetUrl = buildUrl(url, prefixUrl, searchParams);
  const headers = new Headers(normalizeHeaders(restInit.headers));
  let body = restInit.body;

  // 1. Basic Auth
  if (username !== undefined && !headers.has("authorization")) {
    const creds = Buffer.from(`${username}:${password ?? ""}`).toString("base64");
    headers.set("authorization", `Basic ${creds}`);
  }

  // 2. Cookies
  if (cookies && !headers.has("cookie")) {
    const cookieStr = Object.entries(cookies)
      .filter(([_, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    if (cookieStr) {
      headers.set("cookie", cookieStr);
    }
  }

  // 3. JSON body
  if (json !== undefined) {
    if (body !== undefined) {
      throw new TypeError("Cannot provide both 'json' and 'body' options");
    }
    body = JSON.stringify(json);
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  }

  // 4. Form body
  if (form !== undefined) {
    if (body !== undefined || json !== undefined) {
      throw new TypeError("Cannot provide 'form' with 'body' or 'json' options");
    }
    if (form instanceof URLSearchParams) {
      body = form.toString();
    } else if (typeof form === "object") {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(form)) {
        if (v !== undefined && v !== null) {
          sp.append(k, String(v));
        }
      }
      body = sp.toString();
    }
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/x-www-form-urlencoded");
    }
  }

  // 5. Duplex detection
  const init: any = { ...restInit, headers, body };
  if (body && isStream(body) && !init.duplex) {
    init.duplex = "half";
  }

  return {
    targetUrl,
    init,
    timeout,
    retry,
    throwOnHttpError,
    bodyFactory,
    hooks,
  };
}
