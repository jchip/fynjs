const DEFAULT_TIMEOUT_MS = 10000;

/**
 * fetch JSON from URL
 *
 * Uses node's built-in fetch. A version check runs in the background of someone else's
 * command, so every failure mode - bad URL, network error, non-2xx, malformed body,
 * timeout - collapses to `{}` rather than surfacing to the caller.
 *
 * @param url url
 * @param options options - `{ headers, timeout }`, timeout in ms (default 10000)
 * @returns JSON fetched - `{}` on any failure
 */
export async function internalFetchJSON(url: string, options: any = {}): Promise<any> {
  const { headers, timeout = DEFAULT_TIMEOUT_MS } = options;

  try {
    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(timeout) });
    if (!resp.ok) {
      return {};
    }
    return await resp.json();
  } catch {
    return {};
  }
}
