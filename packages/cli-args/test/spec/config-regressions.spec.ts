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
});
