import got from "got";

/**
 * fetch JSON from URL
 *
 * @param url url
 * @param options options - `{ headers }` passed to got
 * @returns JSON fetched - `{}` on any failure (got throws HTTPError on non-2xx)
 */
export async function internalFetchJSON(url: string, options: any): Promise<any> {
  try {
    const resp = await got(url, options);
    return JSON.parse(resp.body as string);
  } catch {
    return {};
  }
}
