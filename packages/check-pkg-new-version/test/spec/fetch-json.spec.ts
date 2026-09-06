import { describe, it, expect, vi, afterEach } from "vitest";
import { internalFetchJSON } from "../../src/fetch-json.js";

const okResponse = (body: any) => ({ ok: true, json: async () => body });

describe("internalFetchJSON", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should return {} when the request fails", async () => {
    expect(await internalFetchJSON("not-a-valid-url", {})).toEqual({});
  });

  it("should return the parsed JSON body on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okResponse({ "dist-tags": { latest: "1.2.3" } }))
    );

    expect(await internalFetchJSON("https://registry.example.com/pkg", {})).toEqual({
      "dist-tags": { latest: "1.2.3" },
    });
  });

  it("should pass headers through to fetch", async () => {
    const spy = vi.fn(async (_url: string, _init: any) => okResponse({}));
    vi.stubGlobal("fetch", spy);

    const headers = { "user-agent": "test-agent", accept: "application/json" };
    await internalFetchJSON("https://registry.example.com/pkg", { headers });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1].headers).toEqual(headers);
  });

  it("should return {} on a non-2xx response without reading the body", async () => {
    const json = vi.fn(async () => ({ error: "not found" }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, json })));

    expect(await internalFetchJSON("https://registry.example.com/nope", {})).toEqual({});
    expect(json).not.toHaveBeenCalled();
  });

  it("should return {} when the body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON");
        },
      }))
    );

    expect(await internalFetchJSON("https://registry.example.com/html", {})).toEqual({});
  });

  it("should return {} when fetch rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );

    expect(await internalFetchJSON("https://registry.example.com/down", {})).toEqual({});
  });

  it("should arm an abort signal on every request", async () => {
    const spy = vi.fn(async (_url: string, _init: any) => okResponse({}));
    vi.stubGlobal("fetch", spy);

    await internalFetchJSON("https://registry.example.com/pkg", {});

    // without this the request can hang forever behind someone else's command
    expect(spy.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("should abort and return {} when the request outlives the timeout", async () => {
    let captured: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: any) => {
        captured = init?.signal;
        return new Promise((_resolve, reject) => {
          // no signal means no abort, so fail loudly instead of hanging the suite
          if (!init?.signal) {
            reject(new Error("fetch called without an abort signal"));
            return;
          }
          init.signal.addEventListener("abort", () => reject(init.signal.reason));
        });
      })
    );

    expect(await internalFetchJSON("https://registry.example.com/slow", { timeout: 10 })).toEqual(
      {}
    );
    expect(captured?.aborted).toBe(true);
    expect(captured?.reason?.name).toBe("TimeoutError");
  });

  it("should tolerate being called with no options", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okResponse({ ok: 1 }))
    );

    expect(await internalFetchJSON("https://registry.example.com/pkg")).toEqual({ ok: 1 });
  });
});
