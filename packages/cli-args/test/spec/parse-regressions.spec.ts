import { describe, expect, it } from "vitest";
import { verify } from "run-verify";
import { NixClap, InvalidArgSpecifierError } from "../../src/index.js";
import { defaultExit } from "../../src/nix-clap.js";

const quiet = { noDefaultHandlers: true, output: () => undefined, exit: () => undefined };
const argv = (...args: string[]) => ["node", "cli.js", ...args];
const errorsOf = (parsed: { errorNodes: { errors: Error[] }[] }) =>
  parsed.errorNodes.flatMap(n => n.errors.map(e => e.message));

describe("required options", () => {
  it("argDefault satisfies required", async () => {
    await verify({ timeout: 500 })
      .step(() =>
        new NixClap(quiet)
          .init({ foo: { args: "<v string>", required: true, argDefault: "x" } })
          .parse2(argv(), 2)
      )
      .keep.step(parsed => expect(errorsOf(parsed)).toEqual([]))
      .keep.step(parsed => expect(parsed.command.opts.foo).toBe("x"))
      .step(parsed => expect(parsed.command.source.foo).toBe("default"));
  });

  it("required without argDefault still reports missing", async () => {
    await verify({ timeout: 500 })
      .step(() =>
        new NixClap(quiet).init({ foo: { args: "<v string>", required: true } }).parse2(argv(), 2)
      )
      .step(parsed => expect(errorsOf(parsed)).toEqual(["missing these required options foo"]));
  });
});

describe("negative number option values", () => {
  const parse = (...args: string[]) =>
    new NixClap(quiet)
      .init({
        n: { alias: "x", args: "<v number>" },
        f: { args: "<v float>" },
        s: { args: "<v string>" },
        nums: { args: "<v number..>" },
        b: { args: "<v boolean>" }
      })
      .parse2(argv(...args), 2);

  const cases: [string[], string, unknown][] = [
    [["--n", "-5"], "n", -5],
    [["-x", "-5"], "n", -5],
    [["--f", "-2.5"], "f", -2.5],
    [["--f", "-.5"], "f", -0.5],
    [["--s", "-5"], "s", "-5"],
    [["--nums", "-1", "2", "-3"], "nums", [-1, 2, -3]]
  ];

  for (const [args, name, expected] of cases) {
    it(`${args.join(" ")} gives ${name} = ${JSON.stringify(expected)}`, async () => {
      await verify({ timeout: 500 })
        .step(() => parse(...args))
        .keep.step(parsed => expect(errorsOf(parsed)).toEqual([]))
        .step(parsed => expect(parsed.command.opts[name]).toEqual(expected));
    });
  }

  it("--n=-5 still works", async () => {
    await verify({ timeout: 500 })
      .step(() => parse("--n=-5"))
      .step(parsed => expect(parsed.command.opts.n).toBe(-5));
  });

  it("a boolean option does not take a negative number", async () => {
    await verify({ timeout: 500 })
      .step(() => parse("--b", "-5"))
      .keep.step(parsed => expect(parsed.command.opts.b).toBe(true))
      .step(parsed => expect(errorsOf(parsed)).toEqual(["Encountered unknown CLI option '5'."]));
  });

  it("a negative number with no open option is still an option", async () => {
    await verify({ timeout: 500 })
      .step(() => parse("-5"))
      .step(parsed => expect(errorsOf(parsed)).toEqual(["Encountered unknown CLI option '5'."]));
  });

  it("a full option takes no more negative numbers", async () => {
    await verify({ timeout: 500 })
      .step(() => parse("--n", "1", "-5"))
      .keep.step(parsed => expect(parsed.command.opts.n).toBe(1))
      .step(parsed => expect(errorsOf(parsed)).toEqual(["Encountered unknown CLI option '5'."]));
  });
});

describe("handlers config", () => {
  it("applies with noDefaultHandlers", async () => {
    const calls: string[] = [];
    await verify({ timeout: 500 })
      .step(() =>
        new NixClap({ ...quiet, handlers: { "parse-fail": () => void calls.push("fail") } }).init(
          {}
        )
      )
      .step(nc => nc.parse(argv("--bad"), 2))
      .step(() => expect(calls).toEqual(["fail"]));
  });

  it("applies for an event not in the default table", async () => {
    const calls: string[] = [];
    await verify({ timeout: 500 })
      .step(() => new NixClap({ ...quiet, handlers: { custom: () => void calls.push("custom") } }))
      .step(nc => nc.emit("custom"))
      .step(() => expect(calls).toEqual(["custom"]));
  });

  it("an exit handler replaces the default exit", async () => {
    const codes: unknown[] = [];
    await verify({ timeout: 500 })
      .step(
        () =>
          new NixClap({
            output: () => undefined,
            version: "1.0.0",
            handlers: { exit: (code: any) => void codes.push(code) }
          })
      )
      .keep.step(nc => expect(nc.listeners("exit")).not.toContain(defaultExit))
      .keep.step(nc => expect(nc.listenerCount("exit")).toBe(1))
      .step(nc => nc.showVersion())
      .step(() => expect(codes).toEqual([0]));
  });

  it("exit: false removes the default exit", async () => {
    await verify({ timeout: 500 })
      .step(() => new NixClap({ handlers: { exit: false } }))
      .step(nc => expect(nc.listenerCount("exit")).toBe(0));
  });
});

describe("root option aliases", () => {
  it("a root option can use alias h", async () => {
    await verify({ timeout: 500 })
      .step(() => new NixClap(quiet).init({ host: { alias: "h", args: "<v string>" } }))
      .step(nc => nc.parse2(argv("-h", "a"), 2))
      .keep.step(parsed => expect(errorsOf(parsed)).toEqual([]))
      .step(parsed => expect(parsed.command.opts.host).toBe("a"));
  });

  it("a root option can use alias ?, and help keeps h", async () => {
    await verify({ timeout: 500 })
      .step(() => new NixClap(quiet).init({ q: { alias: "?" } }))
      .keep.step(nc => expect(nc.parse2(argv("-?"), 2).command.opts.q).toBe(true))
      .step(nc => nc.parse2(argv("-h"), 2))
      .step(parsed => expect(parsed.command.optNodes.help.source).toBe("cli"));
  });
});

describe("version alias", () => {
  it("a string option alias does not block a version alias it contains", async () => {
    await verify({ timeout: 500 })
      .step(() => new NixClap({ ...quiet, version: "1.0.0" }).init({ verbose: { alias: "vv" } }))
      .step(nc => nc.parse2(argv("-v"), 2))
      .keep.step(parsed => expect(errorsOf(parsed)).toEqual([]))
      .step(parsed => expect(parsed.command.optNodes.version.source).toBe("cli"));
  });
});

describe("args specifier errors", () => {
  it("a variadic arg that is not last throws InvalidArgSpecifierError", async () => {
    await verify({ timeout: 500 })
      .expectErrorToBe(InvalidArgSpecifierError)
      .expectErrorHas("only the last one can be variadic")
      .step(() => new NixClap(quiet).init({ x: { args: "<a..> <b>" } }));
  });
});

describe("skipExec", () => {
  it("returns the instance", async () => {
    await verify({ timeout: 500 })
      .step(() => new NixClap(quiet))
      .step(nc => expect(nc.skipExec()).toBe(nc));
  });
});

describe("helpZebra", () => {
  const options = {
    a: { args: "<v string>", desc: "first" },
    b: { args: "<v string>", desc: "second" }
  };

  it("is per instance", async () => {
    await verify({ timeout: 500 })
      .step(() => new NixClap({ ...quiet, helpZebra: false }).init(options))
      .keep.step(() => new NixClap({ ...quiet, helpZebra: true }).init(options).makeHelp())
      .step(nc => expect(nc.makeHelp().join("\n")).not.toContain("·"));
  });

  it("still stripes when enabled", async () => {
    await verify({ timeout: 500 })
      .step(() => new NixClap({ ...quiet, helpZebra: true }).init(options))
      .keep.step(() => new NixClap({ ...quiet, helpZebra: false }).init(options).makeHelp())
      .step(nc => expect(nc.makeHelp().join("\n")).toContain("·"));
  });
});
