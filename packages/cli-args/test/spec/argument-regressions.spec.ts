import { describe, expect, it } from "vitest";
import { NixClap, UnknownCliArgError } from "../../src/index.js";

describe("option argument boundaries", () => {
  it.each([
    { argv: ["--name=", "list"], value: "" },
    { argv: ["--name", "", "list"], value: "" },
    { argv: ["--name=x", "list"], value: "x" }
  ])("keeps the command following $argv", ({ argv, value }) => {
    const nc = new NixClap().init({ name: { args: "<name string>" } }, { list: {} });
    const { command, errorNodes } = nc.parse2(argv);

    expect(errorNodes).toEqual([]);
    expect(command.opts.name).toBe(value);
    expect(Object.keys(command.subCmdNodes)).toEqual(["list"]);
    expect(command.optNodes.name.argsList).toEqual([value]);
  });
});

describe("array argument results", () => {
  it.each(["<n number..1>", "<n number..1,1>"])("preserves one-element arrays for %s", args => {
    const nc = new NixClap().init({ nums: { args } }, { sum: { args } });
    const { command, errorNodes } = nc.parse2(["--nums", "1", "sum", "2"]);

    expect(errorNodes).toEqual([]);
    expect(command.opts.nums).toEqual([1]);
    expect(command.subCommands.sum.args).toEqual({ 0: [2], n: [2] });
  });

  it("continues gathering an array after its first inline value", () => {
    const nc = new NixClap().init({ nums: { args: "<n number..3>" } });
    const { command, errorNodes } = nc.parse2(["--nums=1", "2", "3"]);

    expect(errorNodes).toEqual([]);
    expect(command.opts.nums).toEqual([1, 2, 3]);
  });

  it("preserves a final array after a scalar argument", () => {
    const args = "<label string> <n number..3>";
    const nc = new NixClap().init({ nums: { args } }, { sum: { args } });
    const { command, errorNodes } = nc.parse2([
      "--nums", "option", "1", "2", "3", "sum", "command", "4", "5", "6"
    ]);

    expect(errorNodes).toEqual([]);
    expect(command.optsFull.nums).toEqual({ 0: "option", label: "option", 1: [1, 2, 3], n: [1, 2, 3] });
    expect(command.subCommands.sum.args).toEqual({ 0: "command", label: "command", 1: [4, 5, 6], n: [4, 5, 6] });
  });

  it.each(["<n number..3>", "<n number..3,3>", "<n number..3,4>"])(
    "preserves every option value for %s",
    args => {
      const nc = new NixClap().init({ nums: { args } });
      const { command, errorNodes } = nc.parse2(["--nums", "1", "2", "3"]);

      expect(errorNodes).toEqual([]);
      expect(command.opts.nums).toEqual([1, 2, 3]);
      expect(command.optsFull.nums).toEqual({ 0: [1, 2, 3], n: [1, 2, 3] });
    }
  );

  it.each(["<n number..3>", "<n number..3,3>", "<n number..3,4>"])(
    "preserves every command value for %s",
    args => {
      const nc = new NixClap().init({}, { sum: { args } });
      const { command, errorNodes } = nc.parse2(["sum", "1", "2", "3"]);

      expect(errorNodes).toEqual([]);
      expect(command.subCommands.sum.args).toEqual({ 0: [1, 2, 3], n: [1, 2, 3] });
    }
  );
});

describe.each([
  { invocation: "implicit", prefix: [] },
  { invocation: "explicit", prefix: ["run"] }
])("$invocation fallback command argument limits", ({ prefix }) => {
  it.each(["<script string>", "[script string]"])(
    "rejects surplus arguments after the single slot in %s",
    args => {
      const nc = new NixClap({ unknownCommandFallback: "run" }).init({}, { run: { args } });
      const { command, errorNodes } = nc.parse2([...prefix, "foo", "bar", "baz"]);
      const errors = errorNodes.flatMap(node => node.errors);

      expect(command.subCommands.run.args.script).toBe("foo");
      expect(errors).toEqual([
        expect.objectContaining({ arg: "bar" }),
        expect.objectContaining({ arg: "baz" })
      ]);
      errors.forEach(error => expect(error).toBeInstanceOf(UnknownCliArgError));
    }
  );

  it("rejects surplus arguments after two slots", () => {
    const nc = new NixClap({ unknownCommandFallback: "run" }).init(
      {},
      { run: { args: "<script string> <other string>" } }
    );
    const { command, errorNodes } = nc.parse2([...prefix, "foo", "bar", "baz"]);
    const errors = errorNodes.flatMap(node => node.errors);

    expect(command.subCommands.run.args).toMatchObject({ script: "foo", other: "bar" });
    expect(errors).toEqual([expect.objectContaining({ arg: "baz" })]);
    expect(errors[0]).toBeInstanceOf(UnknownCliArgError);
  });

  it("accepts every variadic argument", () => {
    const nc = new NixClap({ unknownCommandFallback: "run" }).init(
      {},
      { run: { args: "<script string..>" } }
    );
    const { command, errorNodes } = nc.parse2([...prefix, "foo", "bar", "baz"]);

    expect(errorNodes).toEqual([]);
    expect(command.subCommands.run.args.script).toEqual(["foo", "bar", "baz"]);
  });
});
