import _ from "lodash";
import fs from "fs";
import { describe, it, expect, afterEach } from "vitest";
import Confippet from "../../src/index.js";

afterEach(() => {
  delete process.env.NODE_APP_INSTANCE;
  delete process.env.foo1;
});

describe("processConfig", () => {
  it("should do nothing for empty config", () => {
    expect(Confippet.processConfig().length).toBe(0);
    expect(Confippet.processConfig(false).length).toBe(0);
    expect(Confippet.processConfig("").length).toBe(0);
    expect(Confippet.processConfig({}).length).toBe(0);
    expect(Confippet.processConfig([]).length).toBe(0);
    expect(Confippet.processConfig(undefined).length).toBe(0);
    expect(Confippet.processConfig(null).length).toBe(0);
  });

  it("should not process config w/o templates", () => {
    const config = {
      a: "a",
      d1234: true,
      etewe: 50,
      "f-qeoir": {
        "g~1234{{}}": {
          h: 100
        }
      }
    };

    const save = _.cloneDeep(config);
    Confippet.processConfig(config);
    expect(config).toEqual(save);
  });

  it("should process all templates in config", () => {
    const config: any = {
      x: "{{config.y}}",
      n0: "{{argv.0}}",
      n1: "{{argv.1}}",
      y: "{{config.testFile}}",
      p: "{{process.cwd}}",
      testFile: "{{process.cwd}}/test/data-{{env.NODE_APP_INSTANCE}}.txt",
      acwd: "{{cwd}}",
      now: "{{now}}",
      bad: "{{bad}}",
      badConf: "{{config.bad1.bad2}}",
      badN1: {
        badN2: {
          badN3: "{{config.badx.bady}}"
        }
      },
      mm: {
        nn: {
          aa: [
            { m: { n: { mx: "{{config.m.n.x}}" } } },
            { m: { n: { my: "{{config.m.n.y}}" } } }
          ]
        }
      },
      m: {
        n: { x: "50", y: "60" }
      },
      key: "{{readFile: test/data/foo.txt : ascii}}",
      key2: "{{readFile:test/data/foo.txt}}",
      crazy: "{{cwd:- now :process.cwd}}",
      pointless: "{{- pointless }}",
      lowerEnv1: "{{getEnv:foo1:lowerCase}}",
      lowerEnv2: "{{getEnv:foo1:LC}}",
      upperEnv1: "{{getEnv:foo1:upperCase}}",
      upperEnv2: "{{getEnv:foo1:UC}}",
      unchangeEnv1: "{{getEnv:foo1}}",
      unchangeEnv2: "{{getEnv:foo1:???}}",
      badEnv: "{{getEnv:bad_env}}",
      badEnv2: "{{getEnv}}",
      ui: {
        env: "{{env.NODE_ENV}}"
      }
    };

    process.env.NODE_APP_INSTANCE = "5";
    process.env.foo1 = "FooBar";
    const missing = Confippet.processConfig(config);

    expect(config.mm.nn.aa[0].m.n.mx).toBe("50");
    expect(config.mm.nn.aa[1].m.n.my).toBe("60");
    expect(config.x).toBe(`${process.cwd()}/test/data-5.txt`);
    expect(config.n0).toBe(process.argv[0]);
    expect(config.n1).toBe(process.argv[1]);
    expect(config.y).toBe(config.x);
    expect(config.p).toBe(process.cwd());
    expect(parseInt(config.now, 10)).toBeGreaterThan(0);
    expect(config.bad).toBe("");
    expect(config.badConf).toBe("");
    expect(config.key).toBe(fs.readFileSync("test/data/foo.txt").toString("ascii"));
    expect(config.key2).toBe(fs.readFileSync("test/data/foo.txt").toString("utf8"));
    expect(config.crazy).toBe(`${process.cwd()} now ${process.cwd()}`);
    expect(config.pointless).toBe(` pointless `);
    expect(config.ui.env).toBe(process.env.NODE_ENV);
    expect(config.badEnv).toBe("undefined");
    expect(config.badEnv2).toBe("undefined");
    expect(config.lowerEnv1).toBe("foobar");
    expect(config.lowerEnv2).toBe("foobar");
    expect(config.upperEnv1).toBe("FOOBAR");
    expect(config.upperEnv2).toBe("FOOBAR");
    expect(config.unchangeEnv1).toBe("FooBar");
    expect(config.unchangeEnv2).toBe("FooBar");

    expect(missing.length).toBe(3);
    expect(missing[0].path).toBe("config.bad");
    expect(missing[0].value).toBe("{{bad}}");
    expect(missing[1].path).toBe("config.badConf");
    expect(missing[1].value).toBe("{{config.bad1.bad2}}");
    expect(missing[2].path).toBe("config.badN1.badN2.badN3");
    expect(missing[2].value).toBe("{{config.badx.bady}}");
  });

  it("should take extra context from options", () => {
    const config = { greeting: "{{who}} says hi" };
    Confippet.processConfig(config, { context: { who: "confippet" } });
    expect(config.greeting).toBe("confippet says hi");
  });

  it("should throw error if readFile missing filename", () => {
    expect(() => Confippet.processConfig({ key: "{{readFile}}" })).toThrow();
  });

  it("should throw error if readFile missing file", () => {
    expect(() => Confippet.processConfig({ key: "{{readFile:missing_file.txt}}" })).toThrow();
  });

  it("should throw error for circular templates", () => {
    expect(() => Confippet.processConfig({ x: "{{config.x}}" })).toThrow(
      /Unable to process config after 20 passes/
    );
  });
});
