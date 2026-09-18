import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import VisualLogger from "visual-logger";
import { VisualExec, type VisualExecOptions } from "../src/visual-exec.js";

function setup(options: Partial<VisualExecOptions> = {}) {
  const logger = new VisualLogger({
    color: false,
    output: {
      isTTY: () => false,
      write: () => true,
      visual: { write: () => {}, clear: () => {} }
    }
  });
  const exec = new VisualExec({ command: "test", visualLogger: logger, ...options });
  return { exec, logger };
}

describe("final output", () => {
  it.each([
    { output: undefined, expected: "No output from Running test" },
    { output: { stdout: "", stderr: "" }, expected: "No output from Running test" },
    { output: { stdout: "", stderr: "problem" }, expected: "=== stderr ===\nproblem" }
  ])("logs $expected", ({ output, expected }) => {
    const { exec, logger } = setup();

    exec.logFinalOutput(null, output!);

    expect(logger.logData.join("\n")).toContain(expected);
  });

  it("uses the chosen level for stderr when forceStderr is disabled", () => {
    const { exec, logger } = setup({ forceStderr: false, outputLevel: "info" });
    const info = vi.spyOn(logger, "info");
    const error = vi.spyOn(logger, "error");

    exec.logFinalOutput(null, { stdout: "", stderr: "diagnostic" });

    expect(info).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
    expect(logger.logData.join("\n")).toContain("diagnostic");
  });

  it("ignores unsupported error-pattern values supplied by JavaScript callers", () => {
    // @ts-expect-error Exercise the public runtime fallback for an unsupported pattern.
    const { exec } = setup({ checkStdoutError: "error" });
    expect(exec.checkForErrors("failure")).toBeNull();
    expect(exec.checkForErrors("")).toBeNull();
  });

  it("uses a fallback title for a non-string command supplied by JavaScript callers", () => {
    // @ts-expect-error Exercise the public runtime fallback for a non-string command.
    const { exec, logger } = setup({ command: 42, cwd: "" });
    exec.logFinalOutput(null, { stdout: "", stderr: "" });
    expect(logger.logData.join("\n")).toContain("No output from Running user command");
  });
});

describe("output digest", () => {
  it.each([
    { text: "x".repeat(110), expected: "x".repeat(110) },
    { text: "x".repeat(121), expected: "x".repeat(100) },
    { text: "x".repeat(100) + "\nrecent\n", expected: "recent" },
    { text: "\u001b[32m\u001b[0m", expected: "\u001b[32m\u001b[0m" },
    { text: "\n", expected: "" }
  ])("keeps a bounded readable digest for $text", async ({ text, expected }) => {
    const { exec, logger } = setup();
    const update = vi.spyOn(logger, "updateItem");
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const result = exec.show({
      stdout,
      stderr,
      promise: Promise.resolve({ stdout: "", stderr: "" })
    });

    stdout.emit("data", text);
    await result;

    expect(update).toHaveBeenCalledWith(expect.any(Symbol), {
      msg: expected,
      _save: false,
      _render: false
    });
    expect(stdout.listenerCount("data")).toBe(0);
    expect(stderr.listenerCount("data")).toBe(0);
    logger.shutdown();
  });
});
