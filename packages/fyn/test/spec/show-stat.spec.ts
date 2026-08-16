import { describe, it } from "vitest";
import { expect } from "chai";
import showStat from "../../cli/show-stat";

describe("showStat", function () {
  it("propagates dependency resolution failures", async () => {
    const error = new Error("resolution failed");
    const fyn: any = {
      _options: {},
      resolveDependencies: async () => {
        throw error;
      }
    };

    let caught;
    try {
      await showStat(fyn, ["pkg"]);
    } catch (err) {
      caught = err;
    }

    expect(caught).to.equal(error);
  });
});
