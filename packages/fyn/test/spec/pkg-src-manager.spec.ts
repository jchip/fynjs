import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from "vitest";
import Fs from "fs";
import Http from "http";
import * as Yaml from "js-yaml";
import Path from "path";
import Zlib from "zlib";
import cacache from "cacache";
import { verify } from "run-verify";
import Fyn from "../../lib/fyn";
import PkgSrcManager from "../../lib/pkg-src-manager";
import mockNpm from "../fixtures/mock-npm";
import { getBucketPath, refreshCacheEntry } from "../../lib/cacache-util";
import {
  readTrimmedPackument,
  trimmedPackumentFile,
  writeTrimmedPackument,
} from "../../lib/util/trimmed-packument";
import { MARK_URL_SPEC } from "../../lib/constants";
import { packumentHeaders } from "../../lib/util/registry-get";

/** a make-fetch-happen response with a body and headers */
const fakeResponse = (body: Buffer, headers: Record<string, string> = {}, status = 200) => ({
  status,
  headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  buffer: () => Promise.resolve(body),
  body: { resume: () => undefined },
});

// vitest runs spec files in parallel, and `Date.now()` alone collided - two files starting in
// the same millisecond shared this directory and deleted each other's fixtures (ENOTEMPTY on
// cleanup, ENOENT on read). pid + a random suffix makes it unique per worker.
const tmpName = () =>
  `.tmp_${Date.now()}_${process.pid.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

describe("pkg-src-manager", function () {
  let fynCacheDir;

  let server;
  beforeAll(() => {
    return mockNpm({ port: 0, logLevel: "warn" }).then((s) => (server = s));
  });

  afterAll(() => {
    return server.stop();
  });

  beforeEach(() => {
    fynCacheDir = Path.join(__dirname, `../${tmpName()}`);
  });

  afterEach(() => {
    Fs.rmSync(fynCacheDir, { recursive: true, force: true });
  });

  it.skip("should save meta cache with etag", () => {
    const host = `localhost:${server.info.port}`;
    const mgr = new PkgSrcManager({
      registry: `http://${host}`,
      fynCacheDir,
      fyn: {},
    });
    return mgr
      .fetchMeta({
        name: "mod-a",
        semver: "",
      })
      .then((meta) => {
        expect(meta.fynFo.etag).toEqual(expect.anything());
      });
  });

  it.skip("should handle 304 when fetching meta that's already in local cache", () => {
    const host = `localhost:${server.info.port}`;
    const options = {
      registry: `http://${host}`,
      fynCacheDir,
      fyn: {},
    };
    let etag;
    let mgr = new PkgSrcManager(options);
    return mgr
      .fetchMeta({
        name: "mod-a",
        semver: "",
      })
      .then((meta) => {
        expect(meta.fynFo.etag).toEqual(expect.anything());
        etag = meta.fynFo.etag;
        return new PkgSrcManager(options).fetchMeta({
          name: "mod-a",
          semver: "",
        });
      })
      .then((meta) => {
        expect(meta.fynFo.etag).toEqual(expect.anything());
        expect(meta.fynFo.etag).toBe(etag);
      });
  });

  it("should load packument from the current make-fetch-happen cache key", async () => {
    const host = `localhost:${server.info.port}`;
    const registry = `http://${host}`;
    const fyn = {
      concurrency: 1,
      _fynCacheDir: fynCacheDir,
      _options: {},
      isFynpo: false,
      forceCache: false,
      remoteMetaDisabled: "offline",
      remoteTgzDisabled: false,
      copy: [],
    };
    const mgr = new PkgSrcManager({
      registry,
      fynCacheDir,
      fyn,
    });
    const packumentUrl = mgr.makePackumentUrl("mod-a");
    const cacheKey = `make-fetch-happen:request-cache:${packumentUrl}`;
    const packument = {
      name: "mod-a",
      versions: {
        "2.0.0": {
          name: "mod-a",
          version: "2.0.0",
        },
      },
      "dist-tags": {
        latest: "2.0.0",
      },
    };

    await cacache.put(fynCacheDir, cacheKey, JSON.stringify(packument));
    await refreshCacheEntry(fynCacheDir, cacheKey);

    const meta = await mgr.fetchMeta({
      name: "mod-a",
      semver: "",
    });

    expect(meta["dist-tags"].latest).toBe("2.0.0");
  });

  it("should reread cache on meta-memoize hit before reusing packument", () => {
    const host = `localhost:${server.info.port}`;
    const registry = `http://${host}`;
    const packumentVersions = {
      stale: {
        name: "mod-a",
        versions: {
          "1.0.0": {
            name: "mod-a",
            version: "1.0.0",
          },
        },
        "dist-tags": {
          latest: "1.0.0",
        },
      },
      fresh: {
        name: "mod-a",
        versions: {
          "2.0.0": {
            name: "mod-a",
            version: "2.0.0",
          },
        },
        "dist-tags": {
          latest: "2.0.0",
        },
      },
    };
    const fyn = {
      concurrency: 1,
      _fynCacheDir: fynCacheDir,
      _options: {},
      isFynpo: false,
      forceCache: false,
      remoteMetaDisabled: false,
      remoteTgzDisabled: false,
      copy: [],
    };
    const mgr = new PkgSrcManager({
      registry,
      fynCacheDir,
      fyn,
    });
    const packumentUrl = mgr.makePackumentUrl("mod-a");
    const cacheKey = `make-fetch-happen:request-cache:${packumentUrl}`;

    let bucket;
    const staleTime = new Date(Date.now() - 26 * 60 * 60 * 1000);

    const memoServer = Http.createServer(async (req, res) => {
      const { searchParams } = new URL(req.url, "http://localhost");
      const key = searchParams.get("key");

      if (key === cacheKey) {
        await cacache.put(fynCacheDir, cacheKey, JSON.stringify(packumentVersions.fresh));
        await refreshCacheEntry(fynCacheDir, cacheKey);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ time: Date.now() }));
        return;
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ err: "not found" }));
    });

    return verify({
      timeout: 500,
      cleanup: () =>
        memoServer.listening
          ? new Promise<void>((resolve, reject) =>
              memoServer.close((err) => (err ? reject(err) : resolve())),
            )
          : undefined,
    })
      .step(() => cacache.put(fynCacheDir, cacheKey, JSON.stringify(packumentVersions.stale)))
      .step(() => {
        bucket = getBucketPath(fynCacheDir, cacheKey);
        Fs.utimesSync(bucket, staleTime, staleTime);
      })
      .callbackStep<number>((next) => {
        const onError = (err) => next(err);
        memoServer.once("error", onError);
        memoServer.listen(0, () => {
          memoServer.off("error", onError);
          next(null, memoServer.address().port);
        });
      })
      .step((port) => {
        fyn._options.metaMemoize = `http://localhost:${port}`;
        return mgr.fetchMeta({
          name: "mod-a",
          semver: "",
        });
      })
      .step((meta) => {
        expect(meta["dist-tags"].latest).toBe("2.0.0");
      });
  });

  it("should prefer the freshest packument when both cache keys exist", async () => {
    const host = `localhost:${server.info.port}`;
    const registry = `http://${host}`;
    const fyn = {
      concurrency: 1,
      _fynCacheDir: fynCacheDir,
      _options: {},
      isFynpo: false,
      forceCache: false,
      remoteMetaDisabled: "offline",
      remoteTgzDisabled: false,
      copy: [],
    };
    const mgr = new PkgSrcManager({
      registry,
      fynCacheDir,
      fyn,
    });
    const packumentUrl = mgr.makePackumentUrl("mod-a");
    const cacheKey = `make-fetch-happen:request-cache:${packumentUrl}`;
    const legacyCacheKey = `make-fetch-happen:request-cache:full:${packumentUrl}`;
    const stalePackument = {
      name: "mod-a",
      versions: {
        "1.0.0": {
          name: "mod-a",
          version: "1.0.0",
        },
      },
      "dist-tags": {
        latest: "1.0.0",
      },
    };
    const freshPackument = {
      name: "mod-a",
      versions: {
        "2.0.0": {
          name: "mod-a",
          version: "2.0.0",
        },
      },
      "dist-tags": {
        latest: "2.0.0",
      },
    };

    await cacache.put(fynCacheDir, cacheKey, JSON.stringify(stalePackument));
    await cacache.put(fynCacheDir, legacyCacheKey, JSON.stringify(freshPackument));

    const staleTime = new Date(Date.now() - 26 * 60 * 60 * 1000);
    const freshTime = new Date();

    Fs.utimesSync(getBucketPath(fynCacheDir, cacheKey), staleTime, staleTime);
    Fs.utimesSync(getBucketPath(fynCacheDir, legacyCacheKey), freshTime, freshTime);

    const meta = await mgr.fetchMeta({
      name: "mod-a",
      semver: "",
    });

    expect(meta["dist-tags"].latest).toBe("2.0.0");
  });

  it("fetches a packument with no make-fetch-happen cache", async () => {
    const mgr = new PkgSrcManager({
      registry: `http://localhost:${server.info.port}`,
      fynCacheDir,
      fyn: { concurrency: 1, _options: {} },
    });
    const res = await mgr.registryGet(mgr.makePackumentUrl("mod-a"), packumentHeaders());
    expect(res.status).toBe(200);
    expect(JSON.parse((await res.buffer()).toString())["dist-tags"]).toBeDefined();
    expect(res.headers.get("etag")).toMatch(/^"/);
    expect(Fs.existsSync(Path.join(fynCacheDir, "index-v5"))).toBe(false);
  });

  it("revalidates a stale trimmed copy with its etag", () => {
    const mgr = new PkgSrcManager({
      registry: `http://localhost:${server.info.port}`,
      fynCacheDir,
      fyn: {
        concurrency: 1,
        _options: {},
        isFynpo: false,
        forceCache: false,
        remoteMetaDisabled: false,
        remoteTgzDisabled: false,
        copy: [],
      },
    });
    const file = trimmedPackumentFile(Path.join(fynCacheDir, "fyn-packuments"), mgr.makePackumentUrl("mod-a"));
    const packument = { name: "mod-a", versions: { "9.0.0": {} }, "dist-tags": { latest: "9.0.0" } };
    const staleTime = Date.now() - 26 * 60 * 60 * 1000;

    return verify({ timeout: 2000 })
      .step(() => writeTrimmedPackument(file, packument, staleTime, { etag: '"cached-etag"' }))
      .step(() => mgr.fetchMeta({ name: "mod-a", semver: "" }))
      .step((meta) => {
        // the mock registry answers 304 to any etag, so the cached copy comes back
        expect(meta["dist-tags"].latest).toBe("9.0.0");
      })
      .step(() => new Promise((resolve) => setTimeout(resolve, 50)))
      .step(() => readTrimmedPackument(file))
      .step((read) => {
        expect(read.etag).toBe('"cached-etag"');
        expect(read.refreshTime).toBeGreaterThan(staleTime + 60 * 1000);
      });
  });

  it("revalidates a stale full copy from older fyn, and keeps it trimmed", () => {
    const mgr = new PkgSrcManager({
      registry: `http://localhost:${server.info.port}`,
      fynCacheDir,
      fyn: {
        concurrency: 1,
        _options: {},
        isFynpo: false,
        forceCache: false,
        remoteMetaDisabled: false,
        remoteTgzDisabled: false,
        copy: [],
      },
    });
    const packumentUrl = mgr.makePackumentUrl("mod-a");
    const cacheKey = `make-fetch-happen:request-cache:${packumentUrl}`;
    const file = trimmedPackumentFile(Path.join(fynCacheDir, "fyn-packuments"), packumentUrl);
    const packument = { name: "mod-a", versions: { "9.0.0": {} }, "dist-tags": { latest: "9.0.0" } };
    const staleTime = new Date(Date.now() - 26 * 60 * 60 * 1000);
    const metadata = { resHeaders: { etag: '"full-etag"' } };

    return verify({ timeout: 2000 })
      .step(() => cacache.put(fynCacheDir, cacheKey, JSON.stringify(packument), { metadata }))
      .step(() => Fs.utimesSync(getBucketPath(fynCacheDir, cacheKey), staleTime, staleTime))
      .step(() => mgr.fetchMeta({ name: "mod-a", semver: "" }))
      .step((meta) => expect(meta["dist-tags"].latest).toBe("9.0.0"))
      .step(() => new Promise((resolve) => setTimeout(resolve, 50)))
      .step(() => readTrimmedPackument(file))
      .step((read) => {
        expect(read.packument["dist-tags"].latest).toBe("9.0.0");
        expect(read.etag).toBe('"full-etag"');
        expect(read.refreshTime).toBeGreaterThan(staleTime.getTime() + 60 * 1000);
      });
  });

  describe("trimmed packument copies", () => {
    const offlineFyn = () => ({
      concurrency: 1,
      _options: {},
      isFynpo: false,
      forceCache: false,
      remoteMetaDisabled: "offline",
      remoteTgzDisabled: false,
      copy: [],
    });
    const fullPackument = {
      name: "mod-a",
      readme: "dropped",
      versions: { "2.0.0": { name: "mod-a", version: "2.0.0", description: "dropped" } },
      "dist-tags": { latest: "2.0.0" },
    };
    const trimmedFile = (mgr) =>
      trimmedPackumentFile(Path.join(fynCacheDir, "fyn-packuments"), mgr.makePackumentUrl("mod-a"));

    it("writes a trimmed copy with its etag after a registry fetch", () => {
      const mgr = new PkgSrcManager({
        registry: "http://localhost/",
        fynCacheDir,
        fyn: { ...offlineFyn(), remoteMetaDisabled: false },
      });
      mgr.registryGet = () => Promise.resolve(fakeResponse(Zlib.gzipSync(JSON.stringify(fullPackument)), {
        "content-encoding": "gzip",
        etag: '"e1"',
      }));

      return verify({ timeout: 2000 })
        .callbackStep((next) => {
          mgr.netRetrieveMeta({
            item: { name: "mod-a" },
            packumentUrl: mgr.makePackumentUrl("mod-a"),
            cacheKey: "test-cache-key",
            defer: { resolve: (v) => next(null, v), reject: (e) => next(e) },
          });
        })
        .step(() => new Promise((resolve) => setTimeout(resolve, 50)))
        .step(() => readTrimmedPackument(trimmedFile(mgr)))
        .step((read) => {
          expect(read.packument["dist-tags"].latest).toBe("2.0.0");
          expect(read.packument.readme).toBe(undefined);
          expect(read.packument.versions["2.0.0"]).toEqual({});
          expect(read.etag).toBe('"e1"');
        });
    });

    const netMeta = (mgr) =>
      new Promise((resolve, reject) => {
        mgr.netRetrieveMeta({
          item: { name: "mod-a" },
          packumentUrl: mgr.makePackumentUrl("mod-a"),
          cacheKey: "test-cache-key",
          defer: { resolve, reject },
        });
      });

    it("uses abbreviated packuments by default", () => {
      const mgr = new PkgSrcManager({
        registry: "http://localhost/",
        fynCacheDir,
        fyn: { ...offlineFyn(), remoteMetaDisabled: false },
      });
      const headers: Record<string, string>[] = [];
      mgr.registryGet = (_url, h) => {
        headers.push(h);
        return Promise.resolve(fakeResponse(Buffer.from(JSON.stringify(fullPackument)), {
          "content-type": "application/vnd.npm.install-v1+json",
        }));
      };

      return verify({ timeout: 2000 })
        .step(() => netMeta(mgr))
        .step(() => {
          expect(headers).toHaveLength(1);
          expect(headers[0].accept).toBe(packumentHeaders().accept);
        });
    });

    it("asks for full packuments under lock time and skips an abbreviated cached copy", () => {
      const mgr = new PkgSrcManager({
        registry: "http://localhost/",
        fynCacheDir,
        fyn: { ...offlineFyn(), remoteMetaDisabled: false, lockTime: new Date() },
      });
      const headers: Record<string, string>[] = [];
      mgr.registryGet = (_url, h) => {
        headers.push(h);
        return Promise.resolve(fakeResponse(Buffer.from(JSON.stringify(fullPackument)), {
          "content-type": "application/json",
        }));
      };

      return verify({ timeout: 2000 })
        .step(() => writeTrimmedPackument(trimmedFile(mgr), fullPackument, undefined, { etag: '"c"', corgi: true }))
        .step(() => mgr.fetchMeta({ name: "mod-a", semver: "" }))
        .step((meta) => {
          expect(meta["dist-tags"].latest).toBe("2.0.0");
          expect(headers).toHaveLength(1);
          expect(headers[0].accept).toBe("application/json");
          expect(headers[0]["if-none-match"]).toBeUndefined();
        });
    });

    it("uses a fresh trimmed copy without the full cache entry", () => {
      const mgr = new PkgSrcManager({ registry: "http://localhost/", fynCacheDir, fyn: offlineFyn() });
      return verify()
        .step(() => writeTrimmedPackument(trimmedFile(mgr), fullPackument))
        .step(() => mgr.fetchMeta({ name: "mod-a", semver: "" }))
        .step((meta) => {
          expect(meta["dist-tags"].latest).toBe("2.0.0");
          expect(meta.readme).toBe(undefined);
        });
    });

    it("makes a trimmed copy from a fresh full entry, keeping its refresh time", () => {
      const mgr = new PkgSrcManager({ registry: "http://localhost/", fynCacheDir, fyn: offlineFyn() });
      const cacheKey = `make-fetch-happen:request-cache:${mgr.makePackumentUrl("mod-a")}`;
      const refreshed = new Date(Date.now() - 60 * 60 * 1000);
      return verify({ timeout: 2000 })
        .step(() => cacache.put(fynCacheDir, cacheKey, JSON.stringify(fullPackument)))
        .step(() => Fs.utimesSync(getBucketPath(fynCacheDir, cacheKey), refreshed, refreshed))
        .step(() => mgr.fetchMeta({ name: "mod-a", semver: "" }))
        .step((meta) => expect(meta.readme).toBe("dropped"))
        .step(() => new Promise((resolve) => setTimeout(resolve, 50)))
        .step(() => readTrimmedPackument(trimmedFile(mgr)))
        .step((read) => {
          expect(read.packument.readme).toBe(undefined);
          expect(Math.abs(read.refreshTime - refreshed.getTime())).toBeLessThan(1000);
        });
    });
  });

  it("settles the in-flight meta count after a URL fetch", () => {
    const mgr = new PkgSrcManager({
      registry: "http://localhost/",
      fynCacheDir,
      fyn: {
        concurrency: 1,
        _options: {},
        isFynpo: false,
        forceCache: false,
        remoteMetaDisabled: false,
        remoteTgzDisabled: false,
        copy: [],
      },
    });
    mgr.fetchUrlSemverMeta = () => Promise.resolve({ name: "gitdep", versions: {} });

    return verify({ timeout: 500 })
      .callbackStep((next) => {
        mgr.netRetrieveMeta({
          item: { name: "gitdep", urlType: "git" },
          cacheKey: "unused-url-cache-key",
          defer: {
            resolve: (value) => next(null, value),
            reject: (err) => next(err),
          },
        });
      })
      .step(() => {
        expect(mgr._metaStat.inTx).toBe(0);
      });
  });

  it("settles the in-flight meta count after a failed packument fetch", () => {
    const mgr = new PkgSrcManager({
      registry: "http://localhost/",
      fynCacheDir,
      fyn: {
        concurrency: 1,
        _options: {},
        isFynpo: false,
        forceCache: false,
        remoteMetaDisabled: false,
        remoteTgzDisabled: false,
        copy: [],
      },
    });

    mgr.registryGet = () => Promise.reject(new Error("registry unavailable"));

    return verify({ timeout: 500 })
      .expectErrorInstanceMatch(Error)
      .callbackStep((next) => {
        mgr.netRetrieveMeta({
          item: { name: "mod-a" },
          packumentUrl: mgr.makePackumentUrl("mod-a"),
          cacheKey: "unused-packument-cache-key",
          defer: {
            resolve: (value) => next(null, value),
            reject: (err) => next(err),
          },
        });
      })
      .step(() => {
        expect(mgr._metaStat.inTx).toBe(0);
      });
  });

  it("does not repeat a failed network metadata request", () => {
    const mgr = new PkgSrcManager({
      registry: "http://localhost/",
      fynCacheDir,
      fyn: {
        concurrency: 1,
        _options: {},
        isFynpo: false,
        forceCache: false,
        remoteMetaDisabled: false,
        remoteTgzDisabled: false,
        copy: [],
      },
    });
    const error = new Error("registry unavailable");
    let queued = 0;
    mgr._netQ.addItem = (item) => {
      queued++;
      mgr._metaStat.wait--;
      item.defer.reject(error);
    };

    return verify({ timeout: 500 })
      .expectError.step(() => mgr.fetchMeta({ name: "missing", semver: "" }))
      .step((caught) => {
        expect(caught).toBe(error);
        expect(queued).toBe(1);
        expect(mgr._metaStat.wait).toBe(0);
      });
  });

  it("uses stale metadata when its network refresh fails", async () => {
    const mgr = new PkgSrcManager({
      registry: "http://localhost/",
      fynCacheDir,
      fyn: {
        concurrency: 1,
        _options: {},
        isFynpo: false,
        forceCache: false,
        remoteMetaDisabled: false,
        remoteTgzDisabled: false,
        copy: [],
      },
    });
    const packument = {
      name: "mod-a",
      versions: { "1.0.0": { name: "mod-a", version: "1.0.0" } },
      "dist-tags": { latest: "1.0.0" },
    };
    const cacheKey = `make-fetch-happen:request-cache:${mgr.makePackumentUrl("mod-a")}`;
    await cacache.put(fynCacheDir, cacheKey, JSON.stringify(packument));
    await refreshCacheEntry(fynCacheDir, cacheKey);
    const staleTime = new Date(Date.now() - 26 * 60 * 60 * 1000);
    Fs.utimesSync(getBucketPath(fynCacheDir, cacheKey), staleTime, staleTime);

    let queued = 0;
    mgr._netQ.addItem = (item) => {
      queued++;
      mgr._metaStat.wait--;
      item.defer.reject(new Error("registry unavailable"));
    };

    const meta = await mgr.fetchMeta({ name: "mod-a", semver: "" });

    expect(meta).toStrictEqual(packument);
    expect(queued).toBe(1);
    expect(mgr._metaStat.wait).toBe(0);
  });

  it("loads prepared URL metadata while offline", async () => {
    const item = { name: "gitdep", semver: "github:user/repo#main", urlType: "github" };
    const metadata = {
      name: item.name,
      version: "1.0.0",
      _id: `${item.name}@1.0.0`,
      _resolved: "git+https://github.com/user/repo.git#0123456789012345678901234567890123456789",
    };
    const cacheKey = `fyn-tarball-for-${item.semver}`;
    const integrity = await cacache.put(fynCacheDir, cacheKey, "prepared tarball", { metadata });
    const mgr = new PkgSrcManager({
      registry: "http://localhost/",
      fynCacheDir,
      fyn: {
        concurrency: 1,
        _options: {},
        isFynpo: false,
        forceCache: false,
        remoteMetaDisabled: "offline",
        remoteTgzDisabled: "offline",
        copy: [],
      },
    });
    let queued = 0;
    mgr._netQ.addItem = () => queued++;

    const meta = await mgr.fetchMeta(item);
    const manifest = meta.versions[metadata.version];
    const markerData = JSON.parse(manifest.dist.tarball.slice(MARK_URL_SPEC.length));

    expect(meta.name).toBe(item.name);
    expect(meta.urlVersions[item.semver]).toBe(manifest);
    expect(manifest.dist.integrity.toString()).toBe(integrity.toString());
    expect(markerData).toStrictEqual({
      urlType: item.urlType,
      semver: item.semver,
      _resolved: metadata._resolved,
      _id: metadata._id,
    });
    expect(queued).toBe(0);
    expect(mgr._metaStat.wait).toBe(0);
  });

  it("keeps the offline URL cache-miss error balanced", () => {
    const item = { name: "gitdep", semver: "github:user/missing#main", urlType: "github" };
    const mgr = new PkgSrcManager({
      registry: "http://localhost/",
      fynCacheDir,
      fyn: {
        concurrency: 1,
        _options: {},
        isFynpo: false,
        forceCache: false,
        remoteMetaDisabled: "offline",
        remoteTgzDisabled: "offline",
        copy: [],
      },
    });
    let queued = 0;
    mgr._netQ.addItem = () => queued++;

    return verify({ timeout: 500 })
      .expectErrorHas("offline")
      .step(() => mgr.fetchMeta(item))
      .step((error) => {
        expect(queued).toBe(0);
        expect(mgr._metaStat.wait).toBe(0);
      });
  });

  it("tarball-stream fallback requests full metadata with the correct camelCase option", async () => {
    const pacote = require("pacote");
    const origStream = pacote.tarball.stream;
    let captured;
    let called;
    const calledP = new Promise(resolve => (called = resolve));
    pacote.tarball.stream = (_id, _cb, opts) => {
      captured = opts;
      called();
      return Promise.resolve();
    };

    const fyn = {
      concurrency: 1,
      _fynCacheDir: fynCacheDir,
      _options: {},
      isFynpo: false,
      forceCache: false,
      remoteMetaDisabled: false,
      remoteTgzDisabled: false,
      copy: [],
    };
    const mgr = new PkgSrcManager({ registry: "http://localhost/", fynCacheDir, fyn });

    try {
      // no dist.tarball -> takes the pacote.tarball.stream fallback path
      mgr.pacoteTarballStream("mod-a@1.0.0", { name: "mod-a", version: "1.0.0" }, "sha512-x");
      // pacote loads on first use, so the call lands after a tick
      await calledP;
      expect(captured.fullMetadata).toBe(true);
      expect(captured).not.toHaveProperty("fullMeta");
    } finally {
      pacote.tarball.stream = origStream;
    }
  });

  it("reads a cached git resolved URL from the URL-spec marker payload", async () => {
    const childProcess = require("child_process");
    const origExecFileSync = childProcess.execFileSync;
    const commit = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
    let commitChecks = 0;
    childProcess.execFileSync = () => {
      commitChecks++;
      return `${commit}\n`;
    };

    const semver = "git+file:///tmp/repo#main";
    const resolved = `git+file:///tmp/repo#${commit}`;
    const metadata = {
      name: "gitdep",
      version: "1.0.0",
      dist: {
        tarball: `${MARK_URL_SPEC}${JSON.stringify({ _resolved: resolved })}`,
      },
    };
    await cacache.put(fynCacheDir, `fyn-tarball-for-${semver}`, "cached", { metadata });

    const mgr = new PkgSrcManager({
      registry: "http://localhost/",
      fynCacheDir,
      fyn: {
        concurrency: 1,
        _options: {},
        isFynpo: false,
        forceCache: false,
        remoteMetaDisabled: false,
        remoteTgzDisabled: false,
        copy: [],
      },
    });

    try {
      await mgr._prepPkgDirForManifest(
        { name: "gitdep", semver, urlType: "git" },
        { name: "gitdep", version: "1.0.0", _resolved: resolved },
        Path.join(fynCacheDir, "unused-prepared-dir"),
      );
      expect(commitChecks).toBe(1);
    } finally {
      childProcess.execFileSync = origExecFileSync;
    }
  });

  describe("fetchTarball for the central store", () => {
    const makeMgr = (central) =>
      new PkgSrcManager({
        registry: `http://localhost:${server.info.port}`,
        fynCacheDir,
        fyn: {
          concurrency: 1,
          _fynCacheDir: fynCacheDir,
          _options: {},
          isFynpo: false,
          forceCache: false,
          remoteMetaDisabled: false,
          remoteTgzDisabled: false,
          copy: [],
          central,
        },
      });
    const versionInfo = async (mgr) => {
      const meta = await mgr.fetchMeta({ name: "mod-a", semver: "" });
      return meta.versions[Object.keys(meta.versions)[0]];
    };

    it("reuses a central store package without downloading it", () => {
      const central = { has: async () => true, allow: async () => true, validate: async () => true };
      const mgr = makeMgr(central);
      const calls: string[] = [];
      const registryGet = mgr.registryGet.bind(mgr);
      // packuments still use it, so only record tarball downloads
      mgr.registryGet = (url, headers) => {
        if (url.endsWith(".tgz")) calls.push(url);
        return registryGet(url, headers);
      };

      let info;
      return verify({ timeout: 2000 })
        .step(() => versionInfo(mgr))
        .step((vi) => {
          info = vi;
          return mgr.fetchTarball(info);
        })
        .step((result) => {
          expect(result).toBe(mgr.getIntegrity(info));
          expect(calls).toEqual([]);
        });
    });

    it("downloads a tarball as bytes for the central store, skipping cacache", () => {
      let sourced: any;
      let streamed: Buffer;
      const central = {
        has: async () => false,
        allow: async () => true,
        validate: async () => true,
        storeTarStream: async (_id, _integrity, tarStream, _defer, tarSource) => {
          sourced = await tarSource();
          const chunks: Buffer[] = [];
          for await (const c of await tarStream()) chunks.push(c as Buffer);
          streamed = Buffer.concat(chunks);
          return true;
        },
      };
      const mgr = makeMgr(central);

      let info;
      return verify({ timeout: 5000 })
        .step(() => versionInfo(mgr))
        .step((vi) => {
          info = vi;
          return mgr.fetchTarball(info);
        })
        .step((job) => {
          expect(job.integrity).toBe(mgr.getIntegrity(info));
          return job.store(false);
        })
        .step(() => {
          expect(Buffer.isBuffer(sourced.data)).toBe(true);
          expect(sourced.data.length).toBeGreaterThan(0);
          expect(streamed.equals(sourced.data)).toBe(true);
          expect(Fs.existsSync(Path.join(fynCacheDir, "content-v2"))).toBe(false);
        });
    });

    it("keeps a package the store won't take in cacache", () => {
      const central = { has: async () => false, allow: async () => false, validate: async () => true };
      const mgr = makeMgr(central);
      const calls: string[] = [];
      const registryGet = mgr.registryGet.bind(mgr);
      mgr.registryGet = (url, headers) => {
        if (url.endsWith(".tgz")) calls.push(url);
        return registryGet(url, headers);
      };

      return verify({ timeout: 5000 })
        .step(() => versionInfo(mgr))
        .step((info) => mgr.fetchTarball(info))
        .step((stream) => new Promise((resolve) => stream.on("end", resolve).resume()))
        .step(() => {
          expect(calls).toEqual([]);
          expect(Fs.existsSync(Path.join(fynCacheDir, "content-v2"))).toBe(true);
        });
    });
  });

  describe("isPinnedGitCommit", () => {
    const { isPinnedGitCommit } = PkgSrcManager;
    const sha = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"; // 40 hex chars

    it("treats a 40-hex committish as a pinned commit", () => {
      expect(isPinnedGitCommit(`github:user/repo#${sha}`)).toBe(true);
      expect(isPinnedGitCommit(`git+https://github.com/user/repo.git#${sha}`)).toBe(true);
      // a bare sha spec (no '#') is also pinned
      expect(isPinnedGitCommit(sha)).toBe(true);
    });

    it("treats branch/tag refs and plain specs as not pinned", () => {
      expect(isPinnedGitCommit("github:user/repo#main")).toBe(false);
      expect(isPinnedGitCommit("github:user/repo#v1.2.3")).toBe(false);
      expect(isPinnedGitCommit("github:user/repo")).toBe(false);
      expect(isPinnedGitCommit(`github:user/repo#${sha.slice(0, 7)}`)).toBe(false);
      expect(isPinnedGitCommit("")).toBe(false);
      expect(isPinnedGitCommit(undefined)).toBe(false);
    });
  });
});
