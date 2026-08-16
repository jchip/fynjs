import { describe, it } from "vitest";
import { expect } from "chai";
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

        expect(caught).to.equal(error);
        expect(exits).to.deep.equal([]);
      } finally {
        (fyntil as any).exit = savedExit;
      }
    });
  });
});
