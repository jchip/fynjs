import { describe, expect, it } from "vitest";
import { NixClap, UnknownCliArgError, UnknownOptionError } from "../../src/index.js";

describe("inherited property names in CLI input", () => {
  const config = { noDefaultHandlers: true, help: false } as const;

  it.each(["ordinary", "constructor", "toString"])("accepts %s as a positional value", name => {
    const nc = new NixClap(config).init2({ args: "<name string>" });

    const parsed = nc.parse2([name]);

    expect(parsed.errorNodes).toEqual([]);
    expect(parsed.command.args).toMatchObject({ name });
    expect(parsed.command.jsonMeta.argList).toEqual([name]);
  });

  it.each(["ordinary", "constructor", "toString"])(
    "reports an ordinary unknown-input error for %s",
    name => {
      const nc = new NixClap(config).init2({});

      const parsed = nc.parse2([name]);

      expect(parsed.errorNodes).toHaveLength(1);
      expect(parsed.errorNodes[0].error).toBeInstanceOf(UnknownCliArgError);
      expect(parsed.errorNodes[0].error.message).toContain(`unknown CLI argument '${name}'`);
    }
  );

  it.each(["ordinary", "constructor", "toString"])(
    "reports an ordinary unknown-option error for --%s",
    name => {
      const nc = new NixClap(config).init2({});

      const parsed = nc.parse2([`--${name}`]);

      expect(parsed.errorNodes).toHaveLength(1);
      expect(parsed.errorNodes[0].error).toBeInstanceOf(UnknownOptionError);
      expect(parsed.errorNodes[0].error.message).toContain(`unknown CLI option '${name}'`);
    }
  );
});
