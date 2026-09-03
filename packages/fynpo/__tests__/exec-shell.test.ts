import { describe, it, expect, vi, beforeEach } from "vitest";

const { execMock } = vi.hoisted(() => ({ execMock: vi.fn() }));
vi.mock("xsh", () => ({ default: { exec: execMock } }));

import { execShell } from "../src/utils/exec-shell";

describe("execShell", () => {
  beforeEach(() => {
    execMock.mockReset();
    execMock.mockReturnValue(Promise.resolve({ code: 0, stdout: "", stderr: "" }));
  });

  it("runs the command in cwd, silently by default", () => {
    execShell("git status", "/some/dir");

    const [opts, command] = execMock.mock.calls[0];
    expect(command).toBe("git status");
    expect(opts.cwd).toBe("/some/dir");
    expect(opts.silent).toBe(true);
  });

  it("overrides PWD to match cwd so child processes agree with it", () => {
    execShell("npm pack", "/pkg/dir");

    const [opts] = execMock.mock.calls[0];
    expect(opts.env.PWD).toBe("/pkg/dir");
    // the rest of the environment must survive
    expect(opts.env.PATH).toBe(process.env.PATH);
    // and process.env itself must not be mutated
    expect(process.env.PWD).not.toBe("/pkg/dir");
  });

  it("honors silent: false, which is what publish uses", () => {
    execShell("npm publish", "/pkg/dir", false);

    const [opts] = execMock.mock.calls[0];
    expect(opts.silent).toBe(false);
  });
});
