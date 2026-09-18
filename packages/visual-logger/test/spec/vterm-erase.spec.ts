import { describe, it, expect } from "vitest";
import { VTerm } from "./vterm.js";

describe("virtual terminal erase to start", () => {
  it("includes the character at the cursor without moving the cursor", () => {
    const term = new VTerm();

    term.write("abcdef\x1b[3G\x1b[1K");

    expect(term.screen()).toEqual(["   def"]);
    expect([term.row, term.col]).toEqual([0, 2]);
  });
});
