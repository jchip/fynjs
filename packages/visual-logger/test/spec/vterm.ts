/**
 * Minimal virtual terminal, enough to replay what log-update emits: cursor moves,
 * erase-in-line, newlines and auto wrap. Rows grow without bound (scrollback), so a
 * sequence that erases lines above where it started shows up as lost text.
 */
const ESC = String.fromCharCode(27);
const CSI = new RegExp(`^\\[([0-9;]*)([A-Za-z])`);

export class VTerm {
  columns: number;
  lines: string[];
  row: number;
  col: number;

  constructor(columns = 80) {
    this.columns = columns;
    this.lines = [""];
    this.row = 0;
    this.col = 0;
  }

  private _ensure(r: number): void {
    while (this.lines.length <= r) this.lines.push("");
  }

  private _put(ch: string): void {
    this._ensure(this.row);
    let line = this.lines[this.row];
    if (line.length < this.col) line += " ".repeat(this.col - line.length);
    this.lines[this.row] = line.slice(0, this.col) + ch + line.slice(this.col + 1);
    this.col++;
    if (this.col >= this.columns) {
      this.col = 0;
      this.row++;
      this._ensure(this.row);
    }
  }

  write(str: string): void {
    // colors, cursor show/hide and synchronized output markers do not move the cursor
    str = str
      .replace(new RegExp(`${ESC}\\[\\?(25[lh]|2026[lh])`, "g"), "")
      .replace(new RegExp(`${ESC}\\[[0-9;]*m`, "g"), "");

    let i = 0;
    while (i < str.length) {
      const c = str[i];

      if (c === ESC && str[i + 1] === "[") {
        const m = CSI.exec(str.slice(i + 1));
        if (!m) {
          i++;
          continue;
        }
        const n = m[1] === "" ? 1 : parseInt(m[1].split(";")[0], 10);
        switch (m[2]) {
          case "A":
            this.row = Math.max(0, this.row - n);
            break;
          case "B":
            this.row += n;
            this._ensure(this.row);
            break;
          case "C":
            this.col += n;
            break;
          case "D":
            this.col = Math.max(0, this.col - n);
            break;
          case "G":
            this.col = Math.max(0, n - 1);
            break;
          case "K": {
            const p = m[1] === "" ? 0 : parseInt(m[1], 10);
            this._ensure(this.row);
            if (p === 2) this.lines[this.row] = "";
            else if (p === 0) this.lines[this.row] = this.lines[this.row].slice(0, this.col);
            else
              this.lines[this.row] =
                " ".repeat(this.col) + this.lines[this.row].slice(this.col);
            break;
          }
          default:
            break;
        }
        i += 1 + m[0].length;
        continue;
      }

      if (c === "\n") {
        this.row++;
        this.col = 0;
        this._ensure(this.row);
      } else if (c === "\r") {
        this.col = 0;
      } else {
        this._put(c);
      }
      i++;
    }
  }

  /** Visible text, trailing blank lines dropped. */
  screen(): string[] {
    const lines = this.lines.slice();
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    return lines;
  }
}

export function makeTtyStream(columns = 80, rows = 40) {
  const term = new VTerm(columns);
  return {
    term,
    stream: {
      columns,
      rows,
      isTTY: true,
      write(s: string) {
        term.write(s);
        return true;
      }
    } as any
  };
}
