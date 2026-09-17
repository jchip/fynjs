import { afterEach, describe, expect, it, vi } from "vitest";
import { Writable } from "node:stream";
import path from "node:path";
import {
  fynFetch,
  HttpError,
  TimeoutError,
  drain,
  stream,
} from "../../src/index.js";
import {
  mergeHooks,
  mergeOptions,
  mergeSearchParams,
  normalizeHeaders,
  prepareRequest,
} from "../../src/options.js";
import { appendSearchParams, buildUrl } from "../../src/url.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const stubFetch = (...results: Array<Response | Error>) => {
  const fetchMock = vi.fn();
  for (const result of results) {
    if (result instanceof Error) {
      fetchMock.mockRejectedValueOnce(result);
    } else {
      fetchMock.mockResolvedValueOnce(result);
    }
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("boundary coverage", () => {
  describe("drain", () => {
    it("suppresses ordinary cancellation errors", async () => {
      const body = {
        locked: false,
        cancel: vi.fn().mockRejectedValue(new Error("already closed")),
      };

      await expect(drain({ body, bodyUsed: false } as any)).resolves.toBeUndefined();
    });

    it("reports a lock acquired while cancellation fails", async () => {
      const body = {
        locked: false,
        cancel: vi.fn(async () => {
          body.locked = true;
          throw new TypeError("locked during cancel");
        }),
      };

      await expect(drain({ body, bodyUsed: false } as any)).rejects.toThrow(
        "locked during cancel"
      );
    });
  });

  describe("errors", () => {
    it("keeps malformed JSON as text", async () => {
      const error = await HttpError.fromResponse(
        new Response("{bad json", {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
        "custom message"
      );

      expect(error.message).toBe("custom message");
      expect(error.data).toBe("{bad json");
      expect(await error.response.text()).toBe("{bad json");
      await expect(error.response.json()).rejects.toThrow();
    });

    it("parses buffered text through the response json reader", async () => {
      const error = await HttpError.fromResponse(
        new Response('{"ok":true}', {
          status: 400,
          headers: { "content-type": "text/plain" },
        })
      );

      expect(error.data).toBe('{"ok":true}');
      await expect(error.response.json()).resolves.toEqual({ ok: true });
    });

    it("accepts consumed and null-body responses", async () => {
      const consumed = new Response("used", { status: 400 });
      await consumed.text();

      const consumedError = await HttpError.fromResponse(consumed);
      expect(await consumedError.response.text()).toBe("");

      const nullBodyError = await HttpError.fromResponse(
        new Response(null, { status: 204 })
      );
      expect(await nullBodyError.response.text()).toBe("");
    });

    it("falls back to the original response for an invalid constructor status", async () => {
      const response = Response.error();
      const error = await HttpError.fromResponse(response);

      expect(error.response).toBe(response);
      expect(error.response.clone()).toBe(response);
      expect(await error.response.text()).toBe("");
    });

    it("handles a body read failure and a custom timeout message", async () => {
      const response = {
        bodyUsed: false,
        status: 500,
        statusText: "Broken",
        url: "https://example.test/failure",
        headers: new Headers(),
        text: vi.fn().mockRejectedValue(new Error("read failed")),
      } as unknown as Response;

      const error = await HttpError.fromResponse(response);
      expect(error.data).toBeUndefined();
      expect(await error.response.text()).toBe("");

      const timeout = new TimeoutError(12, "custom timeout");
      expect(timeout.message).toBe("custom timeout");
      expect(timeout.timeoutMs).toBe(12);
      expect(new TimeoutError(12).message).toBe("Request timed out after 12ms");
    });
  });

  describe("URL helpers", () => {
    it("accepts empty and URLSearchParams inputs", () => {
      const target = new URLSearchParams("first=1");
      appendSearchParams(target);
      appendSearchParams(target, new URLSearchParams("item=a&item=b"));
      expect(target.toString()).toBe("first=1&item=a&item=b");
    });

    it("handles URL targets and prefix query fragments", () => {
      expect(buildUrl(new URL("https://example.test/a"), undefined, { q: 1 })).toBe(
        "https://example.test/a?q=1"
      );
      expect(buildUrl("", "https://example.test/base?from=prefix#old")).toBe(
        "https://example.test/base?from=prefix#old"
      );
      expect(
        buildUrl("child?from=path#new", "https://example.test/base?from=prefix#old")
      ).toBe("https://example.test/base/child?from=prefix&from=path#new");
    });

    it("falls back for invalid or relative URL strings", () => {
      expect(buildUrl("child", "not a url")).toBe("not a url/child");
      expect(buildUrl("relative", undefined, { q: "x" })).toBe("relative?q=x");
      expect(buildUrl("relative?first=1", undefined, { q: "x" })).toBe(
        "relative?first=1&q=x"
      );
      expect(buildUrl("relative", undefined, {})).toBe("relative");
    });
  });

  describe("option helpers", () => {
    it("normalizes standard header forms", () => {
      expect(normalizeHeaders(new Headers({ "X-Test": "one" }))).toEqual({
        "x-test": "one",
      });
      expect(normalizeHeaders([["X-Test", "two"]])).toEqual({ "x-test": "two" });
    });

    it("handles empty option groups and retry combinations", () => {
      expect(mergeSearchParams()).toBeUndefined();
      expect(mergeHooks()).toBeUndefined();
      expect(
        mergeOptions(
          { retry: { retries: 2, minTimeout: 10 } },
          { retry: { factor: 3 } }
        ).retry
      ).toEqual({ retries: 2, minTimeout: 10, factor: 3 });
      expect(mergeOptions({ retry: 2 }).retry).toBe(2);
    });

    it("preserves explicit headers and filters empty cookie values", () => {
      const json = prepareRequest("https://example.test", {
        username: "alice",
        cookies: { missing: undefined as any, nullish: null as any },
        headers: {
          authorization: "Bearer existing",
          "content-type": "application/custom+json",
          accept: "application/custom+json",
          cookie: "existing=yes",
        },
        json: { ok: true },
      });

      expect(json.init.headers).toEqual(
        new Headers({
          authorization: "Bearer existing",
          "content-type": "application/custom+json",
          accept: "application/custom+json",
          cookie: "existing=yes",
        })
      );

      const basic = prepareRequest("https://example.test", { username: "alice" });
      expect(new Headers(basic.init.headers).get("authorization")).toBe(
        `Basic ${Buffer.from("alice:").toString("base64")}`
      );

      const noCookies = prepareRequest("https://example.test", {
        cookies: { missing: undefined as any, nullish: null as any },
      });
      expect(new Headers(noCookies.init.headers).has("cookie")).toBe(false);
    });

    it("rejects form conflicts and preserves a custom form content type", () => {
      expect(() =>
        prepareRequest("https://example.test", { form: { a: 1 }, body: "raw" })
      ).toThrow(TypeError);

      const form = prepareRequest("https://example.test", {
        form: { a: 1 },
        headers: { "content-type": "application/custom-form" },
      });
      expect(new Headers(form.init.headers).get("content-type")).toBe(
        "application/custom-form"
      );
    });
  });

  describe("retry boundaries", () => {
    it("waits with an active caller signal", async () => {
      const fetchMock = stubFetch(
        new Response("retry", { status: 500 }),
        new Response("ok", { status: 200 })
      );
      const controller = new AbortController();

      const response = await fynFetch("https://example.test/retry", {
        signal: controller.signal,
        retry: { retries: 1, minTimeout: 1, factor: 1 },
      });

      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("stops before backoff when a retry hook aborts the caller signal", async () => {
      const fetchMock = stubFetch(new Response("retry", { status: 500 }));
      const controller = new AbortController();
      const reason = new Error("stop retrying");

      await expect(
        fynFetch("https://example.test/retry", {
          signal: controller.signal,
          retry: { retries: 1, minTimeout: 100 },
          hooks: { beforeRetry: [() => controller.abort(reason)] },
        })
      ).rejects.toBe(reason);
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("stops during backoff when the caller signal aborts", async () => {
      const fetchMock = stubFetch(new Response("retry", { status: 500 }));
      const controller = new AbortController();
      const reason = new Error("abort backoff");

      setTimeout(() => controller.abort(reason), 5);
      await expect(
        fynFetch("https://example.test/retry", {
          signal: controller.signal,
          retry: { retries: 1, minTimeout: 100 },
        })
      ).rejects.toBe(reason);
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("uses a default error for reasonless aborts", async () => {
      const beforeBackoff = new AbortController();
      Object.defineProperty(beforeBackoff.signal, "reason", { value: undefined });
      stubFetch(new Response("retry", { status: 500 }));

      await expect(
        fynFetch("https://example.test/retry", {
          signal: beforeBackoff.signal,
          retry: { retries: 1, minTimeout: 100 },
          hooks: { beforeRetry: [() => beforeBackoff.abort()] },
        })
      ).rejects.toThrow("Aborted");

      const duringBackoff = new AbortController();
      Object.defineProperty(duringBackoff.signal, "reason", { value: undefined });
      stubFetch(new Response("retry", { status: 500 }));
      setTimeout(() => duringBackoff.abort(), 5);

      await expect(
        fynFetch("https://example.test/retry", {
          signal: duringBackoff.signal,
          retry: { retries: 1, minTimeout: 100 },
        })
      ).rejects.toThrow("Aborted");
    });

    it("keeps a hook error when response cleanup also fails", async () => {
      const failure = new Error("hook failed");
      stubFetch(new Response("data", { status: 200 }));

      await expect(
        fynFetch("https://example.test/hook", {
          hooks: {
            afterResponse: [response => {
              response.body!.getReader();
              throw failure;
            }],
          },
        })
      ).rejects.toBe(failure);
    });

    it("uses retryOn and beforeRetry for network failures", async () => {
      const failure = new Error("network down");
      const fetchMock = stubFetch(failure, new Response("ok", { status: 200 }));
      const retryOn = vi.fn(() => true);
      const beforeRetry = vi.fn();

      const response = await fynFetch("https://example.test/network", {
        retry: { retries: 1, minTimeout: 0, retryOn },
        hooks: { beforeRetry: [beforeRetry] },
      });

      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(retryOn).toHaveBeenCalledWith(failure, null);
      expect(beforeRetry).toHaveBeenCalledWith(
        expect.objectContaining({ error: failure, response: null, attempt: 1 })
      );
    });

    it("does not retry a network failure when retryOn returns false", async () => {
      const failure = new Error("network down");
      const fetchMock = stubFetch(failure);
      const retryOn = vi.fn(() => false);

      await expect(
        fynFetch("https://example.test/network", {
          retry: { retries: 1, minTimeout: 0, retryOn },
        })
      ).rejects.toBe(failure);
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("handles HTTP-date and invalid Retry-After values", async () => {
      const past = new Date(Date.now() - 1000).toUTCString();
      stubFetch(
        new Response("retry", { status: 503, headers: { "retry-after": past } }),
        new Response("ok", { status: 200 }),
        new Response("retry", { status: 503, headers: { "retry-after": "invalid" } }),
        new Response("ok", { status: 200 })
      );

      await expect(
        fynFetch("https://example.test/date", {
          retry: { retries: 1, minTimeout: 0 },
        })
      ).resolves.toBeInstanceOf(Response);
      await expect(
        fynFetch("https://example.test/invalid", {
          retry: { retries: 1, minTimeout: 0 },
        })
      ).resolves.toBeInstanceOf(Response);
    });

    it("accepts an empty retry object and a scalar body factory", async () => {
      const fetchMock = stubFetch(
        new Response("ok", { status: 200 }),
        new Response("ok", { status: 200 })
      );

      await fynFetch("https://example.test/no-retries", { retry: {} });
      await fynFetch("https://example.test/body", {
        method: "POST",
        bodyFactory: () => "body",
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][1]).toEqual(
        expect.objectContaining({ body: "body" })
      );
    });

    it("keeps the original error when caller and timeout signals both abort", async () => {
      const controller = new AbortController();
      const failure = new Error("combined abort");
      const fetchMock = vi.fn(
        () =>
          new Promise<Response>((_resolve, reject) => {
            setTimeout(() => {
              controller.abort(new Error("caller abort"));
              reject(failure);
            }, 10);
          })
      );
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        fynFetch("https://example.test/timeout", {
          timeout: 1,
          signal: controller.signal,
        })
      ).rejects.toBe(failure);
    });
  });

  describe("stream boundaries", () => {
    it("rejects an empty response body", async () => {
      stubFetch(new Response(null, { status: 200 }));
      const destination = new Writable({ write: (_chunk, _encoding, done) => done() });

      await expect(stream("https://example.test/empty", destination)).rejects.toThrow(
        "Response body is empty"
      );
    });

    it("keeps destination stream failures", async () => {
      stubFetch(new Response("data", { status: 200 }));
      const destination = new Writable({
        write: (_chunk, _encoding, done) => done(new Error("write failed")),
      });

      await expect(stream("https://example.test/fail", destination)).rejects.toThrow(
        "write failed"
      );
    });

    it("keeps pipeline errors when partial-file cleanup also fails", async () => {
      stubFetch(new Response("data", { status: 200 }));
      const destination = path.join(
        process.cwd(),
        ".temp",
        `missing-${Date.now()}`,
        "download"
      );

      await expect(stream("https://example.test/fail", destination)).rejects.toThrow();
    });

    it("uses instance defaults through instance.stream", async () => {
      const fetchMock = stubFetch(new Response("data", { status: 200 }));
      const destination = new Writable({ write: (_chunk, _encoding, done) => done() });
      const client = fynFetch.create({ headers: { "x-default": "yes" } });

      await client.stream("https://example.test/data", destination);
      expect(fetchMock.mock.calls[0][1]).toEqual(
        expect.objectContaining({ headers: new Headers({ "x-default": "yes" }) })
      );
      expect(fynFetch.create().defaults).toEqual({});
    });
  });
});
