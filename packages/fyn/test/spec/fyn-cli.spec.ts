import { describe, it, expect } from "vitest";
import FynCli from "../../cli/fyn-cli";
import fyntil from "../../lib/util/fyntil";

describe("FynCli", function () {
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

  describe("installScripts", function () {
    it("exits with 1 when approve matches nothing or is unknown", async () => {
      const cli: any = Object.create(FynCli.prototype);
      cli._opts = {};
      cli._fyn = {
        _initializePkg: async () => {},
        allowScriptsPin: true,
        blockedScripts: [],
        pendingScripts: [],
        allowScripts: {},
        denyScripts: {},
        cwd: "/tmp",
        _fynpo: {}
      };

      const savedExit = fyntil.exit;
      const exits: any[] = [];
      (fyntil as any).exit = (code: any) => exits.push(code);

      try {
        await cli.installScripts("approve", { args: { packages: ["ghost"] } });
        expect(exits).toStrictEqual([1]);

        exits.length = 0;
        await cli.installScripts("approve", { args: { packages: [] }, opts: {} });
        expect(exits).toStrictEqual([1]);

        exits.length = 0;
        await cli.installScripts("deny", { args: { packages: [] }, opts: {} });
        expect(exits).toStrictEqual([1]);
      } finally {
        (fyntil as any).exit = savedExit;
      }
    });
  });
});
