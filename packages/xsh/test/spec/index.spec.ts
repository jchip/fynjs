import { describe, it, expect } from "vitest";
import xsh from "../../src/index.ts";

describe("xsh", function () {
  it("should take a custom Promise", () => {
    (xsh as any).Promise = "test";
    expect(xsh.Promise).toBe("test");
    (xsh as any).Promise = null;
    expect(xsh.Promise).toBe(Promise);
  });

  it("should expose shelljs as $", () => {
    expect(xsh.$).toBeTruthy();
    expect(typeof xsh.$.exec).toBe("function");
  });
});
