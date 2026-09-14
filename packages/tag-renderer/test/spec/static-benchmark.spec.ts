import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const benchmark = fileURLToPath(new URL("../../bench/static-render.mjs", import.meta.url));

describe("static rendering benchmark", () => {
  it("runs every static-segment case and emits complete metrics", async () => {
    const { stdout } = await execFileAsync(process.execPath, [benchmark, "--smoke"], {
      encoding: "utf8",
      maxBuffer: 1_000_000,
      timeout: 30_000,
    });
    const rows = stdout
      .split("\n")
      .filter((line) => line.startsWith("static-"))
      .map((line) => line.split("\t"));

    expect(stdout).toContain("case\tstatic_tags\tbytes\titerations\tmedian_ns\tp95_ns");
    expect(rows.map(([name]) => name)).toEqual([
      "static-1",
      "static-16",
      "static-256",
      "static-4096",
    ]);
    for (const row of rows) {
      expect(row).toHaveLength(10);
      expect(row.slice(1).every((value) => Number.isFinite(Number(value)))).toBe(true);
      expect(Number(row[2])).toBe(65_536);
      expect(Number(row[3])).toBeGreaterThan(0);
      expect(Number(row[4])).toBeGreaterThan(0);
    }
  }, 30_000);
});
