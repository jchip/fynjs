
import { describe, it, afterEach, expect } from "vitest";
import { verify } from "run-verify";
import fynConfig from "../../lib/fyn-config";

// TODO: FPM-39 - mock-require is incompatible with Node.js v24 (module.parent removed)
// Skip until migrated to vitest mocking. Original test used mock-require to stub xenv-config.
describe.skip("fyn-config", function() {
  it("should have post processor", () => {
    // Test disabled - needs vitest mocking migration
  });
});

describe("fyn-config removed env vars", function() {
  const saved = { FYN_REGISTRY: process.env.FYN_REGISTRY, FYN_TARGET_DIR: process.env.FYN_TARGET_DIR };
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("ignores FYN_REGISTRY", () => {
    return verify({ timeout: 500 })
      .step(() => (process.env.FYN_REGISTRY = "http://env-registry.test/"))
      .step(() => fynConfig({}))
      .step(config => expect(config.registry).toBe("http://localhost:4873"));
  });

  it("ignores FYN_TARGET_DIR", () => {
    return verify({ timeout: 500 })
      .step(() => (process.env.FYN_TARGET_DIR = "env-target"))
      .step(() => fynConfig({}))
      .step(config => expect(config.targetDir).toBe("xout"));
  });

  it("still takes registry and targetDir from options", () => {
    return verify({ timeout: 500 })
      .step(() => fynConfig({ registry: "http://opt/", targetDir: "node_modules" }))
      .keep.step(config => expect(config.registry).toBe("http://opt/"))
      .step(config => expect(config.targetDir).toBe("node_modules"));
  });
});
