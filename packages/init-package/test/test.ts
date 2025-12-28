import { runInitPackage } from "../src/index.ts";
import { describe, it, expect } from "vitest";

describe("init-package", function () {
  it("should have runInitPackage", () => {
    expect(runInitPackage).toBeInstanceOf(Function);
  });
});
