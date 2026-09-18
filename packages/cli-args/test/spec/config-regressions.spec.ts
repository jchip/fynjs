import { describe, it, expect } from "vitest";
import { NixClap } from "../../src/nix-clap.js";

describe("configuration regressions", () => {
  const noOutputExit = {
    output: () => undefined,
    exit: () => undefined
  };

  it("applies configuration before metadata is read", () => {
    const nc = new NixClap(noOutputExit).init({
      name: { args: "<name string>", argDefault: "default" }
    });
    const { command } = nc.parse([], 0);

    command.applyConfig({ name: "configured" });

    expect(command.opts.name).toBe("configured");
    expect(command.source.name).toBe("user");
  });

  it("refreshes option metadata after configuration replaces a cached default", () => {
    const nc = new NixClap(noOutputExit).init({
      name: { args: "<name string>", argDefault: "default" }
    });
    const { command } = nc.parse([], 0);
    expect(command.opts.name).toBe("default");

    command.applyConfig({ name: "configured" });

    expect.soft(command.opts.name).toBe("configured");
    expect.soft(command.source.name).toBe("user");
    expect.soft(command.optsFull.name).toEqual({ 0: "configured", name: "configured" });
    expect.soft(command.options.name).toEqual({ 0: "configured", name: "configured" });
    expect.soft(command.jsonMeta.opts.name).toBe("configured");
  });

  it("updates camelCase aliases when configuration replaces a default before metadata is read", () => {
    const nc = new NixClap(noOutputExit).init({
      "server-name": { args: "<name string>", argDefault: "default" }
    });
    const { command } = nc.parse([], 0);

    command.applyConfig({ "server-name": "configured" });

    expect(command.opts["server-name"]).toBe("configured");
    expect(command.source["server-name"]).toBe("user");
    expect.soft(command.opts.serverName).toBe("configured");
    expect.soft(command.source.serverName).toBe("user");
    expect.soft(command.optsFull.serverName).toEqual(command.optsFull["server-name"]);
  });

  it("refreshes cached ancestor metadata after a nested command receives configuration", () => {
    const nc = new NixClap(noOutputExit).init({}, {
      parent: {
        subCommands: {
          child: { options: { port: { args: "<value number>", argDefault: "80" } } }
        }
      }
    });
    const { command } = nc.parse(["parent", "child"], 0);
    const parent = command.subCmdNodes.parent;
    const child = parent.subCmdNodes.child;
    expect(command.subCommands.parent.subCommands.child.opts.port).toBe(80);

    child.applyConfig({ port: 90 });

    expect(child.opts.port).toBe(90);
    expect(parent.subCommands.child.opts.port).toBe(90);
    expect(command.subCommands.parent.subCommands.child.opts.port).toBe(90);
    expect(command.subCommands.parent.subCommands.child.source.port).toBe("user");

    child.applyConfig({ port: 100 }, "default");

    expect(command.subCommands.parent.subCommands.child.opts.port).toBe(100);
    expect(command.subCommands.parent.subCommands.child.source.port).toBe("default");
  });

  it("preserves CLI values and their camelCase aliases when configuration is applied", () => {
    const nc = new NixClap(noOutputExit).init({
      "server-name": { args: "<name string>", argDefault: "default" }
    });
    const { command } = nc.parse(["--server-name", "cli-value"], 0);
    expect(command.opts.serverName).toBe("cli-value");

    command.applyConfig({ "server-name": "configured" });

    expect(command.opts).toEqual({ "server-name": "cli-value", serverName: "cli-value" });
    expect(command.source).toEqual({ "server-name": "cli", serverName: "cli" });
  });

  it("refreshes synthesized aliases across repeated configuration updates", () => {
    const nc = new NixClap(noOutputExit).init({
      "server-name": { args: "<name string>", argDefault: "default" }
    });
    const { command } = nc.parse([], 0);
    expect(command.opts.serverName).toBe("default");

    command.applyConfig({ "server-name": "first" });
    expect(command.opts.serverName).toBe("first");
    command.applyConfig({ "server-name": "second" });

    expect(command.opts).toEqual({ "server-name": "second", serverName: "second" });
    expect(command.source).toEqual({ "server-name": "user", serverName: "user" });
    expect(command.jsonMeta.optsCount).toEqual({ "server-name": 1, serverName: 1 });
  });

  it("preserves independently declared options whose names collide with camelCase aliases", () => {
    const nc = new NixClap(noOutputExit).init({
      "server-name": { args: "<name string>", argDefault: "default" },
      serverName: { args: "<name string>", argDefault: "independent" }
    });
    const { command } = nc.parse([], 0);

    command.applyConfig({ "server-name": "configured" });

    expect(command.opts).toEqual({ "server-name": "configured", serverName: "independent" });
    expect(command.source).toEqual({ "server-name": "user", serverName: "default" });
  });
});
