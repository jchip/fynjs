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
    const rows = stdout.split("\n").filter((line) => line.startsWith("static-"));

    expect(stdout).toContain("Static render benchmark");
    expect(stdout).toContain("Avg/render");
    expect(stdout).toContain("Median/render");
    expect(stdout).toContain("p95/render");
    expect(rows.map((row) => row.split(/\s+/)[0])).toEqual([
      "static-1",
      "static-16",
      "static-256",
      "static-4096",
    ]);
    for (const row of rows) {
      expect(row).toMatch(
        /^static-\d+\s+\d+\s+[\d,]+\s+\d+\.\d{3}\s+\d+\.\d{3}\s+\d+\.\d{3}\s+[\d,]+\s+[\d,.]+\s+\d+\.\d\s+\d+\.\d{2}%$/,
      );
    }
  }, 30_000);
});
