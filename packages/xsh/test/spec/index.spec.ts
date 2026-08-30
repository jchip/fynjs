import { describe, it, expect } from "vitest";
import xsh from "../../src/index.ts";

describe("xsh", function () {
  it("should take a custom Promise", () => {
    (xsh as any).Promise = "test";
    expect(xsh.Promise).to.equal("test");
    (xsh as any).Promise = null;
    expect(xsh.Promise).to.equal(Promise);
  });

  it("should expose shelljs as $", () => {
    expect(xsh.$).to.be.ok;
    expect(xsh.$.exec).to.be.a("function");
  });
});
