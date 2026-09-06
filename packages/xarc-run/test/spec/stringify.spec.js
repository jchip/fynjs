import stringify from "../../lib/stringify.js";
import { expect } from "vitest";
import xrun from "../../lib/index.js";

describe("stringify", function() {
  it("should stringify an array", () => {
    expect(stringify([Symbol("concurrent"), 1, 2, "abc", () => 1, "999"])).toBe(
      `["<concurrent>",1,2,"abc","func","999"]`
    );
  });

  it("should stringify XTaskSpec", () => {
    expect(
      stringify({
        x: xrun.exec("hello", "tty")
      })
    ).toBe(`{"x":"exec(tty) 'hello'"}`);
  });

  it("should catch throw and return error message", () => {
    const a = {};
    const b = {};
    a.b = b;
    b.a = a;
    expect(stringify(a)).toContain("ERROR: Converting circular structure to JSON");
  });
});
