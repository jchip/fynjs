import got from "got";

/**
 * fetch JSON from URL
 *
 * @param url url
 * @param options options
 * @returns JSON fetched
 */
export async function internalFetchJSON(url: string, options: any): Promise<any> {
  try {
    const resp = await got(url, options);
    return JSON.parse(resp.body);
  } catch {
    return {};
  }
}
