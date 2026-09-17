import { describe, expect, it } from "vitest";
import { formatOutdated } from "../../cli/show-outdated";

const records = [
  {
    name: "alpha",
    type: "prod" as const,
    requested: "^1.0.0",
    current: "1.0.0",
    wanted: "1.2.0",
    latest: "2.0.0",
  },
  {
    name: "missing",
    type: "dev" as const,
    requested: "^3.0.0",
    current: null,
    wanted: "3.1.0",
    latest: "3.1.0",
  },
];

describe("outdated formatter", () => {
  it("emits stable JSON", () => {
    expect(JSON.parse(formatOutdated(records, { json: true }))).toStrictEqual(records);
    expect(formatOutdated([], { json: true })).toBe("[]");
  });

  it("formats a human-readable table", () => {
    const output = formatOutdated(records, { colors: false });

    expect(output).toContain("Package");
    expect(output).toContain("Current");
    expect(output).toContain("Wanted");
    expect(output).toContain("Latest");
    expect(output).toContain("alpha");
    expect(output).toContain("MISSING");
    expect(formatOutdated([], { colors: false })).toBe("");
  });
});
