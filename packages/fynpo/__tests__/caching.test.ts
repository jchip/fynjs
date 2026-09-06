import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import Fs from "node:fs";
import Path from "node:path";
import os from "node:os";
import { PkgBuildCache } from "../src/caching.js";

describe("PkgBuildCache remote operations", () => {
  let server: http.Server;
  let serverUrl: string;
  let receivedRequests: Array<{ method: string; url: string; body: Buffer }> = [];
  let tempDir: string;

  beforeEach(async () => {
    receivedRequests = [];
    tempDir = await Fs.promises.mkdtemp(Path.join(os.tmpdir(), "fynpo-cache-test-"));

    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(chunks);
        receivedRequests.push({
          method: req.method || "GET",
          url: req.url || "/",
          body,
        });

        if (req.url?.endsWith(".json") && req.method === "GET") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              data: {
                fileHashes: {
                  "dist/index.js": "hash123",
                },
              },
            })
          );
        } else if (req.method === "GET" && req.url?.endsWith(".js")) {
          res.writeHead(200, { "content-type": "application/octet-stream" });
          res.end("mock-file-content-from-remote");
        } else if (req.method === "PUT") {
          res.writeHead(200);
          res.end("ok");
        } else {
          res.writeHead(404);
          res.end("not found");
        }
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const port = (server.address() as any).port;
        serverUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await Fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it("checkCache fetches remote json metadata via fetch", async () => {
    const pkgDir = Path.join(tempDir, "packages/pkg-a");
    await Fs.promises.mkdir(pkgDir, { recursive: true });
    await Fs.promises.writeFile(
      Path.join(pkgDir, "package.json"),
      JSON.stringify({ name: "pkg-a", version: "1.0.0" })
    );

    const cache = new PkgBuildCache(
      tempDir,
      {
        caching: {
          enable: true,
          server: serverUrl,
        },
      },
      {
        input: {
          include: ["package.json"],
        },
      },
      "test-label"
    );

    const depData: any = {
      pkgInfo: {
        name: "pkg-a",
        path: "packages/pkg-a",
        pkgJson: { name: "pkg-a", version: "1.0.0" },
      },
      localDepsByPath: {},
    };

    await cache.checkCache(depData);

    expect(cache.exist).toBe("remote");
    expect(cache.output?.files).toEqual(["dist/index.js"]);
    expect(receivedRequests.length).toBe(1);
    expect(receivedRequests[0].method).toBe("GET");
    expect(receivedRequests[0].url).toContain(".json");
  });

  it("uploadCacheToRemote uploads metadata and files via streaming PUT", async () => {
    const pkgDir = Path.join(tempDir, "packages/pkg-a");
    const distDir = Path.join(pkgDir, "dist");
    await Fs.promises.mkdir(distDir, { recursive: true });
    await Fs.promises.writeFile(Path.join(distDir, "index.js"), "console.log('built');");

    const cache = new PkgBuildCache(
      tempDir,
      {
        caching: {
          enable: true,
          server: serverUrl,
          alwaysUploadToRemote: true,
        },
      },
      {},
      "test-label"
    );

    cache.pkgInfo = { name: "pkg-a", path: "packages/pkg-a" } as any;
    cache.input = { hash: "inputhash" };
    cache.output = {
      files: ["dist/index.js"],
      data: {
        fileHashes: {
          "dist/index.js": "filehash456",
        },
      },
    };
    cache.exist = "fs";

    await cache.uploadCacheToRemote();

    const putRequests = receivedRequests.filter((r) => r.method === "PUT");
    expect(putRequests.length).toBe(2);

    const metaReq = putRequests.find((r) => r.url.endsWith(".json"));
    expect(metaReq).toBeDefined();

    const fileReq = putRequests.find((r) => r.url.endsWith(".js"));
    expect(fileReq).toBeDefined();
    expect(fileReq?.body.toString()).toBe("console.log('built');");
  });

  it("downloadCacheFromRemote downloads remote files via streaming GET", async () => {
    const cacheDir = Path.join(tempDir, ".cache");
    const cache = new PkgBuildCache(
      tempDir,
      {
        caching: {
          enable: true,
          server: serverUrl,
          dir: cacheDir,
        },
      },
      {},
      "test-label"
    );

    cache.filesCacheDir = Path.join(cacheDir, "files");
    cache.pkgInfo = { name: "pkg-a", path: "packages/pkg-a" } as any;
    cache.exist = "remote";
    cache.output = {
      files: ["dist/index.js"],
      data: {
        fileHashes: {
          "dist/index.js": "hash123",
        },
      },
    };

    await cache.downloadCacheFromRemote();

    const targetFile = Path.join(cache.filesCacheDir, "hash123.js");
    const exists = await Fs.promises
      .access(targetFile)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);

    const content = await Fs.promises.readFile(targetFile, "utf8");
    expect(content).toBe("mock-file-content-from-remote");
  });
});
