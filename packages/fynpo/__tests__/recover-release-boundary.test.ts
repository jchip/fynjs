import { PassThrough } from "stream";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/logger", () => ({ logger: { warn: vi.fn() } }));

import { confirmReleaseBoundary } from "../src/utils/recover-release-boundary";

const candidate = {
  sha: "0123456789abcdef",
  date: "2026-09-16",
  subject: "[Publish]",
  tags: ["old-release-1"],
  offFirstParent: false,
  searchTerm: "new-release-*",
};

const prompt = (answer?: string) => {
  const input: any = new PassThrough();
  const output: any = new PassThrough();
  input.isTTY = true;
  output.isTTY = true;

  const result = confirmReleaseBoundary(candidate, { input, output, isCI: false });
  input.end(answer);
  return result;
};

describe("release boundary prompt (FPO-70)", () => {
  it("accepts yes", async () => {
    await expect(prompt("yes\n")).resolves.toBe(true);
  });

  it("defaults an empty answer to no", async () => {
    await expect(prompt("\n")).resolves.toBe(false);
  });

  it("settles as unavailable when input closes at EOF", async () => {
    await expect(prompt()).resolves.toBeUndefined();
  });
});
