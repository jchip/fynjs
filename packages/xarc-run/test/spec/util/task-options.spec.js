import taskOptionsModule, {
  normalizeTaskOptions,
  normalizeTaskCommands,
  getTaskOptionSpec
} from "../../../lib/util/task-options.js";
import XTaskSpec from "../../../lib/xtask-spec.js";
import { NixClap } from "@fynjs/cli-args";
import { expect, describe, it } from "vitest";

describe("task-options utility", () => {
  it("should handle falsy or non-object rawOpts", () => {
    expect(normalizeTaskOptions()).toStrictEqual({});
    expect(normalizeTaskOptions(null)).toStrictEqual({});
    expect(normalizeTaskOptions("invalid")).toStrictEqual({});
    expect(taskOptionsModule.normalizeTaskOptions()).toStrictEqual({});
  });

  it("should skip non-object specs", () => {
    const raw = {
      foo: null,
      bar: "invalid",
      baz: 123,
      valid: { required: true, args: "<val string>" }
    };
    expect(normalizeTaskOptions(raw)).toStrictEqual({
      valid: { required: true, args: "<val string>" }
    });
  });

  it("should normalize legacy require and type", () => {
    const raw = {
      opt1: { require: true, type: "string", alias: "o" },
      opt2: { require: false, type: "number" },
      opt3: { type: "array", alias: "a" },
      opt4: { require: true, type: "array" },
      opt5: { type: "count", alias: "c" },
      opt6: { type: "count", counting: 5 }
    };
    expect(normalizeTaskOptions(raw)).toStrictEqual({
      opt1: { required: true, args: "<val string>", alias: "o" },
      opt2: { required: false, args: "<val number>" },
      opt3: { args: "[val string..]", alias: "a" },
      opt4: { required: true, args: "<val string..>" },
      opt5: { counting: Infinity, alias: "c" },
      opt6: { counting: 5 }
    });
  });

  it("should normalize type-only bracket notations", () => {
    const raw = {
      str: { args: "<string>" },
      num: { args: "[number]" },
      bool: { args: "<boolean>" },
      arr: { args: "[array]" },
      arrReq: { args: "<array>" },
      custom: { args: "<custom>" },
      customOpt: { args: "[customOpt]" },
      named: { args: "<foo string>" }
    };
    expect(normalizeTaskOptions(raw)).toStrictEqual({
      str: { args: "<val string>" },
      num: { args: "[val number]" },
      bool: { args: "<val boolean>" },
      arr: { args: "[val string..]" },
      arrReq: { args: "<val string..>" },
      custom: { args: "<custom>" },
      customOpt: { args: "[customOpt]" },
      named: { args: "<foo string>" }
    });
  });

  it("should produce valid NixClap specs for array and count options (FJM-194)", () => {
    const raw = {
      arr: { type: "array" },
      arrReq: { require: true, type: "array" },
      count: { type: "count", alias: "c" },
      bracketArr: { args: "[array]" },
      bracketArrReq: { args: "<array>" }
    };
    const options = normalizeTaskOptions(raw);
    const nc = new NixClap().init(options);
    const parsed = nc.parse(
      [
        "node",
        "test",
        "--arr",
        "foo",
        "bar",
        "--arrReq",
        "req1",
        "req2",
        "-ccc",
        "--bracketArr",
        "baz",
        "--bracketArrReq",
        "qux"
      ],
      2
    );
    expect(parsed.command.opts.arr).toStrictEqual(["foo", "bar"]);
    expect(parsed.command.opts.arrReq).toStrictEqual(["req1", "req2"]);
    expect(parsed.command.opts.count).toBe(3);
    expect(parsed.command.opts.c).toBe(3);
    expect(parsed.command.opts.bracketArr).toStrictEqual(["baz"]);
    expect(parsed.command.opts.bracketArrReq).toStrictEqual(["qux"]);
  });

  it("should extract task option spec from various shapes", () => {
    expect(getTaskOptionSpec(null)).toStrictEqual({
      options: {},
      commands: {},
      allowUnknownOption: undefined
    });

    const taskWithCliParser = {
      cliParser: {
        options: { foo: { required: true, args: "<val string>" } },
        commands: { sub: { desc: "subcommand" } },
        allowUnknownOption: false
      }
    };
    expect(getTaskOptionSpec(taskWithCliParser)).toStrictEqual({
      options: { foo: { required: true, args: "<val string>" } },
      commands: { sub: { desc: "subcommand" } },
      allowUnknownOption: false
    });

    const taskWithItem = {
      item: {
        argOpts: { bar: { args: "<val string>" } },
        allowUnknownOption: true
      }
    };
    expect(getTaskOptionSpec(taskWithItem)).toStrictEqual({
      options: { bar: { args: "<val string>" } },
      commands: {},
      allowUnknownOption: true
    });

    expect(taskOptionsModule.getTaskOptionSpec(taskWithItem)).toStrictEqual({
      options: { bar: { args: "<val string>" } },
      commands: {},
      allowUnknownOption: true
    });

    const spec = new XTaskSpec({ cmd: "echo $FOO", env: { FOO: "bar" } });
    expect(getTaskOptionSpec({ item: spec })).toStrictEqual({
      options: {},
      commands: {},
      allowUnknownOption: undefined
    });
  });

  describe("normalizeTaskCommands", () => {
    it("should handle falsy or empty rawCmds", () => {
      expect(normalizeTaskCommands()).toStrictEqual({});
      expect(normalizeTaskCommands(null)).toStrictEqual({});
      expect(taskOptionsModule.normalizeTaskCommands(null)).toStrictEqual({});
    });

    it("should normalize subcommand options and nested subcommands", () => {
      const raw = {
        deploy: {
          desc: "deploy task",
          options: {
            env: { type: "string" }
          },
          commands: {
            stage: {
              desc: "deploy to stage",
              options: {
                tag: { type: "string" }
              }
            }
          }
        },
        primitive: "not an object"
      };

      expect(normalizeTaskCommands(raw)).toStrictEqual({
        deploy: {
          desc: "deploy task",
          options: {
            env: { args: "<val string>" }
          },
          subCommands: {
            stage: {
              desc: "deploy to stage",
              options: {
                tag: { args: "<val string>" }
              }
            }
          }
        },
        primitive: "not an object"
      });
    });

    it("should accept cliParser with subCommands (FJM-196)", () => {
      const taskWithSubCommands = {
        cliParser: {
          subCommands: {
            child: {
              desc: "child subcommand",
              options: {
                flag: { type: "string" }
              }
            }
          }
        }
      };

      expect(getTaskOptionSpec(taskWithSubCommands)).toStrictEqual({
        options: {},
        commands: {
          child: {
            desc: "child subcommand",
            options: {
              flag: { args: "<val string>" }
            }
          }
        },
        allowUnknownOption: undefined
      });
    });
  });
});
