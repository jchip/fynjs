import { describe, it, expect } from "vitest";
import { VisualExec, sanitizeForDisplay } from "../src/visual-exec.ts";

const ESC = String.fromCharCode(27);

//
// VEX-9: a nested fyn renders its own visual logger onto its piped stdout, so the captured
// output carries eraseLine/cursorUp runs. Those are zero-width to string-width, so the
// parent's line accounting stays right while the terminal still executes them - walking the
// cursor up and erasing committed output above the progress display.
//
describe("sanitizeForDisplay", () => {
  it("should drop sequences that move the cursor, erase or scroll", () => {
    const dangerous = [
      `${ESC}[2K`, // erase line
      `${ESC}[1A`, // cursor up
      `${ESC}[3B`, // cursor down
      `${ESC}[G`, // cursor to column
      `${ESC}[2J`, // erase display
      `${ESC}[S`, // scroll up
      `${ESC}[?25l`, // hide cursor
      `${ESC}[H`, // cursor home
      `${ESC}7`, // save cursor
      `${ESC}c`, // full reset
      `${ESC}M` // reverse index
    ];

    for (const seq of dangerous) {
      expect(sanitizeForDisplay(`a${seq}b`)).toBe("ab");
    }
  });

  it("should drop control characters that reposition the cursor", () => {
    expect(sanitizeForDisplay("abc\rxyz")).toBe("abcxyz");
    expect(sanitizeForDisplay("abc\bxyz")).toBe("abcxyz");
    expect(sanitizeForDisplay("abc\fxyz")).toBe("abcxyz");
    expect(sanitizeForDisplay("abc\u0001xyz")).toBe("abcxyz");
    // tabs become spaces so they cannot jump to a tab stop
    expect(sanitizeForDisplay("abc\txyz")).toBe("abc xyz");
    // newlines survive - the digest splits lines on them
    expect(sanitizeForDisplay("abc\nxyz")).toBe("abc\nxyz");
  });

  it("should keep SGR colour sequences", () => {
    const colored = `${ESC}[32mgreen${ESC}[39m and ${ESC}[38;5;1mfancy${ESC}[0m`;
    expect(sanitizeForDisplay(colored)).toBe(colored);
  });

  it("should keep colour while removing cursor control from the same string", () => {
    const input = `${ESC}[2K${ESC}[1A${ESC}[32mDone${ESC}[39m${ESC}[G`;
    expect(sanitizeForDisplay(input)).toBe(`${ESC}[32mDone${ESC}[39m`);
  });

  it("should drop OSC sequences", () => {
    expect(sanitizeForDisplay(`a${ESC}]0;window titleb`)).toBe("ab");
    expect(sanitizeForDisplay(`a${ESC}]8;;http://x${ESC}\\b`)).toBe("ab");
  });
});

describe("VisualExec digest", () => {
  const digest = (chunk: string) => {
    let msg: string | undefined;
    const logger = {
      addItem() {},
      removeItem() {},
      updateItem(_name: unknown, data: { msg: string }) {
        msg = data.msg;
      }
    };
    const ve = new VisualExec({ command: "x", visualLogger: logger as any });
    (ve as any)._updateDigest({ name: Symbol("stdout"), buf: "" }, chunk);
    return msg as string;
  };

  it("should not let child cursor control reach the progress line", () => {
    // exactly what a nested fyn emits: clear its own items, then log a line
    const childOutput =
      `${ESC}[2K${ESC}[1A${ESC}[2K${ESC}[1A${ESC}[2K${ESC}[G` +
      "> Done bootstrap npm-packlist@11.3.0 exit code 0\n";

    const msg = digest(childOutput);

    expect(msg).not.toContain(`${ESC}[2K`);
    expect(msg).not.toContain(`${ESC}[1A`);
    expect(msg).not.toContain(`${ESC}[G`);
    expect(msg).toContain("> Done bootstrap npm-packlist@11.3.0 exit code 0");
  });

  it("should keep colour from child output", () => {
    const msg = digest(`${ESC}[2K${ESC}[32mbuilt ok${ESC}[39m\n`);
    expect(msg).toContain(`${ESC}[32m`);
    expect(msg).toContain("built ok");
    expect(msg).not.toContain(`${ESC}[2K`);
  });
});
