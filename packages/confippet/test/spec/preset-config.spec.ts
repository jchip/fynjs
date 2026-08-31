import _ from "lodash";
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import presetConfig from "../../src/preset-config.js";
import Confippet from "../../src/index.js";
import { composedResult } from "../composed-result.js";

const ENV_KEYS = [
  "AUTO_LOAD_CONFIG_OFF",
  "AUTO_LOAD_CONFIG_PROCESS_OFF",
  "NODE_CONFIG_DIR",
  "NODE_CONFIG_DIR_0",
  "NODE_ENV",
  "NODE_APP_INSTANCE",
  "NODE_CONFIG"
];

const saved: Record<string, string | undefined> = {};
const resetEnv = () => ENV_KEYS.forEach(k => delete process.env[k]);

let config: any;

beforeAll(() => {
  ENV_KEYS.forEach(k => (saved[k] = process.env[k]));
  // the config dirs are looked up relative to cwd, and the singleton composes
  // on first access - so the env has to be right before we touch it
  resetEnv();
  process.env.NODE_CONFIG_DIR = "test/config";
  process.env.NODE_APP_INSTANCE = "0";
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  config = Confippet.config;
});

afterAll(() => {
  vi.restoreAllMocks();
  resetEnv();
  for (const k of ENV_KEYS) {
    if (saved[k] !== undefined) process.env[k] = saved[k];
  }
});

beforeEach(() => {
  resetEnv();
  config._$.reset();
  expect({ ...config }).toEqual({});
});

describe("preset-config", () => {
  const result = composedResult();

  it("composes the preset config on first access", () => {
    // proven by beforeAll having loaded it; re-load to assert the shape
    process.env.NODE_CONFIG_DIR = "test/config";
    process.env.NODE_APP_INSTANCE = "0";
    presetConfig.autoLoad(config);
    expect({ ...config }).toEqual(result);
  });

  it("hands back the same singleton as the config subpath", () => {
    expect(Confippet.config).toBe(config);
  });

  it("should skip instance file if it's not defined", () => {
    process.env.NODE_CONFIG_DIR = "test/config";
    presetConfig.autoLoad(config);
    expect(config.instance0).toBeUndefined();
  });

  it("should use default location if NODE_CONFIG_DIR is not defined", () => {
    process.env.NODE_APP_INSTANCE = "0";
    process.env.NODE_CONFIG = JSON.stringify({ tx: "{{config.json}}" });
    presetConfig.autoLoad(config, { dir: "test/config" });
    expect(config.$("tx")).toBe("json");
    delete config.tx;
    expect({ ...config }).toEqual(result);
  });

  it("should not auto load if AUTO_LOAD_CONFIG_OFF is set", () => {
    process.env.AUTO_LOAD_CONFIG_OFF = "true";
    presetConfig.autoLoad(config, { dir: "test/config" });
    expect({ ...config }).toEqual({});
  });

  it("should not process if AUTO_LOAD_CONFIG_PROCESS_OFF is set", () => {
    process.env.AUTO_LOAD_CONFIG_PROCESS_OFF = "true";
    process.env.NODE_APP_INSTANCE = "0";
    process.env.NODE_CONFIG = JSON.stringify({ tx: "{{config.json}}" });
    presetConfig.autoLoad(config, { dir: "test/config" });
    expect(config.$("tx")).toBe("{{config.json}}");
    delete config.tx;
    expect({ ...config }).toEqual(result);
  });

  it("should load production if set", () => {
    process.env.NODE_CONFIG_DIR = "test/config";
    process.env.NODE_APP_INSTANCE = "0";
    process.env.NODE_ENV = "production";
    presetConfig.autoLoad(config);
    const prodResult: any = _.cloneDeep(result);
    prodResult.deployment = "prod";
    prodResult.arr = ["prod", 1, "2"];
    expect({ ...config }).toEqual(prodResult);
  });

  it("should load configs from multiple directories", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.env.NODE_CONFIG_DIR = "test/config";
    process.env.NODE_CONFIG_DIR_0 = "test/config1";
    process.env.NODE_APP_INSTANCE = "0";
    process.env.NODE_ENV = "production";
    presetConfig.autoLoad(config);
    const prodResult: any = _.cloneDeep(result);
    prodResult.default1 = "json";
    prodResult.deployment = "prod";
    prodResult.deployment1 = "production";
    prodResult.arr = ["prod", 1, "2"];
    expect({ ...config }).toEqual(prodResult);
    expect(log.mock.calls.some(c => String(c[0]) === "config dirs")).toBe(true);
  });
});
