import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import stripAnsi from "strip-ansi";
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

function recordedText(logger: VisualLogger): string {
  return stripAnsi(logger.logData.join("\n")).replace(/^> /gm, "");
}

describe("final output", () => {
  it.each([
    { output: undefined, expected: "No output from Running test" },
    { output: { stdout: "", stderr: "" }, expected: "No output from Running test" },
    { output: { stdout: "", stderr: "problem" }, expected: "=== stderr ===\nproblem" }
  ])("logs $expected", ({ output, expected }) => {
    const { exec, logger } = setup();

    exec.logFinalOutput(null, output!);

    expect(recordedText(logger)).toContain(expected);
  });

  it("uses the chosen level for stderr when forceStderr is disabled", () => {
    const { exec, logger } = setup({ forceStderr: false, outputLevel: "info" });
    const info = vi.spyOn(logger, "info");
    const error = vi.spyOn(logger, "error");

    exec.logFinalOutput(null, { stdout: "", stderr: "diagnostic" });

    expect(info).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
    expect(recordedText(logger)).toContain("diagnostic");
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
    expect(recordedText(logger)).toContain("No output from Running user command");
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

describe("progress format", () => {
  const pattern = /(?<current>\d+)\/(?<total>\d+)/;
  const format = (p: { current?: number; total?: number }) => `${p.current}/${p.total}`;

  function run(options: Partial<VisualExecOptions>) {
    const { exec, logger } = setup(options);
    const update = vi.spyOn(logger, "updateItem");
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    let finish: () => void = () => undefined;
    const result = exec.show({
      stdout,
      stderr,
      promise: new Promise<{ stdout: string; stderr: string }>(resolve => {
        finish = () => resolve({ stdout: "", stderr: "" });
      })
    });
    const done = async () => {
      finish();
      await result;
      logger.shutdown();
    };
    return { update, stdout, stderr, done };
  }

  const progressCalls = (update: ReturnType<typeof vi.spyOn>) =>
    update.mock.calls.filter(([, data]: any[]) => data?.display).map(([, data]: any[]) => data);

  it("shows the formatted progress on the stdout label without onProgress", async () => {
    const { update, stdout, done } = run({ progress: { pattern, format } });

    stdout.emit("data", "Progress: 3/10\n");
    stdout.emit("data", "more output\n");
    await done();

    const calls = progressCalls(update);
    expect(calls[0]).toEqual({
      msg: "Progress: 3/10",
      display: "=== Running test\nstdout 3/10",
      _save: false,
      _render: false
    });
    // later stdout updates keep the progress on the label
    expect(calls[calls.length - 1].display).toBe("=== Running test\nstdout 3/10");
  });

  it("updates the stdout label for progress found on stderr", async () => {
    const { update, stdout, stderr, done } = run({ progress: { pattern, format } });

    stdout.emit("data", "hello\n");
    stderr.emit("data", "2/5\n2/5\n");
    await done();

    // one render for the progress, none for the repeated text
    expect(progressCalls(update)).toEqual([
      { msg: "hello", display: "=== Running test\nstdout 2/5", _save: false, _render: false }
    ]);
  });

  it("still calls onProgress along with format", async () => {
    const onProgress = vi.fn();
    const { update, stdout, done } = run({ progress: { pattern, format }, onProgress });

    stdout.emit("data", "4/8\n");
    await done();

    expect(onProgress).toHaveBeenCalledWith({ current: 4, total: 8, percent: undefined });
    expect(progressCalls(update)[0].display).toBe("=== Running test\nstdout 4/8");
  });
});
