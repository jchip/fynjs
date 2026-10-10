import { describe, it, expect } from "vitest";
import xenvConfig from "../../src/index.js";
import { merge } from "lodash-es";
import { verify } from "run-verify";

describe("xenv-config", function() {
  describe("from env", function() {
    it("should load config", () => {
      const k = `K${Date.now()}`;
      process.env[k] = "hello";
      const cfg = xenvConfig({ test: { env: k } });
      delete process.env[k];
      expect(cfg).toStrictEqual({ test: "hello" });
      expect(cfg.__$trace__.test).toStrictEqual({ src: "env", name: k });
    });

    it("should translate using envMap", () => {
      const k = `K${Date.now()}`;
      process.env[k] = "hello";
      const cfg = xenvConfig({ test: { env: k, envMap: { hello: "xyz" } } });
      delete process.env[k];
      expect(cfg).toStrictEqual({ test: "xyz" });
      expect(cfg.__$trace__.test).toStrictEqual({ src: "env", name: k });
    });

    it("should call post", () => {
      const k = `K${Date.now()}`;
      process.env[k] = "hello";
      const cfg = xenvConfig({ test: { env: k, post: (v, t) => `${v}-${t.src}` } });
      delete process.env[k];
      expect(cfg).toStrictEqual({ test: "hello-env" });
      expect(cfg.__$trace__.test).toStrictEqual({ src: "env", name: k });
    });

    it("should use key as env var name if spec.env is true", () => {
      const k = `TEST${Date.now()}`;
      process.env[k] = "hello";
      const cfg = xenvConfig({ [k]: { env: true } });
      delete process.env[k];
      expect(cfg[k]).toBe("hello");
      expect(cfg.__$trace__[k]).toStrictEqual({ src: "env", name: k });
    });

    it("should load config thru array of env", () => {
      const now = Date.now();
      const envs = [`A${now}`, `B${now}`, `C${now}`];
      process.env[envs[1]] = "hello";
      const cfg = xenvConfig({ test: { env: envs } });
      delete process.env[envs[1]];
      expect(cfg.test).toBe("hello");
      expect(cfg.__$trace__.test).toStrictEqual({ src: "env", name: envs[1] });
    });

    it("should load config from default if array of env not found", () => {
      const now = Date.now();
      const envs = [`A${now}`, `B${now}`, `C${now}`];
      const cfg = xenvConfig({ test: { env: envs, default: "foobar" } });
      expect(cfg.test).toBe("foobar");
      expect(cfg.__$trace__.test).toStrictEqual({ src: "default" });
    });

    it("should load config if array of env all not found", () => {
      const now = Date.now();
      const envs = [`X${now}`, `Y${now}`, `Z${now}`];
      const cfg = xenvConfig({ test: { env: envs } }, { test: "world" });
      expect(cfg.test).toBe("world");
      expect(cfg.__$trace__.test).toStrictEqual({ src: "option" });
    });

    it("should load config by type from default", () => {
      const k = `K${Date.now()}`;
      ["true", "True", "yes", "Yes", "1", "On", "on"].forEach(x => {
        process.env[k] = x;
        const cfg = xenvConfig({ test: { env: k, default: false } });
        expect(cfg.test).toBe(true);
        delete process.env[k];
        expect(cfg.__$trace__.test).toStrictEqual({ src: "env", name: k });
      });
    });

    it("should load config from default callback", () => {
      const val = Date.now();
      const cfg = xenvConfig({ test: { type: "number", default: () => val } });
      expect(cfg.test).toBe(val);
      expect(cfg.__$trace__.test).toStrictEqual({ src: "default" });
    });

    it("should load as string config from default callback", () => {
      const val = `${Date.now()}`;
      const cfg = xenvConfig({ test: { default: () => val } });
      expect(cfg.test).toBe(val);
      expect(cfg.__$trace__.test).toStrictEqual({ src: "default" });
    });

    it("should not call default callback if env exist", () => {
      const k = `K${Date.now()}`;
      process.env[k] = "true";
      const cfg = xenvConfig({
        test: {
          env: k,
          type: "boolean",
          default: () => {
            throw new Error("default shouldn't be called");
          }
        }
      });
      expect(cfg.test).toBe(true);
      delete process.env[k];
      expect(cfg.__$trace__.test).toStrictEqual({ src: "env", name: k });
    });

    it("should load env value, by type from default, as boolean", () => {
      const k = `K${Date.now()}`;
      ["true", "True", "yes", "Yes", "1", "On", "on"].forEach(x => {
        process.env[k] = x;
        const cfg = xenvConfig({ test: { env: k, default: false } });
        expect(cfg.test).toBe(true);
        delete process.env[k];
        expect(cfg.__$trace__.test).toStrictEqual({ src: "env", name: k });
      });
    });

    it("should load default config with type as boolean", () => {
      [true, false].forEach(x => {
        const cfg = xenvConfig({ test: { type: "boolean", default: x } });
        expect(cfg.test).toBe(x);
        expect(cfg.__$trace__.test).toStrictEqual({ src: "default" });
      });
    });

    it("should load env value, by type from default, as number", () => {
      const k = `K${Date.now()}`;
      process.env[k] = "999";
      const cfg = xenvConfig({ test: { env: k, default: 0 } });
      expect(cfg.test).toBe(999);
      delete process.env[k];
      expect(cfg.__$trace__.test).toStrictEqual({ src: "env", name: k });
    });

    it("should load env value by type as string", () => {
      const k = `K${Date.now()}`;
      process.env[k] = "555";
      const cfg = xenvConfig({ test: { env: k, type: "string" } });
      expect(cfg.test).toBe("555");
      delete process.env[k];
      expect(cfg.__$trace__.test).toStrictEqual({ src: "env", name: k });
    });

    it("should load env value by type as number", () => {
      const k = `K${Date.now()}`;
      process.env[k] = "555";
      const cfg = xenvConfig({ test: { env: k, type: "number" } });
      expect(cfg.test).toBe(555);
      delete process.env[k];
      expect(cfg.__$trace__.test).toStrictEqual({ src: "env", name: k });
    });

    it("should load env value by type as float", () => {
      const k = `K${Date.now()}`;
      process.env[k] = "1.5";
      const cfg = xenvConfig({ test: { env: k, type: "float" } });
      expect(cfg.test).toBe(1.5);
      delete process.env[k];
    });

    it("should load true env value by type as boolean", () => {
      const k = `K${Date.now()}`;
      ["true", "True", "yes", "Yes", "1", "On", "on"].forEach(x => {
        process.env[k] = x;
        const cfg = xenvConfig({ test: { env: k, type: "boolean" } });
        expect(cfg.test).toBe(true);
        delete process.env[k];
        expect(cfg.__$trace__.test).toStrictEqual({ src: "env", name: k });
      });
    });

    it("should load false env value by type as boolean", () => {
      const k = `K${Date.now()}`;
      ["false", "no", "0", "off"].forEach(x => {
        process.env[k] = x;
        const cfg = xenvConfig({ test: { env: k, type: "boolean" } });
        expect(cfg.test).toBe(false);
        delete process.env[k];
        expect(cfg.__$trace__.test).toStrictEqual({ src: "env", name: k });
      });
    });

    it("should throw if load non-string env value as type boolean", () => {
      const env = { foo: null };
      expect(() =>
        xenvConfig({ test: { env: "foo", type: "boolean" } }, {}, { _env: env })
      ).toThrow();
    });

    it("should load false env value by type as truthy", () => {
      const k = `K${Date.now()}`;
      process.env[k] = "";
      const cfg = xenvConfig({ test: { env: k, type: "truthy" } });
      expect(cfg.test).toBe(false);
      delete process.env[k];
      expect(cfg.__$trace__.test).toStrictEqual({ src: "env", name: k });
    });

    it("should load true env value by type as truthy", () => {
      const k = `K${Date.now()}`;
      process.env[k] = "false";
      const cfg = xenvConfig({ test: { env: k, type: "truthy" } });
      expect(cfg.test).toBe(true);
      delete process.env[k];
      expect(cfg.__$trace__.test).toStrictEqual({ src: "env", name: k });
    });

    it("should load env value as string if type is unknown", () => {
      const k = `K${Date.now()}`;
      process.env[k] = "false";
      const cfg = xenvConfig({ test: { env: k, type: "blah" } });
      expect(cfg.test).toBe("false");
      delete process.env[k];
      expect(cfg.__$trace__.test).toStrictEqual({ src: "env", name: k });
    });
  });

  describe("from user options", function() {
    it("should load config if env is not defined", () => {
      const cfg = xenvConfig({ test: { type: "number" } }, { test: 999 });
      expect(cfg.test).toBe(999);
      expect(cfg.__$trace__.test).toStrictEqual({ src: "option" });
    });

    it("should load config if env doesn't exist", () => {
      const cfg = xenvConfig({ test: { env: `K${Date.now()}`, type: "number" } }, { test: 222 });
      expect(cfg.test).toBe(222);
      expect(cfg.__$trace__.test).toStrictEqual({ src: "option" });
    });

    it("should load config if sources set it first", () => {
      const k = `TEST${Date.now()}`;
      process.env[k] = "999";
      const cfg = xenvConfig(
        { test: { env: k, type: "number" } },
        { test: 222 },
        { sources: ["option", "env"] }
      );
      expect(cfg.test).toBe(222);
      expect(cfg.__$trace__.test).toStrictEqual({ src: "option" });
    });

    it("should not mutate the caller's sources array", () => {
      const sources = ["option"];
      const spec = { test: { default: { d: 1 } } };
      return verify({ timeout: 500 })
        .step(() => xenvConfig(spec, { test: { o: 1 } }, { sources }))
        .step(() => xenvConfig(spec, { test: { o: 1 } }, { sources }))
        .keep.step(cfg => expect(cfg.__$trace__.test).toStrictEqual({ src: "option,default" }))
        .step(() => expect(sources).toStrictEqual(["option"]));
    });
  });

  describe("from default", function() {
    it("should load config if it's supplied", () => {
      const cfg = xenvConfig({ test: { env: `K${Date.now()}`, default: 555, type: "number" } }, {});
      expect(cfg.test).toBe(555);
      expect(cfg.__$trace__.test).toStrictEqual({ src: "default" });
    });

    it("should not load config if it's not supplied", () => {
      const cfg = xenvConfig({ test: { env: `K${Date.now()}`, type: "number" } });
      expect(cfg).not.toHaveProperty("test");
      expect(cfg.__$trace__).not.toHaveProperty("test");
    });
  });

  describe("for json type", function() {
    it("should parse json from env", () => {
      const envKey = "TEST_JSON";
      const x = { foo: "123", a: { b: 5 } };
      const cfg = xenvConfig(
        { test: { env: envKey, type: "json" } },
        {},
        { _env: { [envKey]: JSON.stringify(x) }, merge }
      );
      expect(JSON.stringify(cfg.test)).toBe(JSON.stringify(x));
      expect(cfg.__$trace__.test).toStrictEqual({ src: "env", name: envKey });
    });

    it("should return nothing if no sources available", () => {
      const envKey = "TEST_JSON";
      const cfg = xenvConfig({ test: { env: envKey, type: "json" } }, {}, { _env: {} });
      expect(cfg).toStrictEqual({});
      expect(cfg.__$trace__.test).toStrictEqual(undefined);
    });

    it("should parse json from env by type from default", () => {
      const envKey = "TEST_JSON";
      const x = { foo: "123", a: { b: 5 } };
      const cfg = xenvConfig(
        { test: { env: envKey, default: {} } },
        {},
        { _env: { [envKey]: JSON.stringify(x) }, merge }
      );
      expect(JSON.stringify(cfg.test)).toBe(JSON.stringify(x));
      expect(cfg.__$trace__.test).toStrictEqual({ src: "env,default", name: envKey });
    });

    it("should parse and merge json from all by type from default", () => {
      const envKey = "TEST_JSON";
      const x = { foo: "123", a: { b: 5 } };
      const cfg = xenvConfig(
        { test: { env: envKey, default: { d: 1 } } },
        { test: { o: true, foo: "456", a: { c: 9 } } },
        { _env: { [envKey]: JSON.stringify(x) }, merge }
      );
      expect(cfg.test).toStrictEqual({ d: 1, o: true, foo: "123", a: { c: 9, b: 5 } });
      expect(cfg.__$trace__.test).toStrictEqual({ src: "env,option,default", name: envKey });
    });

    it("should use Object.assign if no merge provided", () => {
      const envKey = "TEST_JSON";
      const x = { foo: "123", a: { b: 5 } };
      const cfg = xenvConfig(
        { test: { env: envKey, default: { d: 1 } } },
        { test: { o: true, foo: "456", a: { c: 9 } } },
        { _env: { [envKey]: JSON.stringify(x) } }
      );
      expect(cfg.test).toStrictEqual({ d: 1, o: true, foo: "123", a: { b: 5 } });
      expect(cfg.__$trace__.test).toStrictEqual({ src: "env,option,default", name: envKey });
    });
  });

  describe("null and array defaults", function() {
    it("should read env as a string with no type and no default", () => {
      return verify({ timeout: 500 })
        .step(() => xenvConfig({ test: { env: "PLAIN_ENV" } }, {}, { _env: { PLAIN_ENV: 123 } }))
        .step(cfg => expect(cfg.test).toBe("123"));
    });

    it("should keep a null default as null and read env as a string", () => {
      const spec = { test: { env: "NULL_ENV", default: null } };
      return verify({ timeout: 500 })
        .step(() => xenvConfig(spec, {}, { _env: {} }))
        .keep.step(cfg => expect(cfg.test).toBe(null))
        .step(() => xenvConfig(spec, {}, { _env: { NULL_ENV: "abc" } }))
        .step(cfg => expect(cfg.test).toBe("abc"));
    });

    it("should return an array default as is", () => {
      const list = [1, 2];
      return verify({ timeout: 500 })
        .step(() => xenvConfig({ test: { env: "ARR_ENV", default: list } }, {}, { _env: {} }))
        .step(cfg => {
          expect(cfg.test).toBe(list);
          expect(cfg.__$trace__.test).toStrictEqual({ src: "default" });
        });
    });

    it("should take the first array source found without merging", () => {
      const spec = { test: { env: "ARR_ENV", default: [1, 2] } };
      return verify({ timeout: 500 })
        .step(() => xenvConfig(spec, { test: [7] }, { _env: { ARR_ENV: "[3]" } }))
        .keep.step(cfg => {
          expect(cfg.test).toStrictEqual([3]);
          expect(cfg.__$trace__.test).toStrictEqual({ src: "env", name: "ARR_ENV" });
        })
        .step(() => xenvConfig(spec, { test: [7] }, { _env: {} }))
        .step(cfg => expect(cfg.test).toStrictEqual([7]));
    });
  });

  describe("unknown source", function() {
    it("should throw up front, even when an earlier source has the value", () => {
      const spec = { test: { default: "d" } };
      const message = 'xenv-config: unknown source "bogus"; valid sources are env, option, default';
      return verify({ timeout: 500 })
        .expectError.step(() => xenvConfig(spec, { test: "o" }, { sources: ["option", "bogus"] }))
        .step(err => expect((err as Error).message).toBe(message))
        .expectError.step(() => xenvConfig({}, {}, { sources: ["toString"] }))
        .step(err => expect((err as Error).message).toContain('unknown source "toString"'));
    });
  });

  describe("object type alias", function() {
    it("should treat type object as json", () => {
      return verify({ timeout: 500 })
        .step(() =>
          xenvConfig({ test: { env: "OBJ_ENV", type: "object" } }, { test: { o: 1 } }, { _env: { OBJ_ENV: '{"e":1}' } })
        )
        .step(cfg => {
          expect(cfg.test).toStrictEqual({ o: 1, e: 1 });
          expect(cfg.__$trace__.test).toStrictEqual({ src: "env,option", name: "OBJ_ENV" });
        });
    });
  });

  describe("json trace name", function() {
    it("should leave name out when env did not contribute", () => {
      return verify({ timeout: 500 })
        .step(() =>
          xenvConfig({ test: { env: "JSON_ENV", default: { d: 1 } } }, { test: { o: 1 } }, { _env: {} })
        )
        .step(cfg => expect(cfg.__$trace__.test).toStrictEqual({ src: "option,default" }));
    });
  });
});
