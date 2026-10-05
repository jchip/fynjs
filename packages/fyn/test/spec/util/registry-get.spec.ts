import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fs from "fs";
import Os from "os";
import Path from "path";
import Zlib from "zlib";
import { verify } from "run-verify";
import { packumentHeaders, fetchPackument, authCacheKey } from "../../../lib/util/registry-get";
import { readTrimmedPackument } from "../../../lib/util/trimmed-packument";

const CORGI = "application/vnd.npm.install-v1+json";

const response = (body: unknown, headers: Record<string, string> = {}, status = 200) => ({
  status,
  headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  buffer: () => Promise.resolve(Buffer.from(JSON.stringify(body))),
  body: { resume: () => undefined },
});

const abbreviated = (hasInstallScript?: boolean) => ({
  name: "mod-a",
  "dist-tags": { latest: "1.0.0" },
  versions: { "1.0.0": { name: "mod-a", version: "1.0.0", ...(hasInstallScript ? { hasInstallScript } : {}) } },
});

const full = {
  name: "mod-a",
  "dist-tags": { latest: "1.0.0" },
  time: { "1.0.0": "2020-01-01T00:00:00.000Z" },
  versions: { "1.0.0": { name: "mod-a", version: "1.0.0", scripts: { postinstall: "node x.js" } } },
};

describe("registry-get", function () {
  let dir: string;
  let file: string;
  const calls: Record<string, string>[] = [];
  const getWith = (...responses: any[]) => (_url: string, headers: Record<string, string>) => {
    calls.push(headers);
    return Promise.resolve(responses.shift());
  };

  beforeEach(() => {
    dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fyn-registry-get-"));
    file = Path.join(dir, "mod-a.json");
    calls.length = 0;
  });

  afterEach(() => {
    Fs.rmSync(dir, { recursive: true, force: true });
  });

  describe("packumentHeaders", function () {
    it("asks for the abbreviated doc by default", () => {
      const h = packumentHeaders();
      expect(h.accept).toContain(CORGI);
      expect(h["accept-encoding"]).toBe("gzip");
      expect(h["if-none-match"]).toBeUndefined();
    });

    it("asks for the full doc and adds validators", () => {
      const h = packumentHeaders({ etag: '"e"', lastModified: "Mon, 01 Jan 2024 00:00:00 GMT" }, true);
      expect(h.accept).toBe("application/json");
      expect(h["if-none-match"]).toBe('"e"');
      expect(h["if-modified-since"]).toBe("Mon, 01 Jan 2024 00:00:00 GMT");
    });
  });

  describe("fetchPackument", function () {
    it("keeps an abbreviated packument without install scripts", () => {
      const get = getWith(response(abbreviated(), { "content-type": CORGI, etag: '"e1"' }));
      return verify()
        .step(() => fetchPackument({ url: "http://r/mod-a", file, opts: {} }, get))
        .step((res) => {
          expect(res.status).toBe(200);
          expect(calls).toHaveLength(1);
          expect(calls[0].accept).toContain(CORGI);
        })
        .step(() => readTrimmedPackument(file))
        .step((read) => {
          expect(read.corgi).toBe(true);
          expect(read.etag).toBe('"e1"');
        });
    });

    it("re-fetches in full when a version has install scripts", () => {
      const get = getWith(
        response(abbreviated(true), { "content-type": CORGI, etag: '"e-corgi"' }),
        response(full, { "content-type": "application/json", etag: '"e-full"' })
      );
      return verify()
        .step(() => fetchPackument({ url: "http://r/mod-a", file, opts: {} }, get))
        .step(() => {
          expect(calls).toHaveLength(2);
          expect(calls[0].accept).toContain(CORGI);
          expect(calls[1].accept).toBe("application/json");
        })
        .step(() => readTrimmedPackument(file))
        .step((read) => {
          expect(read.packument.versions["1.0.0"].scripts.postinstall).toBe("node x.js");
          expect(read.corgi).not.toBe(true);
          expect(read.etag).toBe('"e-full"');
        });
    });

    it("requests the full doc once when job.full is set", () => {
      const get = getWith(response(full, { "content-type": "application/json" }));
      return verify()
        .step(() => fetchPackument({ url: "http://r/mod-a", file, full: true, opts: {} }, get))
        .step((res) => {
          expect(res.status).toBe(200);
          expect(calls).toHaveLength(1);
          expect(calls[0].accept).toBe("application/json");
        });
    });

    it("decodes a gzip body", () => {
      const res = response(abbreviated(), { "content-type": CORGI, "content-encoding": "gzip" });
      res.buffer = () => Promise.resolve(Zlib.gzipSync(JSON.stringify(abbreviated())));
      return verify()
        .step(() => fetchPackument({ url: "http://r/mod-a", file, opts: {} }, getWith(res)))
        .step((r) => expect(JSON.parse((r as any).json).name).toBe("mod-a"));
    });

    it("returns 304 and sends the validators", () => {
      const get = getWith(response({}, {}, 304));
      return verify()
        .step(() => fetchPackument({
          url: "http://r/mod-a",
          file,
          etag: '"e1"',
          lastModified: "Mon, 01 Jan 2024 00:00:00 GMT",
          opts: {}
        }, get))
        .step((res) => {
          expect(res).toEqual({ status: 304 });
          expect(calls[0]["if-none-match"]).toBe('"e1"');
          expect(calls[0]["if-modified-since"]).toBe("Mon, 01 Jan 2024 00:00:00 GMT");
          expect(Fs.existsSync(file)).toBe(false);
        });
    });
  });
});

describe("authCacheKey", () => {
  it("keys a URL by the longest auth prefix that matches it, else its host", () => {
    const prefixes = ["//r.co/", "//r.co/team-a/", "//r.co/team-a/npm"];
    expect(authCacheKey("https://r.co/team-a/npm/pkg", prefixes)).toBe("//r.co/team-a/npm");
    expect(authCacheKey("https://r.co/team-a/npm/pkg/-/pkg-1.0.0.tgz", prefixes)).toBe("//r.co/team-a/npm");
    // a prefix only matches at a path boundary
    expect(authCacheKey("https://r.co/team-a/npmx/pkg", prefixes)).toBe("//r.co/team-a/");
    expect(authCacheKey("https://r.co/team-b/pkg", prefixes)).toBe("//r.co/");
    expect(authCacheKey("https://other.co/pkg", prefixes)).toBe("host //other.co");
    expect(authCacheKey("https://r.co:8443/pkg", [])).toBe("host //r.co:8443");
  });
});
