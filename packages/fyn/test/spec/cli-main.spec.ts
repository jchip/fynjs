import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import {
  getRunExitCode,
  pickEnvOptions,
  run as runCli,
  setLockfile,
  reportFynpoLoadError
} from "../../cli/main";
import FynCli from "../../cli/fyn-cli";
import { FynpoConfigError } from "@fynpo/base";
import logger from "../../lib/logger";
import fynTil from "../../lib/util/fyntil";

describe("cli/main", function() {
  describe("getRunExitCode", function() {
    it("prefers the child exit code over errno", () => {
      expect(getRunExitCode({ code: 5, errno: -2 })).toBe(5);
    });
  });

  describe("run --if-present", function() {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    const expectIfPresent = async (args: string[]) => {
      const run = vi.spyOn(FynCli.prototype, "run").mockResolvedValue(undefined);

      await runCli(args, 0);

      expect(run).toHaveBeenCalledTimes(1);
      expect(run.mock.calls[0][0]).toMatchObject({
        args: { script: "missing" },
        opts: { ifPresent: true }
      });
    };

    it("passes the option through the normal run command", async () => {
      await expectIfPresent(["run", "--if-present", "missing"]);
    });

    it("passes the option through the script shorthand", async () => {
      await expectIfPresent(["missing", "--if-present"]);
    });
  });

  describe("setLockfile", function() {
    it("updates the nested option consumed by Fyn and returns its previous value", () => {
      const config = { opts: { lockfile: true } };

      expect(setLockfile(config, false)).toBe(true);
      expect(config.opts.lockfile).toBe(false);
      expect(config).not.toHaveProperty("lockfile");
    });
  });

  describe("pickEnvOptions", function() {
    let saved;

    beforeEach(() => {
      saved = process.env.NODE_ENV;
    });

    afterEach(() => {
      if (saved === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = saved;
      }
    });

    it("sets production true when NODE_ENV=production", () => {
      process.env.NODE_ENV = "production";
      expect(pickEnvOptions()).toStrictEqual({ production: true });
    });

    it("sets production false when NODE_ENV is another value", () => {
      process.env.NODE_ENV = "development";
      expect(pickEnvOptions()).toStrictEqual({ production: false });
    });

    it("returns empty object when NODE_ENV is not set", () => {
      delete process.env.NODE_ENV;
      expect(pickEnvOptions()).toStrictEqual({});
    });
  });

  //
  // fyn walks up the whole tree looking for a monorepo root, so a malformed lerna.json or
  // fynpo.json in any ancestor directory reaches it. That is the user's typo, not a fyn bug,
  // and it used to print a raw stack. - FJM-197
  //
  describe("reportFynpoLoadError", function() {
    let warn;
    let error;
    let exit;

    beforeEach(() => {
      warn = vi.spyOn(logger, "warn").mockImplementation(() => logger);
      error = vi.spyOn(logger, "error").mockImplementation(() => logger);
      exit = vi.spyOn(fynTil, "exit").mockImplementation(() => undefined as never);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("warns with the file and parse error, and exits 1 without a stack", () => {
      const err = new FynpoConfigError("/repo/fynpo.json", "Unexpected token } in JSON");

      reportFynpoLoadError(err);

      expect(error).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);

      const msg = warn.mock.calls[0][0];
      expect(msg).toContain("INVALID CONFIG FILE");
      expect(msg).toContain("/repo/fynpo.json");
      expect(msg).toContain("Unexpected token } in JSON");
      expect(msg).not.toContain(err.stack);

      expect(exit).toHaveBeenCalledWith(1);
    });

    //
    // A throwing fynpo.config.js exits the same graceful way, but the stack stays: it points
    // into the user's own config, which is exactly what they need to fix it. - FJM-198
    //
    it("keeps the config's own stack when the config ran and threw", () => {
      const cause = new Error("boom in config");
      const err = new FynpoConfigError("/repo/fynpo.config.js", cause.message, cause);

      reportFynpoLoadError(err);

      expect(error).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);

      const msg = warn.mock.calls[0][0];
      expect(msg).toContain("CONFIG FILE FAILED TO LOAD");
      expect(msg).toContain("/repo/fynpo.config.js");
      expect(msg).toContain(cause.stack.split("\n")[1].trim());

      expect(exit).toHaveBeenCalledWith(1);
    });

    it("still prints the stack for a failure that is not a bad config", () => {
      const err = new Error("something actually broke");

      reportFynpoLoadError(err);

      expect(warn).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(err.stack);
      expect(exit).toHaveBeenCalledWith(1);
    });
  });
});
