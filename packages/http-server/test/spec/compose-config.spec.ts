import { describe, it, expect, afterEach } from "vitest";
import { composeConfig, getDeployment, merge } from "../../src/compose-config.js";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

describe("merge", () => {
  it("merges plain objects key by key, recursively", () => {
    const target = { a: { b: 1, c: 2 }, d: 3 };
    merge(target, { a: { c: 20, e: 5 } });
    expect(target).toEqual({ a: { b: 1, c: 20, e: 5 }, d: 3 });
  });

  it("replaces arrays wholesale rather than merging by index", () => {
    const target = { list: [1, 2, 3] };
    merge(target, { list: [9] });
    expect(target.list).toEqual([9]);
  });

  it("replaces a plain object with a non-object value", () => {
    const target: any = { a: { b: 1 } };
    merge(target, { a: false });
    expect(target.a).toBe(false);
  });

  it("skips undefined values so they don't erase a default", () => {
    const target = { a: 1 };
    merge(target, { a: undefined });
    expect(target.a).toBe(1);
  });

  it("keeps functions by reference", () => {
    const fn = () => 1;
    const target: any = {};
    merge(target, { fn });
    expect(target.fn).toBe(fn);
  });

  it("returns target untouched when src is not a plain object", () => {
    const target = { a: 1 };
    expect(merge(target, null)).toEqual({ a: 1 });
    expect(merge(target, "string")).toEqual({ a: 1 });
    expect(merge(target, [1, 2])).toEqual({ a: 1 });
  });
});

describe("composeConfig", () => {
  it("supplies the internal defaults", () => {
    const config = composeConfig({}, [], "");
    expect(config.connection.address).toBe("0.0.0.0");
    expect(config.electrode.source).toBe("default");
    expect(config.plugins).toEqual({});
    expect(config.server).toEqual({});
  });

  it("layers the deployment overlay over the defaults", () => {
    const config = composeConfig({}, [], "development");
    expect(config.electrode.source).toBe("development");
    expect(config.connection.routes).toEqual({ cors: true });
  });

  it("applies each known deployment overlay", () => {
    for (const env of ["production", "qa", "staging", "test", "development"]) {
      expect(composeConfig({}, [], env).electrode.source).toBe(env);
    }
  });

  it("ignores a deployment with no overlay", () => {
    expect(composeConfig({}, [], "not-a-deployment").electrode.source).toBe("default");
  });

  it("reads the deployment from NODE_ENV when not given one", () => {
    process.env.NODE_ENV = "production";
    expect(getDeployment()).toBe("production");
    expect(composeConfig().electrode.source).toBe("production");
  });

  it("applies decors after the overlay and appConfig last", () => {
    const config = composeConfig({ electrode: { source: "app" } }, [
      { electrode: { source: "decor-1", fromDecor1: true } },
      { electrode: { source: "decor-2" } }
    ]);
    expect(config.electrode.source).toBe("app");
    expect(config.electrode.fromDecor1).toBe(true);
  });

  it("drops the listener hook from the composed config", () => {
    const config = composeConfig({ listener: () => undefined });
    expect(config.listener).toBeUndefined();
  });

  it("does not leak references into the internal defaults", () => {
    const first = composeConfig({ electrode: { mutated: true } }, [], "");
    first.electrode.mutated = "changed";
    first.plugins.injected = {};

    const second = composeConfig({}, [], "");
    expect(second.electrode.mutated).toBeUndefined();
    expect(second.plugins).toEqual({});
  });

  it("does not leak references into the caller's config", () => {
    const appConfig = { electrode: { nested: { deep: 1 } } };
    const config = composeConfig(appConfig, [], "");
    config.electrode.nested.deep = 99;
    expect(appConfig.electrode.nested.deep).toBe(1);
  });

  it("does not mutate the caller's config", () => {
    const appConfig = { connection: { port: 1234 } };
    composeConfig(appConfig);
    expect(appConfig).toEqual({ connection: { port: 1234 } });
  });
});
