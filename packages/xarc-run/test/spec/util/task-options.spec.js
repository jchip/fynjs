import taskOptionsModule, {
  normalizeTaskOptions,
  getTaskOptionSpec
} from "../../../lib/util/task-options.js";
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
      opt2: { require: false, type: "number" }
    };
    expect(normalizeTaskOptions(raw)).toStrictEqual({
      opt1: { required: true, args: "<val string>", alias: "o" },
      opt2: { required: false, args: "<val number>" }
    });
  });

  it("should normalize type-only bracket notations", () => {
    const raw = {
      str: { args: "<string>" },
      num: { args: "[number]" },
      bool: { args: "<boolean>" },
      arr: { args: "[array]" },
      custom: { args: "<custom>" },
      customOpt: { args: "[customOpt]" },
      named: { args: "<foo string>" }
    };
    expect(normalizeTaskOptions(raw)).toStrictEqual({
      str: { args: "<val string>" },
      num: { args: "[val number]" },
      bool: { args: "<val boolean>" },
      arr: { args: "[val array]" },
      custom: { args: "<custom>" },
      customOpt: { args: "[customOpt]" },
      named: { args: "<foo string>" }
    });
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
  });
});
