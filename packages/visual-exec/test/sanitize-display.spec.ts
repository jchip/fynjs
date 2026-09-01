import { describe, it, expect } from "vitest";
import { VisualExec, sanitizeForDisplay, sanitizeForOutput } from "../src/visual-exec.ts";

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

//
// VEX-10: the first cut of the sanitizer only knew CSI, OSC and single-char escapes, so nF
// sequences and 8-bit C1 controls went straight through. ESC(0 switches the terminal to the
// DEC line-drawing charset, which garbles every letter after it - not just one line.
//
describe("sanitizeForDisplay escape grammar coverage", () => {
  const cases: [string, string][] = [
    ["nF charset line-draw", `${ESC}(0`],
    ["nF charset ascii", `${ESC}(B`],
    ["nF DEC alignment test", `${ESC}#8`],
    ["nF select UTF-8", `${ESC}%G`],
    ["alt screen buffer", `${ESC}[?1049h`],
    ["OSC 52 clipboard write", `${ESC}]52;c;YWJj\u0007`],
    ["OSC 0 window title", `${ESC}]0;title\u0007`],
    ["OSC 8 hyperlink (ST terminated)", `${ESC}]8;;http://x${ESC}\\`],
    ["DCS", `${ESC}Pq#0;2;0;0;0\u0007`],
    ["Fs full reset", `${ESC}c`],
    ["Fp save cursor", `${ESC}7`],
    ["Fe reverse index", `${ESC}M`]
  ];

  for (const [name, seq] of cases) {
    it(`should strip ${name}`, () => {
      expect(sanitizeForDisplay(`a${seq}b`)).toBe("ab");
      expect(sanitizeForOutput(`a${seq}b`)).toBe("ab");
    });
  }

  it("should strip 8-bit C1 controls with their payload", () => {
    // 0x9B is an 8-bit CSI - an escape sequence with no ESC byte
    expect(sanitizeForDisplay("a\u009B2Kb")).toBe("ab");
    expect(sanitizeForOutput("a\u009B1Ab")).toBe("ab");
    // 8-bit OSC, terminated by ST (0x9C)
    expect(sanitizeForDisplay("a\u009D0;title\u009Cb")).toBe("ab");
    // a bare C1 with no payload still goes
    expect(sanitizeForDisplay("a\u0085b")).toBe("ab");
  });
});

describe("sanitizeForOutput", () => {
  it("should keep tabs as real formatting", () => {
    expect(sanitizeForOutput("name\tvalue")).toBe("name\tvalue");
    // the single-line profile still collapses them
    expect(sanitizeForDisplay("name\tvalue")).toBe("name value");
  });

  it("should turn carriage returns into line breaks", () => {
    expect(sanitizeForOutput("a\r\nb")).toBe("a\nb");
    expect(sanitizeForOutput("50%\r75%\r100%")).toBe("50%\n75%\n100%");
  });

  it("should append a reset only when the text emitted colour", () => {
    expect(sanitizeForOutput("plain text")).toBe("plain text");
    expect(sanitizeForOutput(`${ESC}[32mgreen`)).toBe(`${ESC}[32mgreen${ESC}[0m`);
  });

  it("should keep colour while removing cursor control", () => {
    const input = `${ESC}[2K${ESC}[1A${ESC}[32mDone${ESC}[39m${ESC}[G`;
    expect(sanitizeForOutput(input)).toBe(`${ESC}[32mDone${ESC}[39m${ESC}[0m`);
  });

  it("should keep newlines - they are the structure of a dump", () => {
    expect(sanitizeForOutput("line1\nline2\nline3")).toBe("line1\nline2\nline3");
  });
});

describe("VisualExec.logFinalOutput", () => {
  it("should not emit child cursor control to the terminal", () => {
    const logged: string[] = [];
    const logger = {
      prefix() {
        return this;
      },
      error(...args: string[]) {
        logged.push(args.join(" "));
      },
      verbose(...args: string[]) {
        logged.push(args.join(" "));
      }
    };

    const ve = new VisualExec({ command: "x", visualLogger: logger as any });
    ve.logFinalOutput(null, {
      stdout: `${ESC}[2K${ESC}[1Abuilt ok${ESC}(0`,
      stderr: ""
    });

    const all = logged.join("");
    expect(all).toContain("built ok");
    expect(all).not.toContain(`${ESC}[2K`);
    expect(all).not.toContain(`${ESC}[1A`);
    expect(all).not.toContain(`${ESC}(0`);
  });
});
