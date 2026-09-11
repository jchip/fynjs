import { afterEach, describe, it, expect, vi } from "vitest";
import FynCli from "../../cli/fyn-cli";
import fyntil from "../../lib/util/fyntil";
import logger from "../../lib/logger";

describe("FynCli", function () {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("run --if-present", function () {
    const makeCli = (scripts = {}) => {
      const cli: any = Object.create(FynCli.prototype);
      cli._config = { _fynpo: {} };
      cli._fyn = {
        _pkg: { scripts },
        loadPkg: async () => undefined
      };
      cli.runScripts = vi.fn();
      return cli;
    };

    it("exits successfully without output when the script is missing", async () => {
      const cli = makeCli();
      const exit = vi.spyOn(fyntil, "exit").mockImplementation(() => undefined as never);
      const error = vi.spyOn(logger, "error").mockImplementation(() => logger);

      await cli.run({ opts: { ifPresent: true }, args: { script: "missing" } });

      expect(exit).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(cli.runScripts).not.toHaveBeenCalled();
    });

    it("preserves the missing-script failure without the option", async () => {
      const cli = makeCli();
      const exitError = new Error("exit");
      const exit = vi.spyOn(fyntil, "exit").mockImplementation(() => {
        throw exitError;
      });
      const error = vi.spyOn(logger, "error").mockImplementation(() => logger);

      await expect(cli.run({ opts: {}, args: { script: "missing" } })).rejects.toBe(exitError);

      expect(exit).toHaveBeenCalledWith(1);
      expect(error).toHaveBeenCalledWith(
        'Error: missing script: "missing" - not found in package.json scripts'
      );
      expect(cli.runScripts).not.toHaveBeenCalled();
    });

    it("runs an existing script normally", async () => {
      const cli = makeCli({ test: "vitest run" });

      await cli.run({ opts: { ifPresent: true }, args: { script: "test" } });

      expect(cli.runScripts).toHaveBeenCalledWith(["test"], { scriptArgs: [] });
    });

    it("preserves an existing script failure", async () => {
      const cli = makeCli({ test: "vitest run" });
      const error = new Error("script failed");
      cli.runScripts.mockRejectedValue(error);

      await expect(
        cli.run({ opts: { ifPresent: true }, args: { script: "test" } })
      ).rejects.toBe(error);
    });
  });

  describe("run --list", function () {
    it("does not exit successfully when loading the package fails", async () => {
      const error = new Error("load failed");
      const cli: any = Object.create(FynCli.prototype);
      cli._config = { _fynpo: {} };
      cli._fyn = {
        loadPkg: async () => {
          throw error;
        }
      };

      const savedExit = fyntil.exit;
      const exits: any[] = [];
      (fyntil as any).exit = (code: any) => exits.push(code);

      try {
        let caught;
        try {
          await cli.run({ opts: { list: true }, args: {} });
        } catch (err) {
          caught = err;
        }

        expect(caught).toBe(error);
        expect(exits).toStrictEqual([]);
      } finally {
        (fyntil as any).exit = savedExit;
      }
    });
  });
});
