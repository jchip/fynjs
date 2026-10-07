import { describe, it, expect } from "vitest";
import { verify } from "run-verify";
import xsh from "../../src/index.ts";

describe("mkcmd", function () {
  it("join a single array", () => {
    expect(xsh.mkCmd(["a", "b", "c"])).toBe("a b c");
  });

  it("join arguments", () => {
    expect(xsh.mkCmd("a", "b", "c")).toBe("a b c");
  });

  it("flatten an array that is not the first argument", () => {
    return verify({ timeout: 1000 })
      .step(() => xsh.mkCmd("a", ["b", "c"]))
      .keep.step(cmd => expect(cmd).toBe("a b c"));
  });

  it("keep arguments after a leading array", () => {
    return verify({ timeout: 1000 })
      .step(() => xsh.mkCmd(["a"], "b"))
      .keep.step(cmd => expect(cmd).toBe("a b"));
  });
});
