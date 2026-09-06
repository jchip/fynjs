import { describe, it, expect } from "vitest";
import xsh from "../../src/index.ts";

describe("mkcmd", function () {
  it("join a single array", () => {
    expect(xsh.mkCmd(["a", "b", "c"])).toBe("a b c");
  });

  it("join arguments", () => {
    expect(xsh.mkCmd("a", "b", "c")).toBe("a b c");
  });
});
