/*
 * GET from a registry with make-fetch-happen directly: npm-registry-fetch's auth rules, but no
 * HTTP cache and no unzipping. Used on the main thread for store tarballs, and in fs workers for
 * packuments. Both packages load on first use.
 */

import {
  savePackument,
  type PackumentValidators,
  type SavePackumentJob,
  type SavePackumentResult
} from "./trimmed-packument";

let load: Promise<{ fetch: any; getAuth: any }> | undefined;
const loadRegistryFetch = () =>
  (load ??= Promise.all([import("make-fetch-happen"), import("npm-registry-fetch")]).then(([mfh, nrf]) => ({
    fetch: mfh.default,
    getAuth: nrf.default.getAuth
  })));

/** The npm-registry-fetch options auth reads: registry, tokens, credentials, maxSockets */
export type RegistryOpts = Record<string, string | number | boolean | undefined>;

/** The plain values of `opts`, which is all auth needs and all that can go to a worker */
export function pickRegistryOpts(opts: Record<string, unknown>): RegistryOpts {
  const out: RegistryOpts = {};
  for (const [k, v] of Object.entries(opts)) {
    if (v === undefined || ["string", "number", "boolean"].includes(typeof v)) out[k] = v as RegistryOpts[string];
  }
  return out;
}

/** getAuth results, per opts, by authCacheKey */
const authCaches = new WeakMap<RegistryOpts, { prefixes: string[]; auths: Map<string, any> }>();

/**
 * What getAuth's result for `url` depends on. It walks up the URL's path for the longest
 * `//host/path` that has auth configured, and without one, falls back to the registry's auth.
 * So it's the longest configured prefix that matches, else the host.
 */
export function authCacheKey(url: string, prefixes: string[]): string | undefined {
  const m = /^[a-z]+:(\/\/[^/?#]+)([^?#]*)/i.exec(url);
  if (!m) return undefined;
  const full = m[1] + m[2];
  let best = "";
  for (const p of prefixes) {
    if (p.length > best.length && full.startsWith(p) && (p.endsWith("/") || full.length === p.length || full[p.length] === "/")) {
      best = p;
    }
  }
  return best || `host ${m[1]}`;
}

function cachedAuth(getAuth: any, url: string, opts: RegistryOpts): any {
  if (opts.forceAuth) return getAuth(url, opts);
  let cache = authCaches.get(opts);
  if (!cache) {
    const prefixes = Object.keys(opts)
      .map(k => /^(\/\/.+):(_authToken|_auth|username|_password|certfile|keyfile)$/.exec(k)?.[1])
      .filter((p): p is string => Boolean(p));
    cache = { prefixes, auths: new Map() };
    authCaches.set(opts, cache);
  }
  const key = authCacheKey(url, cache.prefixes);
  if (key === undefined) return getAuth(url, opts);
  let auth = cache.auths.get(key);
  if (!auth) cache.auths.set(key, (auth = getAuth(url, opts)));
  return auth;
}

/** Statuses from 400 up throw */
export async function registryGet(url: string, extraHeaders: Record<string, string>, opts: RegistryOpts): Promise<any> {
  const { fetch, getAuth } = await loadRegistryFetch();
  const auth = cachedAuth(getAuth, url, opts);
  const headers: Record<string, string> = { "user-agent": `fyn node/${process.version}`, ...extraHeaders };
  if (auth.token) {
    headers.authorization = `Bearer ${auth.token}`;
  } else if (auth.auth) {
    headers.authorization = `Basic ${auth.auth}`;
  }

  // the same transport settings npm-registry-fetch would use, minus its cache and unzipping
  const res = await fetch(url, {
    headers,
    compress: false,
    cert: auth.cert,
    key: auth.key,
    maxSockets: opts.maxSockets,
    noProxy: process.env.NOPROXY,
    retry: { retries: 3 },
    timeout: 5 * 60 * 1000
  });
  if (res.status >= 400) {
    res.body.resume();
    throw Object.assign(new Error(`${res.status} ${res.statusText} - GET ${url}`), {
      code: `E${res.status}`,
      statusCode: res.status
    });
  }
  return res;
}

/** npm's abbreviated install metadata, about a third the size of a full packument */
const CORGI_DOC = "application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*";

/**
 * The request headers for a packument, with validators so the registry can answer 304.
 *
 * @param full - ask for the full packument, not the abbreviated one
 */
export function packumentHeaders(validators?: PackumentValidators, full?: boolean): Record<string, string> {
  const headers: Record<string, string> = { accept: full ? "application/json" : CORGI_DOC, "accept-encoding": "gzip" };
  if (validators?.etag) headers["if-none-match"] = validators.etag;
  if (validators?.lastModified) headers["if-modified-since"] = validators.lastModified;
  return headers;
}

export interface FetchPackumentJob extends PackumentValidators {
  url: string;
  /** the trimmed copy to write */
  file: string;
  /** ask for the full packument: lock time needs `time`, or the cached copy was full */
  full?: boolean;
  opts?: RegistryOpts;
}

/** 304 when the validators still match, else the trimmed packument's JSON */
export type FetchPackumentResult = { status: 304 } | { status: 200; json: string };

type Get = (url: string, headers: Record<string, string>) => Promise<any>;
type Save = (job: SavePackumentJob) => Promise<SavePackumentResult>;

/**
 * Fetch a packument and write fyn's trimmed copy of it. It starts with the abbreviated form, and
 * gets the full one when `save` finds that abbreviated isn't enough.
 *
 * @param get - does the GET, registryGet with the job's opts by default
 * @param save - decodes and writes the response; an fs worker can run it
 */
export async function fetchPackument(job: FetchPackumentJob, get?: Get, save: Save = savePackument): Promise<FetchPackumentResult> {
  const doGet: Get = get || ((url, headers) => registryGet(url, headers, job.opts || {}));
  const request = async (headers: Record<string, string>): Promise<SavePackumentJob | undefined> => {
    const res = await doGet(job.url, headers);
    if (res.status === 304) {
      res.body?.resume();
      return undefined;
    }
    const header = (name: string): string | undefined => res.headers.get(name) || undefined;
    return {
      data: await res.buffer(),
      encoding: header("content-encoding"),
      etag: header("etag"),
      lastModified: header("last-modified"),
      corgi: /vnd\.npm\.install-v1/.test(header("content-type") || ""),
      file: job.file
    };
  };

  const first = await request(packumentHeaders(job, job.full));
  if (!first) return { status: 304 };
  let saved = await save(first);
  if ("needFull" in saved) {
    // no validators, so this can't be a 304
    saved = await save((await request(packumentHeaders(undefined, true)))!);
  }
  if ("needFull" in saved) throw new Error(`no full packument from ${job.url}`);
  return { status: 200, json: saved.json };
}
