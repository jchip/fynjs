import fs from "node:fs";
import { pipeline as streamPipeline } from "node:stream/promises";
import type { Writable } from "node:stream";
import { fynFetch } from "./index.js";
import type { FynFetchOptions } from "./types.js";

/**
 * Streams the response body of a request directly into a Writable destination stream or file path.
 * Automatically enforces `throwOnHttpError: true`.
 * If `destination` is a file path string, cleans up partial file on abort or error.
 */
export async function stream(
  url: string | URL,
  destination: string | NodeJS.WritableStream,
  options?: FynFetchOptions
): Promise<Response> {
  const res = await fynFetch(url, {
    ...options,
    throwOnHttpError: true,
  });

  if (!res.body) {
    throw new Error(`Response body is empty for ${res.url}`);
  }

  const isPath = typeof destination === "string";
  const destStream = isPath ? fs.createWriteStream(destination) : destination;

  try {
    await streamPipeline(res.body as any, destStream);
  } catch (err) {
    if (isPath) {
      await fs.promises.unlink(destination).catch(() => {});
    }
    throw err;
  }

  return res;
}
