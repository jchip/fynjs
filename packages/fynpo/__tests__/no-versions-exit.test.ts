import { afterEach, describe, expect, it, vi } from "vitest";
import { verify } from "run-verify";

vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { Version } from "../src/version";
import Changelog from "../src/update-changelog";

// updatePackageVersions resolves undefined when the changelog lists no versions. Committing
// must then exit 1, not throw a TypeError destructuring it.
describe("committing with no version updates", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["version", () => new Version({ cwd: process.cwd() }, undefined as any)],
    ["changelog", () => new Changelog({ cwd: process.cwd() }, undefined as any)],
  ])("%s exits 1", (_name, make) => {
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code}`);
    }) as any);

    return verify({ timeout: 3000 })
      .step(() => make())
      .expectError.step((command: any) => command.commitAndTagUpdates(undefined))
      .step((err: any) => {
        expect(err.message).toBe("process.exit:1");
        expect(exit).toHaveBeenCalledWith(1);
      });
  });
});
