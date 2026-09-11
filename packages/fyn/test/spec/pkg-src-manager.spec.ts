import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from "vitest";
import Fs from "fs";
import Http from "http";
import * as Yaml from "js-yaml";
import Path from "path";
import xsh from "xsh";
import cacache from "cacache";
import { verify } from "run-verify";
import Fyn from "../../lib/fyn";
import PkgSrcManager from "../../lib/pkg-src-manager";
import mockNpm from "../fixtures/mock-npm";
import { getBucketPath, refreshCacheEntry } from "../../lib/cacache-util";
import { MARK_URL_SPEC } from "../../lib/constants";

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
    xsh.$.rm("-rf", fynCacheDir);
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

  it("requests packument with camelCase pacote v21 options", () => {
    const pacote = require("pacote");
    const origPackument = pacote.packument;
    let captured;
    pacote.packument = (name, opts) => {
      captured = opts;
      return Promise.resolve({
        name,
        versions: { "1.0.0": { name, version: "1.0.0" } },
        "dist-tags": { latest: "1.0.0" },
      });
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
      registry: "http://localhost/",
      fynCacheDir,
      fyn,
    });

    return verify({
      timeout: 500,
      cleanup: () => {
        pacote.packument = origPackument;
      },
    })
      .callbackStep<any>((next) => {
        mgr.netRetrieveMeta({
          item: { name: "mod-a" },
          packumentUrl: mgr.makePackumentUrl("mod-a"),
          cacheKey: "test-cache-key",
          defer: {
            resolve: (value) => next(null, value),
            reject: (err) => next(err),
          },
        });
      })
      .step((result) => {
        expect(result["dist-tags"].latest).toBe("1.0.0");
        // the v21-correct camelCase options must reach pacote
        expect(captured.fullMetadata).toBe(true);
        expect(captured.fetchRetries).toBe(3);
        expect(captured.preferOnline).toBe(true);
        // the old kebab-case / nonexistent names must be gone
        expect(captured).not.toHaveProperty("full-metadata");
        expect(captured).not.toHaveProperty("fetch-retries");
        expect(captured).not.toHaveProperty("cache-policy");
        expect(captured).not.toHaveProperty("cache-key");
      });
  });

  it("refreshes fetched packument cache timestamps with the manager cache directory", () => {
    const pacote = require("pacote");
    const origPackument = pacote.packument;
    pacote.packument = (name) =>
      Promise.resolve({
        name,
        versions: { "1.0.0": { name, version: "1.0.0" } },
        "dist-tags": { latest: "1.0.0" },
      });

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
    const cacheKey = "test-cache-key";
    let bucket;
    const staleTime = new Date(Date.now() - 26 * 60 * 60 * 1000);

    return verify({
      timeout: 500,
      cleanup: () => {
        pacote.packument = origPackument;
      },
    })
      .step(() => cacache.put(fynCacheDir, cacheKey, "cached"))
      .step(() => {
        bucket = getBucketPath(fynCacheDir, cacheKey);
        Fs.utimesSync(bucket, staleTime, staleTime);
      })
      .callbackStep((next) => {
        mgr.netRetrieveMeta({
          item: { name: "mod-a" },
          packumentUrl: mgr.makePackumentUrl("mod-a"),
          cacheKey,
          defer: {
            resolve: (value) => next(null, value),
            reject: (err) => next(err),
          },
        });
      })
      .step(() => new Promise((resolve) => setTimeout(resolve, 20)))
      .step(() => {
        expect(Fs.statSync(bucket).mtimeMs).toBeGreaterThan(staleTime.getTime());
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
    const pacote = require("pacote");
    const origPackument = pacote.packument;
    pacote.packument = () => Promise.reject(new Error("registry unavailable"));
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

    return verify({
      timeout: 500,
      cleanup: () => {
        pacote.packument = origPackument;
      },
    })
      .expectError.callbackStep((next) => {
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
      .step((error) => {
        expect(error).toBeInstanceOf(Error);
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

  it("tarball-stream fallback requests full metadata with the correct camelCase option", () => {
    const pacote = require("pacote");
    const origStream = pacote.tarball.stream;
    let captured;
    pacote.tarball.stream = (_id, _cb, opts) => {
      captured = opts;
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
