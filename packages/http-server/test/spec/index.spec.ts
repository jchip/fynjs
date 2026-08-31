import { describe, it, expect, vi, afterEach } from "vitest";
import * as index from "../../src/index.js";
import { checkNodeEnv } from "../../src/check-node-env.js";
import { startFailed } from "../../src/start-failed.js";
import type { FynHttpServerInstance } from "../../src/types.js";

let server: FynHttpServerInstance | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  if (server) {
    await server.close();
    server = undefined;
  }
});

describe("index", () => {
  it("re-exports the public surface", () => {
    expect(typeof index.httpServer).toBe("function");
    expect(typeof index.electrodeServer).toBe("function");
    expect(typeof index.fastify).toBe("function");
    expect(typeof index.AsyncEventEmitter).toBe("function");
    expect(typeof index.composeConfig).toBe("function");
    expect(typeof index.merge).toBe("function");
    expect(typeof index.convertPluginsToArray).toBe("function");
    expect(typeof index.startFailed).toBe("function");
    expect(typeof index.checkNodeEnv).toBe("function");
  });

  it("starts a server through the barrel export", async () => {
    server = await index.httpServer({ connection: { port: 0 } });
    expect(server.info.port).toBeGreaterThan(0);
  });
});

describe("checkNodeEnv", () => {
  it("says nothing for a known deployment", () => {
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    for (const env of ["qa", "development", "staging", "production", "test"]) {
      checkNodeEnv(env);
    }
    expect(write).not.toHaveBeenCalled();
  });

  it("says nothing when the deployment is unset", () => {
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    checkNodeEnv(undefined);
    checkNodeEnv("");
    expect(write).not.toHaveBeenCalled();
  });

  it("warns about an unrecognized deployment", () => {
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    checkNodeEnv("banana");
    expect(write).toHaveBeenCalledTimes(1);
    expect(String(write.mock.calls[0][0])).toContain("banana");
  });
});

describe("startFailed", () => {
  const capture = () => vi.spyOn(process.stderr, "write").mockReturnValue(true);

  it("falls back to the unknown reason for an untagged error", async () => {
    const write = capture();
    const err = await startFailed(new Error("mystery")).catch(e => e);

    expect(err.moreInfo.reason).toContain("There was an error starting the Fastify server");
    expect(err.message).toContain("mystery");
    expect(String(write.mock.calls[0][0])).toContain("mystery");
  });

  it("describes an XPLUGIN_FAILED without a plugin as unknown", async () => {
    capture();
    const err: any = new Error("plugin gone");
    err.code = "XPLUGIN_FAILED";
    err.method = "with register function";

    const out = await startFailed(err).catch(e => e);
    expect(out.moreInfo.reason).toContain("failed registering your plugin 'unknown'");
  });

  it("explains an event timeout", async () => {
    capture();
    const err: any = new Error("timeout waiting for event 'complete' handler");
    err.code = "XEVENT_TIMEOUT";
    err.event = "complete";
    err.timeout = 10;

    const out = await startFailed(err).catch(e => e);
    expect(out.moreInfo.resolution).toContain("config.electrode.eventTimeout");
  });
});
