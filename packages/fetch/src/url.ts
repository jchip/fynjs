import type { SearchParamsInit } from "./types.js";

/**
 * Appends search parameters from string, URLSearchParams, or Record into a target URLSearchParams.
 */
export function appendSearchParams(
  target: URLSearchParams,
  searchParams?: SearchParamsInit
): void {
  if (!searchParams) return;
  if (typeof searchParams === "string") {
    const parsed = new URLSearchParams(searchParams);
    parsed.forEach((val, key) => target.append(key, val));
  } else if (searchParams instanceof URLSearchParams) {
    searchParams.forEach((val, key) => target.append(key, val));
  } else if (typeof searchParams === "object") {
    for (const [key, val] of Object.entries(searchParams)) {
      if (val !== undefined && val !== null) {
        target.append(key, String(val));
      }
    }
  }
}

/**
 * Resolves full URL by applying `prefixUrl` to relative paths and merging `searchParams`.
 */
export function buildUrl(
  inputUrl: string | URL,
  prefixUrl?: string | URL,
  searchParams?: SearchParamsInit
): string {
  let finalUrlStr: string;

  if (inputUrl instanceof URL) {
    finalUrlStr = inputUrl.toString();
  } else {
    const isAbsolute = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(inputUrl);

    if (prefixUrl && !isAbsolute) {
      const base = prefixUrl.toString().replace(/\/+$/, "");
      const rel = inputUrl.replace(/^\/+/, "");
      finalUrlStr = rel ? `${base}/${rel}` : base;
    } else {
      finalUrlStr = inputUrl;
    }
  }

  if (searchParams) {
    try {
      const parsed = new URL(finalUrlStr);
      appendSearchParams(parsed.searchParams, searchParams);
      return parsed.toString();
    } catch {
      const sp = new URLSearchParams();
      appendSearchParams(sp, searchParams);
      const query = sp.toString();
      if (query) {
        const sep = finalUrlStr.includes("?") ? "&" : "?";
        return `${finalUrlStr}${sep}${query}`;
      }
    }
  }

  return finalUrlStr;
}
