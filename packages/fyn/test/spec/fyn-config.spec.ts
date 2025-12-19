/* eslint-disable prefer-spread */

// This test uses CommonJS-style require/mock-require for module mocking
// which requires require.cache manipulation - keeping createRequire for this purpose
import { createRequire } from "module";
import mockRequire from "mock-require";

const xrequire = createRequire(import.meta.url);

describe("fyn-config", function() {
  describe("fynDir", () => {
    let xenvStub;
    before(() => {
      delete xrequire.cache[xrequire.resolve("../../lib/fyn-config")];
      delete xrequire.cache[xrequire.resolve("xenv-config")];
      mockRequire("xenv-config", function() {
        return xenvStub.apply(null, Array.prototype.slice.apply(arguments));
      });
    });

    after(() => {
      mockRequire.stopAll();
    });

    it("should have post processor", () => {
      let spec;
      xenvStub = x => {
        spec = x;
        return { fynDir: "test" };
      };
      const fynConfig = xrequire("../../lib/fyn-config").default;
      fynConfig({});
      expect(spec).to.exist;
      expect(spec.fynDir.post).to.exist;
      expect(
        spec.fynDir.post("test", { src: "env", name: "HOME" }),
        "should append .fyn to user HOME dir for fynDir"
      ).to.equal("test/.fyn");

      expect(
        spec.fynDir.post("test", { src: "default" }),
        "should append .fyn to default dir for fynDir"
      ).to.equal("test/.fyn");
    });
  });
});
