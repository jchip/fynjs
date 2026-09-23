import { describe, it, expect, afterEach } from "vitest";
import os from "node:os";
import fs from "node:fs";
import xsh from "../../src/index.ts";

describe("pushd/popd", function () {
  const startCwd = process.cwd();
  const tmp = fs.realpathSync(os.tmpdir());

  afterEach(() => {
    process.chdir(startCwd);
  });

  it("chdir into dir and restore the previous cwd on popd", () => {
    xsh.pushd(tmp);
    expect(process.cwd()).toBe(tmp);
    const restored = xsh.popd();
    expect(restored).toBe(startCwd);
    expect(process.cwd()).toBe(startCwd);
  });

  it("nests: popd unwinds to the directory just before the matching pushd", () => {
    xsh.pushd(tmp);
    xsh.pushd(startCwd);
    xsh.popd();
    expect(process.cwd()).toBe(tmp);
    xsh.popd();
    expect(process.cwd()).toBe(startCwd);
  });

  it("throws when the stack is empty", () => {
    expect(() => xsh.popd()).toThrow(/directory stack is empty/);
  });
});
