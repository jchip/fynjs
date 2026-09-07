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
 * Joins a relative path onto `prefixUrl`, keeping any query/hash carried by the
 * prefix attached to the end of the resulting URL rather than stranded mid-path.
 */
function joinPrefix(base: string, relative: string): string {
  const rel = relative.replace(/^\/+/, "");
  if (!rel) return base;

  try {
    // Assign the path explicitly rather than using `new URL(rel, base)`, which
    // would treat a relative path like `localhost:8080/x` as an absolute URL.
    const joined = new URL(base);
    const basePath = joined.pathname.replace(/\/+$/, "");

    const hashAt = rel.indexOf("#");
    const relHash = hashAt >= 0 ? rel.slice(hashAt) : "";
    const relNoHash = hashAt >= 0 ? rel.slice(0, hashAt) : rel;
    const queryAt = relNoHash.indexOf("?");
    const relPath = queryAt >= 0 ? relNoHash.slice(0, queryAt) : relNoHash;
    const relQuery = queryAt >= 0 ? relNoHash.slice(queryAt + 1) : "";

    joined.pathname = `${basePath}/${relPath}`;
    // Prefix query params stay attached; params on the path are appended.
    if (relQuery) {
      new URLSearchParams(relQuery).forEach((val, key) => {
        joined.searchParams.append(key, val);
      });
    }
    if (relHash) {
      joined.hash = relHash;
    }
    return joined.toString();
  } catch {
    return `${base.replace(/\/+$/, "")}/${rel}`;
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
    // Require `//` after the scheme so `localhost:8080/x` is treated as a
    // relative path rather than a URL with a `localhost:` scheme.
    const isAbsolute = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(inputUrl);

    if (prefixUrl && !isAbsolute) {
      finalUrlStr = joinPrefix(prefixUrl.toString(), inputUrl);
    } else {
      finalUrlStr = inputUrl;
    }
  }

  if (searchParams) {
    try {
      const parsed = new URL(finalUrlStr);
      // Explicit searchParams override same-named params already in the URL.
      const explicit = new URLSearchParams();
      appendSearchParams(explicit, searchParams);
      for (const key of new Set(explicit.keys())) {
        parsed.searchParams.delete(key);
      }
      explicit.forEach((val, key) => parsed.searchParams.append(key, val));
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
