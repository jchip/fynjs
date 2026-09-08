import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FynpoConfigError } from "@fynpo/base";

import { reportFynpoConfigError } from "../src/index.ts";
import { logger } from "../src/logger.ts";

//
// fynpo searches up the tree for its config exactly like fyn, so the same malformed
// fynpo.json or lerna.json reaches it. It used to reach bin/fynpo.js and print
// "fynpo failed" plus a stack for what is only a typo in the user's own file. - FJM-197
//
describe("reportFynpoConfigError", () => {
  let warn;
  let exit;

  beforeEach(() => {
    warn = vi.spyOn(logger, "warn").mockImplementation(() => logger);
    exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warns with the file and parse error, and exits 1 without a stack", () => {
    const err = new FynpoConfigError("/repo/lerna.json", "Unexpected token } in JSON");

    reportFynpoConfigError(err);

    expect(warn).toHaveBeenCalledTimes(1);

    const msg = warn.mock.calls[0][0];
    expect(msg).toContain("INVALID CONFIG FILE");
    expect(msg).toContain("/repo/lerna.json");
    expect(msg).toContain("Unexpected token } in JSON");
    expect(msg).toContain("fynpo found this file");
    expect(msg).not.toContain(err.stack);

    expect(exit).toHaveBeenCalledWith(1);
  });

  //
  // A throwing fynpo.config.js still exits gracefully, but keeps the stack - it points into
  // the user's own config file. - FJM-198
  //
  it("keeps the config's own stack when the config ran and threw", () => {
    const cause = new Error("boom in config");
    const err = new FynpoConfigError("/repo/fynpo.config.js", cause.message, cause);

    reportFynpoConfigError(err);

    expect(warn).toHaveBeenCalledTimes(1);

    const msg = warn.mock.calls[0][0];
    expect(msg).toContain("CONFIG FILE FAILED TO LOAD");
    expect(msg).toContain("fynpo found this file");
    expect(msg).toContain(cause.stack.split("\n")[1].trim());

    expect(exit).toHaveBeenCalledWith(1);
  });

  it("rethrows anything else so bin/fynpo.js still reports it with a stack", () => {
    const err = new Error("something actually broke");

    expect(() => reportFynpoConfigError(err)).toThrow(err);
    expect(warn).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });
});
