import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Readable, Writable } from "node:stream";
import { fynFetch, HttpError, TimeoutError, drain, stream } from "../../src/index.js";

describe("@fynjs/fetch", () => {
  let server: http.Server;
  let serverUrl: string;
  let requestHandler: (req: http.IncomingMessage, res: http.ServerResponse) => void;

  beforeEach(async () => {
    server = http.createServer((req, res) => {
      requestHandler(req, res);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const addr = server.address() as any;
    serverUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe("basic requests", () => {
    it("performs GET request and reads text", async () => {
      requestHandler = (_req, res) => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("hello world");
      };

      const res = await fynFetch(`${serverUrl}/hello`);
      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe("hello world");
    });

    it("parses JSON via fynFetch.json", async () => {
      requestHandler = (_req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ name: "fynjs", version: "1.0.0" }));
      };

      const data = await fynFetch.json<{ name: string; version: string }>(`${serverUrl}/meta`);
      expect(data).toEqual({ name: "fynjs", version: "1.0.0" });
    });

    it("reads text via fynFetch.text", async () => {
      requestHandler = (_req, res) => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("ping-pong");
      };

      const text = await fynFetch.text(`${serverUrl}/ping`);
      expect(text).toBe("ping-pong");
    });

    it("automatically sets duplex: 'half' for stream body uploads", async () => {
      let received = "";
      requestHandler = (req, res) => {
        expect(req.method).toBe("PUT");
        req.on("data", (chunk) => {
          received += chunk.toString();
        });
        req.on("end", () => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        });
      };

      const bodyStream = Readable.from(["chunk1-", "chunk2-", "chunk3"]);
      const res = await fynFetch(`${serverUrl}/upload`, {
        method: "PUT",
        body: bodyStream as any,
      });

      expect(res.ok).toBe(true);
      expect(received).toBe("chunk1-chunk2-chunk3");
    });

    it("uploads raw string body", async () => {
      let received = "";
      requestHandler = (req, res) => {
        expect(req.method).toBe("POST");
        req.on("data", (chunk) => (received += chunk.toString()));
        req.on("end", () => {
          res.writeHead(200);
          res.end("string ok");
        });
      };

      const res = await fynFetch(`${serverUrl}/string-upload`, {
        method: "POST",
        body: "raw string payload",
      });
      expect(res.ok).toBe(true);
      expect(received).toBe("raw string payload");
    });

    it("uploads Buffer body", async () => {
      let received = Buffer.alloc(0);
      requestHandler = (req, res) => {
        expect(req.method).toBe("PUT");
        req.on("data", (chunk) => (received = Buffer.concat([received, chunk])));
        req.on("end", () => {
          res.writeHead(200);
          res.end("buffer ok");
        });
      };

      const payload = Buffer.from([0xaa, 0xbb, 0xcc]);
      const res = await fynFetch(`${serverUrl}/buffer-upload`, {
        method: "PUT",
        body: payload,
      });
      expect(res.ok).toBe(true);
      expect(Buffer.compare(received, payload)).toBe(0);
    });
  });

  describe("error handling", () => {
    it("returns non-ok response when throwOnHttpError is false", async () => {
      requestHandler = (_req, res) => {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
      };

      const res = await fynFetch(`${serverUrl}/missing`, { throwOnHttpError: false });
      expect(res.ok).toBe(false);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("not found");
    });

    it("throws HttpError when throwOnHttpError is true", async () => {
      requestHandler = (_req, res) => {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end("internal error");
      };

      await expect(
        fynFetch(`${serverUrl}/fail`, { throwOnHttpError: true })
      ).rejects.toThrow(HttpError);

      try {
        await fynFetch(`${serverUrl}/fail`, { throwOnHttpError: true });
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpError);
        expect(err.status).toBe(500);
        expect(err.url).toBe(`${serverUrl}/fail`);
      }
    });

    it("throws HttpError from fynFetch.json on non-2xx", async () => {
      requestHandler = (_req, res) => {
        res.writeHead(403, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "forbidden" }));
      };

      await expect(fynFetch.json(`${serverUrl}/forbidden`)).rejects.toThrow(HttpError);
    });
  });

  describe("timeouts", () => {
    it("aborts and throws TimeoutError when request exceeds timeoutMs", async () => {
      requestHandler = (_req, res) => {
        // Deliberately delay response past timeout
        setTimeout(() => {
          res.writeHead(200);
          res.end("too late");
        }, 300);
      };

      await expect(
        fynFetch(`${serverUrl}/slow`, { timeout: 50 })
      ).rejects.toThrow(TimeoutError);

      try {
        await fynFetch(`${serverUrl}/slow`, { timeout: 50 });
      } catch (err: any) {
        expect(err).toBeInstanceOf(TimeoutError);
        expect(err.timeoutMs).toBe(50);
      }
    });

    it("respects caller signal when caller aborts before timeout", async () => {
      requestHandler = (_req, res) => {
        setTimeout(() => {
          res.writeHead(200);
          res.end("done");
        }, 500);
      };

      const controller = new AbortController();
      setTimeout(() => controller.abort(new Error("caller aborted")), 50);

      await expect(
        fynFetch(`${serverUrl}/slow`, {
          timeout: 2000,
          signal: controller.signal,
        })
      ).rejects.toThrow();
    });

    it("immediately fails when caller aborts even if retry is configured", async () => {
      let attempts = 0;
      requestHandler = (_req, res) => {
        attempts++;
        setTimeout(() => {
          res.writeHead(200);
          res.end("ok");
        }, 500);
      };

      const controller = new AbortController();
      setTimeout(() => controller.abort(new Error("caller aborted")), 30);

      const start = Date.now();
      await expect(
        fynFetch(`${serverUrl}/never`, {
          signal: controller.signal,
          retry: {
            retries: 2,
            minTimeout: 500,
          },
        })
      ).rejects.toThrow();

      const elapsed = Date.now() - start;
      expect(attempts).toBe(1);
      expect(elapsed).toBeLessThan(300);
    });
  });

  describe("drain", () => {
    it("safely drains response body", async () => {
      requestHandler = (_req, res) => {
        res.writeHead(200);
        res.end("some content");
      };

      const res = await fynFetch(`${serverUrl}/data`);
      expect(res.bodyUsed).toBe(false);

      await drain(res);
      // After canceling, reading should fail or indicate stream is closed
      expect(res.bodyUsed).toBe(true);
    });

    it("handles null, undefined, or already consumed bodies gracefully", async () => {
      await expect(drain(null)).resolves.toBeUndefined();
      await expect(drain(undefined)).resolves.toBeUndefined();

      requestHandler = (_req, res) => {
        res.writeHead(200);
        res.end("consumed");
      };
      const res = await fynFetch(`${serverUrl}/consumed`);
      await res.text();
      expect(res.bodyUsed).toBe(true);
      await expect(drain(res)).resolves.toBeUndefined();
    });
  });

  describe("retries", () => {
    it("retries on 500 status and succeeds when server recovers", async () => {
      let attempts = 0;
      requestHandler = (_req, res) => {
        attempts++;
        if (attempts === 1) {
          res.writeHead(500);
          res.end("error 1");
        } else {
          res.writeHead(200, { "content-type": "text/plain" });
          res.end("recovered");
        }
      };

      const res = await fynFetch(`${serverUrl}/flake`, {
        retry: {
          retries: 2,
          minTimeout: 20,
          factor: 1,
        },
      });

      expect(res.status).toBe(200);
      expect(attempts).toBe(2);
      expect(await res.text()).toBe("recovered");
    });

    it("exhausts retries and returns last non-ok response if throwOnHttpError is false", async () => {
      let attempts = 0;
      requestHandler = (_req, res) => {
        attempts++;
        res.writeHead(503);
        res.end("service unavailable");
      };

      const res = await fynFetch(`${serverUrl}/down`, {
        retry: {
          retries: 2,
          minTimeout: 10,
          factor: 1,
        },
        throwOnHttpError: false,
      });

      expect(attempts).toBe(3); // Initial + 2 retries
      expect(res.status).toBe(503);
      await drain(res);
    });

    it("exhausts retries and throws HttpError if throwOnHttpError is true", async () => {
      let attempts = 0;
      requestHandler = (_req, res) => {
        attempts++;
        res.writeHead(502);
        res.end("bad gateway");
      };

      await expect(
        fynFetch(`${serverUrl}/gateway`, {
          retry: {
            retries: 1,
            minTimeout: 10,
          },
          throwOnHttpError: true,
        })
      ).rejects.toThrow(HttpError);

      expect(attempts).toBe(2);
    });

    it("uses bodyFactory to generate fresh stream on retries", async () => {
      let attempts = 0;
      const receivedChunks: string[] = [];

      requestHandler = (req, res) => {
        attempts++;
        let data = "";
        req.on("data", (c) => (data += c.toString()));
        req.on("end", () => {
          receivedChunks.push(data);
          if (attempts === 1) {
            res.writeHead(500);
            res.end("retry please");
          } else {
            res.writeHead(200);
            res.end("ok");
          }
        });
      };

      const res = await fynFetch(`${serverUrl}/upload-retry`, {
        method: "PUT",
        retry: {
          retries: 1,
          minTimeout: 10,
        },
        bodyFactory: () => Readable.from([`body-attempt-${attempts}`]),
      });

      expect(res.status).toBe(200);
      expect(attempts).toBe(2);
      expect(receivedChunks[0]).toBe("body-attempt-0");
      expect(receivedChunks[1]).toBe("body-attempt-1");
    });

    it("throws TypeError if retry > 0 is configured with stream body and no bodyFactory", async () => {
      const bodyStream = Readable.from(["payload"]);

      await expect(
        fynFetch(`${serverUrl}/upload-one-shot-stream`, {
          method: "PUT",
          body: bodyStream as any,
          retry: { retries: 1 },
        })
      ).rejects.toThrow(TypeError);
    });

    it("drains intermediate responses during retries", async () => {
      let attempts = 0;
      let intermediateBodyUsed = false;

      requestHandler = (_req, res) => {
        attempts++;
        if (attempts === 1) {
          res.writeHead(500);
          res.end("temporary error");
        } else {
          res.writeHead(200);
          res.end("success");
        }
      };

      const res = await fynFetch(`${serverUrl}/drain-check`, {
        retry: {
          retries: 1,
          minTimeout: 10,
        },
        hooks: {
          beforeRetry: [
            ({ response }) => {
              if (response) {
                intermediateBodyUsed = response.bodyUsed;
              }
            },
          ],
        },
      });

      expect(res.status).toBe(200);
      expect(attempts).toBe(2);
      expect(intermediateBodyUsed).toBe(true);
    });

    it("enforces exponential backoff timing", async () => {
      const hitTimes: number[] = [];
      requestHandler = (_req, res) => {
        hitTimes.push(Date.now());
        if (hitTimes.length < 3) {
          res.writeHead(503);
          res.end("try later");
        } else {
          res.writeHead(200);
          res.end("ok");
        }
      };

      // delays: minTimeout * factor^0 = 50ms, then minTimeout * factor^1 = 200ms
      const res = await fynFetch(`${serverUrl}/backoff-test`, {
        retry: {
          retries: 2,
          minTimeout: 50,
          factor: 4,
        },
      });

      expect(res.status).toBe(200);
      expect(hitTimes).toHaveLength(3);

      const firstGap = hitTimes[1] - hitTimes[0];
      const secondGap = hitTimes[2] - hitTimes[1];

      // each delay is at least its nominal value and not wildly above it
      expect(firstGap).toBeGreaterThanOrEqual(45);
      expect(firstGap).toBeLessThan(150);
      expect(secondGap).toBeGreaterThanOrEqual(190);
      expect(secondGap).toBeLessThan(450);

      // the second delay must grow by the factor, not stay constant
      expect(secondGap).toBeGreaterThanOrEqual(firstGap * 2);
    });

    it("retries on internal timeout when retry is configured", async () => {
      let attempts = 0;
      requestHandler = (_req, res) => {
        attempts++;
        if (attempts === 1) {
          setTimeout(() => {
            res.writeHead(200);
            res.end("too slow");
          }, 150);
        } else {
          res.writeHead(200);
          res.end("fast recovered");
        }
      };

      const res = await fynFetch(`${serverUrl}/timeout-retry`, {
        timeout: 50,
        retry: {
          retries: 1,
          minTimeout: 10,
        },
      });

      expect(res.status).toBe(200);
      expect(attempts).toBe(2);
      expect(await res.text()).toBe("fast recovered");
    });
  });

  describe("stream helper", () => {
    it("streams response into destination writable stream", async () => {
      requestHandler = (_req, res) => {
        res.writeHead(200, { "content-type": "application/octet-stream" });
        res.write("stream-part-1\n");
        res.write("stream-part-2\n");
        res.end("stream-part-3");
      };

      const chunks: Buffer[] = [];
      const dest = new Writable({
        write(chunk, _encoding, callback) {
          chunks.push(chunk);
          callback();
        },
      });

      const res = await stream(`${serverUrl}/binary`, dest);
      expect(res.status).toBe(200);
      const output = Buffer.concat(chunks).toString();
      expect(output).toBe("stream-part-1\nstream-part-2\nstream-part-3");
    });

    it("throws HttpError and does not stream into destination on 404", async () => {
      requestHandler = (_req, res) => {
        res.writeHead(404);
        res.end("not found");
      };

      const chunks: Buffer[] = [];
      const dest = new Writable({
        write(chunk, _encoding, callback) {
          chunks.push(chunk);
          callback();
        },
      });

      await expect(stream(`${serverUrl}/not-here`, dest)).rejects.toThrow(HttpError);
      expect(chunks.length).toBe(0);
    });

    it("streams response into destination file path and cleans up on error", async () => {
      requestHandler = (_req, res) => {
        res.writeHead(200);
        res.write("partial file data");
        setTimeout(() => {
          res.destroy(new Error("socket crash"));
        }, 50);
      };

      const tmpFile = path.join(os.tmpdir(), `fynfetch-test-${Date.now()}.txt`);
      await expect(stream(`${serverUrl}/stream-fail`, tmpFile)).rejects.toThrow();
      expect(fs.existsSync(tmpFile)).toBe(false);
    });

    it("streams response completely into destination file path on success", async () => {
      requestHandler = (_req, res) => {
        res.writeHead(200);
        res.end("download complete");
      };

      const tmpFile = path.join(os.tmpdir(), `fynfetch-success-${Date.now()}.txt`);
      try {
        await stream(`${serverUrl}/download`, tmpFile);
        expect(fs.existsSync(tmpFile)).toBe(true);
        expect(fs.readFileSync(tmpFile, "utf8")).toBe("download complete");
      } finally {
        fs.promises.unlink(tmpFile).catch(() => {});
      }
    });
  });

  describe("ky & needle features", () => {
    describe("prefixUrl and searchParams", () => {
      it("resolves prefixUrl with relative paths", async () => {
        requestHandler = (req, res) => {
          expect(req.url).toBe("/api/v1/users");
          res.writeHead(200);
          res.end("ok");
        };

        const res1 = await fynFetch("users", { prefixUrl: `${serverUrl}/api/v1` });
        expect(res1.ok).toBe(true);

        const res2 = await fynFetch("/users", { prefixUrl: `${serverUrl}/api/v1/` });
        expect(res2.ok).toBe(true);
      });

      it("appends searchParams object to URL", async () => {
        requestHandler = (req, res) => {
          expect(req.url).toBe("/search?filter=active&page=2&enabled=true");
          res.writeHead(200);
          res.end("search ok");
        };

        const res = await fynFetch(`${serverUrl}/search`, {
          searchParams: { filter: "active", page: 2, enabled: true, ignored: undefined, nullish: null },
        });
        expect(res.ok).toBe(true);
      });

      it("merges searchParams with existing query string in URL", async () => {
        requestHandler = (req, res) => {
          expect(req.url).toBe("/search?existing=1&extra=2");
          res.writeHead(200);
          res.end("merged");
        };

        const res = await fynFetch(`${serverUrl}/search?existing=1`, {
          searchParams: "extra=2",
        });
        expect(res.ok).toBe(true);
      });
    });

    describe("json option", () => {
      it("serializes json and automatically sets Content-Type and Accept headers", async () => {
        requestHandler = (req, res) => {
          expect(req.headers["content-type"]).toBe("application/json");
          expect(req.headers["accept"]).toBe("application/json");
          let data = "";
          req.on("data", (chunk) => (data += chunk));
          req.on("end", () => {
            expect(JSON.parse(data)).toEqual({ foo: "bar", count: 42 });
            res.writeHead(200);
            res.end("received");
          });
        };

        const res = await fynFetch(`${serverUrl}/json-test`, {
          method: "POST",
          json: { foo: "bar", count: 42 },
        });
        expect(res.ok).toBe(true);
      });

      it("throws TypeError if both json and body are provided", async () => {
        await expect(
          fynFetch(`${serverUrl}/invalid`, {
            json: { a: 1 },
            body: "raw string",
          })
        ).rejects.toThrow(TypeError);
      });
    });

    describe("form option", () => {
      it("serializes form object and sets application/x-www-form-urlencoded", async () => {
        requestHandler = (req, res) => {
          expect(req.headers["content-type"]).toBe("application/x-www-form-urlencoded");
          let data = "";
          req.on("data", (chunk) => (data += chunk));
          req.on("end", () => {
            expect(data).toBe("username=john&role=admin");
            res.writeHead(200);
            res.end("form ok");
          });
        };

        const res = await fynFetch(`${serverUrl}/form-test`, {
          method: "POST",
          form: { username: "john", role: "admin", empty: undefined },
        });
        expect(res.ok).toBe(true);
      });

      it("accepts URLSearchParams instance as form", async () => {
        requestHandler = (req, res) => {
          let data = "";
          req.on("data", (chunk) => (data += chunk));
          req.on("end", () => {
            expect(data).toBe("key=val");
            res.writeHead(200);
            res.end("ok");
          });
        };

        const res = await fynFetch(`${serverUrl}/form-sp`, {
          method: "POST",
          form: new URLSearchParams({ key: "val" }),
        });
        expect(res.ok).toBe(true);
      });
    });

    describe("basic auth and cookies", () => {
      it("sets basic authorization header from username and password", async () => {
        requestHandler = (req, res) => {
          const auth = req.headers["authorization"];
          expect(auth).toBe(`Basic ${Buffer.from("alice:secret123").toString("base64")}`);
          res.writeHead(200);
          res.end("authenticated");
        };

        const res = await fynFetch(`${serverUrl}/auth`, {
          username: "alice",
          password: "secret123",
        });
        expect(res.ok).toBe(true);
      });

      it("sets Cookie header from cookies option", async () => {
        requestHandler = (req, res) => {
          expect(req.headers["cookie"]).toBe("session=abc; token=123");
          res.writeHead(200);
          res.end("cookie ok");
        };

        const res = await fynFetch(`${serverUrl}/cookies`, {
          cookies: { session: "abc", token: "123" },
        });
        expect(res.ok).toBe(true);
      });
    });

    describe("HTTP verb shortcuts", () => {
      it("supports get, post, put, patch, delete, head", async () => {
        const receivedMethods: string[] = [];
        requestHandler = (req, res) => {
          receivedMethods.push(req.method!);
          res.writeHead(200, { "x-test-header": "test-val" });
          res.end("method ok");
        };

        await fynFetch.get(`${serverUrl}/verb`);
        await fynFetch.post(`${serverUrl}/verb`, { json: { a: 1 } });
        await fynFetch.put(`${serverUrl}/verb`, { json: { b: 2 } });
        await fynFetch.patch(`${serverUrl}/verb`, { json: { c: 3 } });
        await fynFetch.delete(`${serverUrl}/verb`);
        const headRes = await fynFetch.head(`${serverUrl}/verb`);

        expect(receivedMethods).toEqual(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]);
        expect(headRes.status).toBe(200);
        expect(headRes.headers.get("x-test-header")).toBe("test-val");
      });
    });

    describe("response body helpers", () => {
      it("reads response as Buffer with fynFetch.buffer", async () => {
        requestHandler = (_req, res) => {
          res.writeHead(200);
          res.end(Buffer.from([0x01, 0x02, 0x03, 0x04]));
        };

        const buf = await fynFetch.buffer(`${serverUrl}/buf`);
        expect(Buffer.isBuffer(buf)).toBe(true);
        expect(Array.from(buf)).toEqual([1, 2, 3, 4]);
      });

      it("reads response as ArrayBuffer with fynFetch.arrayBuffer", async () => {
        requestHandler = (_req, res) => {
          res.writeHead(200);
          res.end("arraybuffer content");
        };

        const ab = await fynFetch.arrayBuffer(`${serverUrl}/ab`);
        expect(ab instanceof ArrayBuffer).toBe(true);
        expect(Buffer.from(ab).toString()).toBe("arraybuffer content");
      });

      it("reads response as Blob with fynFetch.blob", async () => {
        requestHandler = (_req, res) => {
          res.writeHead(200, { "content-type": "text/plain" });
          res.end("blob content");
        };

        const blob = await fynFetch.blob(`${serverUrl}/blob`);
        expect(blob.size).toBe(12);
        expect(await blob.text()).toBe("blob content");
      });
    });

    describe("instance creation and extension", () => {
      it("creates a client instance with default options and extends it", async () => {
        requestHandler = (req, res) => {
          expect(req.url).toBe("/v1/items?env=test");
          expect(req.headers["x-custom-api"]).toBe("fynjs");
          expect(req.headers["x-extended"]).toBe("true");
          res.writeHead(200);
          res.end("client ok");
        };

        const client = fynFetch.create({
          prefixUrl: `${serverUrl}/v1`,
          headers: { "x-custom-api": "fynjs" },
          searchParams: { env: "test" },
        });

        const extendedClient = client.extend({
          headers: { "x-extended": "true" },
        });

        const res = await extendedClient.get("items");
        expect(res.ok).toBe(true);
      });
    });

    describe("hooks", () => {
      it("runs beforeRequest hook and allows mutating options", async () => {
        requestHandler = (req, res) => {
          expect(req.headers["x-hooked"]).toBe("applied");
          res.writeHead(200);
          res.end("hook ok");
        };

        const res = await fynFetch(`${serverUrl}/hook`, {
          hooks: {
            beforeRequest: [
              (opts) => {
                opts.headers = { ...opts.headers, "x-hooked": "applied" };
              },
            ],
          },
        });
        expect(res.ok).toBe(true);
      });

      it("allows beforeRequest hook to short-circuit with a Response", async () => {
        let serverHit = false;
        requestHandler = (_req, res) => {
          serverHit = true;
          res.writeHead(500);
          res.end("should not hit");
        };

        const res = await fynFetch(`${serverUrl}/cached`, {
          hooks: {
            beforeRequest: [
              () => new Response("cached response", { status: 200 }),
            ],
          },
        });

        expect(serverHit).toBe(false);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("cached response");
      });

      it("runs beforeRetry hook on retries", async () => {
        let attempts = 0;
        let beforeRetryTriggered = false;

        requestHandler = (_req, res) => {
          attempts++;
          if (attempts === 1) {
            res.writeHead(500);
            res.end("error");
          } else {
            res.writeHead(200);
            res.end("success");
          }
        };

        const res = await fynFetch(`${serverUrl}/retry-hook`, {
          retry: { retries: 1, minTimeout: 10 },
          hooks: {
            beforeRetry: [
              ({ attempt }) => {
                beforeRetryTriggered = true;
                expect(attempt).toBe(1);
              },
            ],
          },
        });

        expect(res.status).toBe(200);
        expect(beforeRetryTriggered).toBe(true);
      });

      it("runs afterResponse hook", async () => {
        requestHandler = (_req, res) => {
          res.writeHead(200);
          res.end("original");
        };

        const res = await fynFetch(`${serverUrl}/after`, {
          hooks: {
            afterResponse: [
              () => new Response("intercepted", { status: 201 }),
            ],
          },
        });

        expect(res.status).toBe(201);
        expect(await res.text()).toBe("intercepted");
      });

      it("drains original response when afterResponse returns a replacement Response", async () => {
        let originalRes: Response | null = null;
        requestHandler = (_req, res) => {
          res.writeHead(200);
          res.end("original body");
        };

        const res = await fynFetch(`${serverUrl}/after-replace`, {
          hooks: {
            afterResponse: [
              (r) => {
                originalRes = r;
                return new Response("replacement body", { status: 200 });
              },
            ],
          },
        });

        expect(res.status).toBe(200);
        expect(await res.text()).toBe("replacement body");
        expect(originalRes).not.toBeNull();
        expect(originalRes!.bodyUsed).toBe(true);
      });

      it("preserves client default headers when beforeRequest hook spreads options.headers", async () => {
        let receivedHeaders: http.IncomingHttpHeaders | null = null;
        requestHandler = (req, res) => {
          receivedHeaders = req.headers;
          res.writeHead(200);
          res.end("ok");
        };

        const client = fynFetch.create({
          headers: { "x-client-default": "client-val" },
        });

        await client(`${serverUrl}/headers-spread`, {
          hooks: {
            beforeRequest: [
              (opts) => {
                opts.headers = { ...opts.headers, "x-hook-extra": "hook-val" };
              },
            ],
          },
        });

        expect(receivedHeaders).not.toBeNull();
        expect(receivedHeaders!["x-client-default"]).toBe("client-val");
        expect(receivedHeaders!["x-hook-extra"]).toBe("hook-val");
      });

      it("applies options mutations in beforeRetry to subsequent retry attempts", async () => {
        let attempts = 0;
        let attempt2Headers: http.IncomingHttpHeaders | null = null;

        requestHandler = (req, res) => {
          attempts++;
          if (attempts === 1) {
            res.writeHead(500);
            res.end("retry please");
          } else {
            attempt2Headers = req.headers;
            res.writeHead(200);
            res.end("recovered");
          }
        };

        const res = await fynFetch(`${serverUrl}/retry-options-mutate`, {
          retry: { retries: 1, minTimeout: 10 },
          hooks: {
            beforeRetry: [
              (ctx) => {
                ctx.options.headers = {
                  ...ctx.options.headers,
                  authorization: "Bearer refreshed-token",
                };
              },
            ],
          },
        });

        expect(res.status).toBe(200);
        expect(attempts).toBe(2);
        expect(attempt2Headers!["authorization"]).toBe("Bearer refreshed-token");
      });
    });

    describe("review findings fixes", () => {
      it("does not retry non-retryable 4xx statuses when throwOnHttpError is true", async () => {
        let attempts = 0;
        requestHandler = (_req, res) => {
          attempts++;
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "not found" }));
        };

        await expect(
          fynFetch(`${serverUrl}/non-retryable-404`, {
            retry: { retries: 2, minTimeout: 10 },
            throwOnHttpError: true,
          })
        ).rejects.toThrow(HttpError);

        expect(attempts).toBe(1);
      });

      it("does not retry POST on 409 conflict when throwOnHttpError is true", async () => {
        let attempts = 0;
        requestHandler = (_req, res) => {
          attempts++;
          res.writeHead(409, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "conflict" }));
        };

        await expect(
          fynFetch(`${serverUrl}/conflict`, {
            method: "POST",
            retry: { retries: 3, minTimeout: 10 },
            throwOnHttpError: true,
          })
        ).rejects.toThrow(HttpError);

        expect(attempts).toBe(1);
      });

      it("does not retry when afterResponse hook throws", async () => {
        let attempts = 0;
        requestHandler = (_req, res) => {
          attempts++;
          res.writeHead(200);
          res.end("ok");
        };

        await expect(
          fynFetch(`${serverUrl}/after-throws`, {
            retry: { retries: 2, minTimeout: 10 },
            hooks: {
              afterResponse: [
                () => {
                  throw new Error("hook failure");
                },
              ],
            },
          })
        ).rejects.toThrow("hook failure");

        expect(attempts).toBe(1);
      });

      it("does not call retryOn with contradictory (HttpError, null) args", async () => {
        const retryOnCalls: Array<{ err: any; resStatus: number | null }> = [];
        requestHandler = (_req, res) => {
          res.writeHead(404);
          res.end("not found");
        };

        await expect(
          fynFetch(`${serverUrl}/retryon-check`, {
            throwOnHttpError: true,
            retry: {
              retries: 2,
              minTimeout: 10,
              retryOn: (err, res) => {
                retryOnCalls.push({ err, resStatus: res?.status ?? null });
                return false;
              },
            },
          })
        ).rejects.toThrow(HttpError);

        expect(retryOnCalls).toHaveLength(1);
        expect(retryOnCalls[0].err).toBeNull();
        expect(retryOnCalls[0].resStatus).toBe(404);
      });

      it("buffers JSON error body into HttpError and preserves usable response", async () => {
        requestHandler = (_req, res) => {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "bad request", code: 123 }));
        };

        try {
          await fynFetch(`${serverUrl}/bad-input`, { throwOnHttpError: true });
          expect.unreachable("should have thrown");
        } catch (err: any) {
          expect(err).toBeInstanceOf(HttpError);
          expect(err.status).toBe(400);
          expect(err.data).toEqual({ error: "bad request", code: 123 });
          expect(await err.response.json()).toEqual({ error: "bad request", code: 123 });
          expect(await err.response.text()).toContain("bad request");
        }
      });

      it("buffers plain text error body into HttpError", async () => {
        requestHandler = (_req, res) => {
          res.writeHead(500, { "content-type": "text/plain" });
          res.end("internal server error text");
        };

        try {
          await fynFetch(`${serverUrl}/plain-err`, { throwOnHttpError: true });
          expect.unreachable("should have thrown");
        } catch (err: any) {
          expect(err).toBeInstanceOf(HttpError);
          expect(err.status).toBe(500);
          expect(err.data).toBe("internal server error text");
          expect(await err.response.text()).toBe("internal server error text");
        }
      });

      it("throws TypeError when drain is called on a locked stream", async () => {
        requestHandler = (_req, res) => {
          res.writeHead(200);
          res.end("locked stream data");
        };

        const res = await fynFetch(`${serverUrl}/locked`);
        const reader = res.body!.getReader();

        await expect(drain(res)).rejects.toThrow(TypeError);

        reader.releaseLock();
        await expect(drain(res)).resolves.toBeUndefined();
      });

      it("keeps the timeout armed across the body read so a slow body aborts", async () => {
        requestHandler = (_req, res) => {
          res.writeHead(200, { "content-type": "text/plain" });
          res.write("part1-");
          setTimeout(() => {
            res.end("part2");
          }, 200);
        };

        // Timeout is 50ms - headers arrive within ~5ms, but the body stalls to ~200ms
        const res = await fynFetch(`${serverUrl}/slow-stream`, {
          timeout: 50,
        });
        expect(res.ok).toBe(true);

        // timeout is a total budget, so the pending body read rejects
        await expect(res.text()).rejects.toThrow(TimeoutError);
      });

      it("does not abort a body that completes within the timeout", async () => {
        requestHandler = (_req, res) => {
          res.writeHead(200, { "content-type": "text/plain" });
          res.write("part1-");
          setTimeout(() => {
            res.end("part2");
          }, 20);
        };

        const res = await fynFetch(`${serverUrl}/quick-stream`, { timeout: 500 });
        expect(await res.text()).toBe("part1-part2");
      });

      it("bounds fynFetch.stream by the timeout", async () => {
        requestHandler = (_req, res) => {
          res.writeHead(200, { "content-type": "application/octet-stream" });
          res.write("chunk-");
          setTimeout(() => res.end("tail"), 300);
        };

        const chunks: Buffer[] = [];
        const sink = new Writable({
          write(chunk, _enc, cb) {
            chunks.push(Buffer.from(chunk));
            cb();
          },
        });

        await expect(
          stream(`${serverUrl}/stalled-download`, sink, { timeout: 60 })
        ).rejects.toThrow();
      });
    });
  });

  describe("second review findings fixes", () => {
    it("overrides same-named searchParams instead of accumulating them", async () => {
      let seen = "";
      requestHandler = (req, res) => {
        seen = req.url!;
        res.writeHead(200);
        res.end("ok");
      };

      const client = fynFetch.create({
        prefixUrl: serverUrl,
        searchParams: { page: 1, size: 10 },
      });

      // overridden keys move to the end; what matters is page appears once
      await client.extend({ searchParams: { page: 2 } })("search");
      expect(seen).toBe("/search?size=10&page=2");

      await client("search", { searchParams: { size: 99 } });
      expect(seen).toBe("/search?page=1&size=99");
    });

    it("overrides a same-named param already present in the URL string", async () => {
      let seen = "";
      requestHandler = (req, res) => {
        seen = req.url!;
        res.writeHead(200);
        res.end("ok");
      };

      await fynFetch(`${serverUrl}/search?page=1&keep=yes`, {
        searchParams: { page: 2 },
      });
      expect(seen).toBe("/search?keep=yes&page=2");
    });

    it("runs afterResponse and throwOnHttpError for a beforeRequest short-circuit", async () => {
      let serverHit = false;
      let afterRan = false;
      requestHandler = (_req, res) => {
        serverHit = true;
        res.writeHead(200);
        res.end("should not hit");
      };

      await expect(
        fynFetch(`${serverUrl}/cached-error`, {
          throwOnHttpError: true,
          hooks: {
            beforeRequest: [() => new Response("cached failure", { status: 503 })],
            afterResponse: [
              (response) => {
                afterRan = true;
                return response;
              },
            ],
          },
        })
      ).rejects.toThrow(HttpError);

      expect(serverHit).toBe(false);
      expect(afterRan).toBe(true);
    });

    it("passes the fully resolved URL to beforeRequest hooks", async () => {
      requestHandler = (_req, res) => {
        res.writeHead(200);
        res.end("ok");
      };

      const seen: string[] = [];
      await fynFetch("users", {
        prefixUrl: `${serverUrl}/api/v1`,
        searchParams: { q: "z" },
        hooks: { beforeRequest: [(_opts, url) => void seen.push(url)] },
      });

      expect(seen).toEqual([`${serverUrl}/api/v1/users?q=z`]);
    });

    it("rejects non-integer or negative retries", async () => {
      requestHandler = (_req, res) => {
        res.writeHead(200);
        res.end("ok");
      };

      for (const retries of [-1, 0.5, NaN]) {
        await expect(
          fynFetch(`${serverUrl}/bad-retries`, { retry: { retries } })
        ).rejects.toThrow(TypeError);
      }
      await expect(fynFetch(`${serverUrl}/bad-retries`, { retry: -1 })).rejects.toThrow(
        TypeError
      );
    });

    it("drains the response body when an afterResponse hook throws", async () => {
      requestHandler = (_req, res) => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("payload");
      };

      let captured: Response | null = null;
      await expect(
        fynFetch(`${serverUrl}/hook-throws`, {
          hooks: {
            afterResponse: [
              (response) => {
                captured = response;
                throw new Error("hook exploded");
              },
            ],
          },
        })
      ).rejects.toThrow("hook exploded");

      expect(captured).not.toBeNull();
      expect(captured!.bodyUsed || captured!.body === null).toBe(true);
    });

    it("does not retry POST on 500 by default but honors an explicit retryOn", async () => {
      let attempts = 0;
      requestHandler = (_req, res) => {
        attempts++;
        res.writeHead(500);
        res.end("boom");
      };

      const res = await fynFetch(`${serverUrl}/post-retry`, {
        method: "POST",
        body: "data",
        retry: { retries: 2, minTimeout: 10 },
      });
      expect(res.status).toBe(500);
      expect(attempts).toBe(1);
      await drain(res);

      attempts = 0;
      const forced = await fynFetch(`${serverUrl}/post-retry`, {
        method: "POST",
        body: "data",
        retry: { retries: 2, minTimeout: 10, retryOn: (_err, r) => !!r && r.status === 500 },
      });
      expect(forced.status).toBe(500);
      expect(attempts).toBe(3);
      await drain(forced);
    });

    it("honors Retry-After when computing backoff", async () => {
      const hits: number[] = [];
      requestHandler = (_req, res) => {
        hits.push(Date.now());
        if (hits.length === 1) {
          res.writeHead(503, { "retry-after": "1" });
          res.end("later");
        } else {
          res.writeHead(200);
          res.end("ok");
        }
      };

      const res = await fynFetch(`${serverUrl}/retry-after`, {
        // minTimeout alone would wait ~10ms; Retry-After: 1 asks for ~1000ms
        retry: { retries: 1, minTimeout: 10, maxTimeout: 5000 },
      });

      expect(res.status).toBe(200);
      expect(hits[1] - hits[0]).toBeGreaterThanOrEqual(950);
    });

    it("caps Retry-After at maxTimeout", async () => {
      const hits: number[] = [];
      requestHandler = (_req, res) => {
        hits.push(Date.now());
        if (hits.length === 1) {
          res.writeHead(503, { "retry-after": "600" });
          res.end("later");
        } else {
          res.writeHead(200);
          res.end("ok");
        }
      };

      const res = await fynFetch(`${serverUrl}/retry-after-huge`, {
        retry: { retries: 1, minTimeout: 10, maxTimeout: 40 },
      });

      expect(res.status).toBe(200);
      expect(hits[1] - hits[0]).toBeLessThan(400);
    });

    it("respects an instance default of throwOnHttpError: false in body helpers", async () => {
      requestHandler = (_req, res) => {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "nope" }));
      };

      const lenient = fynFetch.create({ throwOnHttpError: false });
      await expect(lenient.json(`${serverUrl}/missing`)).resolves.toEqual({ error: "nope" });

      // per-call still wins over the instance default
      await expect(
        lenient.json(`${serverUrl}/missing`, { throwOnHttpError: true })
      ).rejects.toThrow(HttpError);

      // and the plain default is still throw-on-error
      await expect(fynFetch.json(`${serverUrl}/missing`)).rejects.toThrow(HttpError);
    });

    it("drops undefined and null header values instead of sending 'undefined'", async () => {
      let received: http.IncomingHttpHeaders = {};
      requestHandler = (req, res) => {
        received = req.headers;
        res.writeHead(200);
        res.end("ok");
      };

      await fynFetch(`${serverUrl}/headers`, {
        headers: {
          "x-present": "yes",
          "x-missing": undefined as any,
          "x-nullish": null as any,
        },
      });

      expect(received["x-present"]).toBe("yes");
      expect(received["x-missing"]).toBeUndefined();
      expect(received["x-nullish"]).toBeUndefined();
    });

    it("does not let a beforeRetry hook mutating options.retry poison instance defaults", async () => {
      let attempts = 0;
      requestHandler = (_req, res) => {
        attempts++;
        if (attempts < 2) {
          res.writeHead(503);
          res.end("flaky");
        } else {
          res.writeHead(200);
          res.end("ok");
        }
      };

      const client = fynFetch.create({ retry: { retries: 1, minTimeout: 10 } });
      await client(`${serverUrl}/mutating-hook`, {
        hooks: {
          beforeRetry: [
            ({ options }) => {
              (options.retry as any).retries = 99;
            },
          ],
        },
      });

      expect((client.defaults.retry as any).retries).toBe(1);
    });

    it("treats host:port as a relative path against prefixUrl", async () => {
      let seen = "";
      requestHandler = (req, res) => {
        seen = req.url!;
        res.writeHead(200);
        res.end("ok");
      };

      await fynFetch("localhost:8080/thing", { prefixUrl: `${serverUrl}/api` });
      expect(seen).toBe("/api/localhost:8080/thing");
    });

    it("keeps prefixUrl query params attached to the end of the joined URL", async () => {
      let seen = "";
      requestHandler = (req, res) => {
        seen = req.url!;
        res.writeHead(200);
        res.end("ok");
      };

      await fynFetch("users", { prefixUrl: `${serverUrl}/api?v=1` });
      expect(seen).toBe("/api/users?v=1");
    });

    it("auto-applies duplex and rejects unretryable async-iterable bodies", async () => {
      requestHandler = (req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          res.writeHead(200);
          res.end(Buffer.concat(chunks).toString());
        });
      };

      async function* body() {
        yield "iter-";
        yield "payload";
      }

      // duplex: "half" is inferred, so undici accepts the async iterable
      const res = await fynFetch(`${serverUrl}/async-iter`, {
        method: "PUT",
        body: body() as any,
      });
      expect(await res.text()).toBe("iter-payload");

      // and a one-shot async iterable cannot be retried without a bodyFactory
      await expect(
        fynFetch(`${serverUrl}/async-iter`, {
          method: "PUT",
          body: body() as any,
          retry: { retries: 1 },
        })
      ).rejects.toThrow(TypeError);
    });

    it("strips stale entity headers from the buffered HttpError response", async () => {
      requestHandler = (_req, res) => {
        const payload = JSON.stringify({ bad: "news" });
        res.writeHead(500, {
          "content-type": "application/json",
          "content-encoding": "identity",
          "content-length": String(Buffer.byteLength(payload)),
        });
        res.end(payload);
      };

      const err: HttpError = await fynFetch(`${serverUrl}/error-headers`, {
        throwOnHttpError: true,
      }).then(
        () => {
          throw new Error("expected HttpError");
        },
        (e) => e as HttpError
      );

      expect(err).toBeInstanceOf(HttpError);
      expect(err.response.headers.get("content-encoding")).toBeNull();
      expect(err.response.headers.get("content-length")).toBeNull();
      expect(err.response.headers.get("content-type")).toBe("application/json");
      expect(await err.response.text()).toBe(JSON.stringify({ bad: "news" }));
      expect(await err.response.clone().json()).toEqual({ bad: "news" });
    });

    it("fails fast on a caller abort rather than relying on sleep to reject", async () => {
      let attempts = 0;
      requestHandler = (_req, res) => {
        attempts++;
        res.writeHead(500);
        res.end("boom");
      };

      // sleep() also rejects on an aborted signal, so asserting only that the
      // call rejects would pass even without the abort guard. Assert instead
      // that the retry path was never entered at all.
      const retryHookCalls: number[] = [];
      const controller = new AbortController();
      const promise = fynFetch(`${serverUrl}/abort-guard`, {
        signal: controller.signal,
        retry: { retries: 2, minTimeout: 5, retryOn: () => true },
        hooks: { beforeRetry: [({ attempt }) => void retryHookCalls.push(attempt)] },
      });
      controller.abort();

      await expect(promise).rejects.toThrow();
      expect(retryHookCalls).toEqual([]);
      expect(attempts).toBeLessThanOrEqual(1);
    });

    it("returns a readable body from the last response after retries are exhausted", async () => {
      requestHandler = (_req, res) => {
        res.writeHead(503);
        res.end("still down");
      };

      const res = await fynFetch(`${serverUrl}/exhausted`, {
        retry: { retries: 1, minTimeout: 10 },
      });

      expect(res.status).toBe(503);
      expect(await res.text()).toBe("still down");
    });
  });
});

