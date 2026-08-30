import { describe, it, expect, afterEach } from "vitest";
import os from "node:os";
import Path from "node:path";
import { promises as Fs } from "node:fs";
import { getNpmRcConfig } from "../../src/npm-config.ts";

describe("getNpmRcConfig", () => {
  const origCwd = process.cwd();
  const made: string[] = [];

  afterEach(async () => {
    process.chdir(origCwd);
    for (const d of made.splice(0)) {
      await Fs.rm(d, { recursive: true, force: true });
    }
  });

  const tempDir = async () => {
    const dir = await Fs.mkdtemp(Path.join(os.tmpdir(), "npmrc-test-"));
    made.push(dir);
    return dir;
  };

  it("should read .npmrc from cwd", async () => {
    const dir = await tempDir();
    await Fs.writeFile(Path.join(dir, ".npmrc"), "test-only-key=test-only-value\n");
    process.chdir(dir);

    const config = await getNpmRcConfig();
    expect(config["test-only-key"]).toBe("test-only-value");
  });

  it("should ignore a directory with no .npmrc", async () => {
    const dir = await tempDir();
    process.chdir(dir);

    const config = await getNpmRcConfig();
    expect(config).toBeTypeOf("object");
    expect(config["test-only-key"]).toBe(undefined);
  });
});
