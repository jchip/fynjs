import { describe, it, expect } from "vitest";
import { VTerm, makeTtyStream } from "./vterm.js";

describe("virtual terminal", () => {
  it("starts with an empty screen and returns independent snapshots", () => {
    const term = new VTerm();

    expect(term.columns).toBe(80);
    expect(term.screen()).toEqual([]);
    term.write("first\n\n");
    const screen = term.screen();
    expect(screen).toEqual(["first"]);
    screen[0] = "changed";
    expect(term.screen()).toEqual(["first"]);
    expect([term.row, term.col]).toEqual([2, 0]);
  });

  it("wraps at the terminal width and overwrites after a carriage return", () => {
    const term = new VTerm(4);

    term.write("abcdef\rZ");

    expect(term.screen()).toEqual(["abcd", "Zf"]);
    expect([term.row, term.col]).toEqual([1, 1]);
  });

  it("moves vertically, creates missing rows, and clamps upward movement", () => {
    const term = new VTerm();

    term.write("top\x1b[2B\rthird\x1b[A\rmiddle");
    expect(term.screen()).toEqual(["top", "middle", "third"]);
    expect([term.row, term.col]).toEqual([1, 6]);

    term.write("\x1b[20A\rT");
    expect(term.screen()).toEqual(["Top", "middle", "third"]);
    expect([term.row, term.col]).toEqual([0, 1]);
  });

  it("pads horizontal gaps and clamps backward and absolute movement", () => {
    const term = new VTerm();

    term.write("a\x1b[3Cd\x1b[2DX");
    expect(term.screen()).toEqual(["a  Xd"]);
    expect([term.row, term.col]).toEqual([0, 4]);

    term.write("\x1b[20DA\x1b[0GB\x1b[5GE");
    expect(term.screen()).toEqual(["B  XE"]);
    expect([term.row, term.col]).toEqual([0, 5]);
  });

  it.each(["\x1b[K", "\x1b[0K"])("erases to the end with %j", (erase) => {
    const term = new VTerm();

    term.write(`abcdef\x1b[3G${erase}`);

    expect(term.screen()).toEqual(["ab"]);
    expect([term.row, term.col]).toEqual([0, 2]);
  });

  it("erases preceding text while retaining the suffix and cursor position", () => {
    const term = new VTerm();

    term.write("ab def\x1b[3G\x1b[1K");

    expect(term.screen()).toEqual(["   def"]);
    expect([term.row, term.col]).toEqual([0, 2]);
  });

  it("erases the whole row without moving the cursor", () => {
    const term = new VTerm();

    term.write("abc\x1b[2K");
    expect(term.screen()).toEqual([]);
    expect([term.row, term.col]).toEqual([0, 3]);

    term.write("d");
    expect(term.screen()).toEqual(["   d"]);
  });

  it("ignores colors, cursor visibility, synchronized output, and unknown commands", () => {
    const term = new VTerm();

    term.write("\x1b[?25l\x1b[?2026hab\x1b[1;31mc\x1b[0m\x1b[9Z");
    term.write("d\x1b[?2026l\x1b[?25h");

    expect(term.screen()).toEqual(["abcd"]);
    expect([term.row, term.col]).toEqual([0, 4]);
  });

  it("continues rendering text after a malformed escape sequence", () => {
    const term = new VTerm();

    term.write("a\x1b[?b");

    expect(term.screen()).toEqual(["a[?b"]);
    expect([term.row, term.col]).toEqual([0, 4]);
  });

  it("provides default TTY dimensions and forwards stream writes", () => {
    const { term, stream } = makeTtyStream();

    expect([stream.columns, stream.rows, stream.isTTY]).toEqual([80, 40, true]);
    expect(stream.write("hello")).toBe(true);
    expect(term.screen()).toEqual(["hello"]);
  });

  it("uses custom TTY dimensions when wrapping stream output", () => {
    const { term, stream } = makeTtyStream(3, 2);

    expect([stream.columns, stream.rows]).toEqual([3, 2]);
    expect(stream.write("abcd")).toBe(true);
    expect(term.screen()).toEqual(["abc", "d"]);
  });
});
