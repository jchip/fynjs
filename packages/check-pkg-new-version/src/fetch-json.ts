import * as gotModule from "got";

// got@11 ships CJS with ESM-style declarations, so under NodeNext the default
// import binds the namespace. Unwrap at runtime to stay correct either way.
const got: any = (gotModule as any).default ?? gotModule;

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
