import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PassThrough } from "node:stream";
import VisualLogger from "visual-logger";
import xsh from "xsh";
import { VisualExec, type ExecOutput, type VisualExecError } from "../src/visual-exec.js";

vi.mock("xsh", () => ({ default: { exec: vi.fn() } }));
vi.mock("visual-logger", () => ({
  default: class {
    static spinners = [null, {}];
    addItem = vi.fn();
    removeItem = vi.fn();
    updateItem = vi.fn();
    setItemType = vi.fn();
    info = vi.fn();
    error = vi.fn();
    verbose = vi.fn();
    prefix() {
      return this;
    }
  }
}));

function runningChild() {
  let resolve!: (output: ExecOutput) => void;
  let reject!: (error: VisualExecError) => void;
  const promise = new Promise<ExecOutput>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    promise,
    child: { pid: 123, killed: false, kill: vi.fn(() => true) },
    resolve,
    reject
  };
}

const emptyOutput = { stdout: "", stderr: "" };

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("child lifecycle", () => {
  it("can log a result without attaching to a child", () => {
    const visualLogger = new VisualLogger();
    const ve = new VisualExec({ command: "test", visualLogger });
    ve.logResult(null, emptyOutput);
    expect(visualLogger.info).toHaveBeenCalledWith(expect.stringContaining("exit code 0"));
    expect(visualLogger.verbose).toHaveBeenCalledWith(expect.stringContaining("No output"));
  });

  it("handles buffer and text chunks, then removes only its own listeners", async () => {
    const child = runningChild();
    const observer = vi.fn();
    child.stdout.on("data", observer);
    const visualLogger = new VisualLogger();
    const onOutput = vi.fn();
    const ve = new VisualExec({ command: "test", visualLogger, onOutput });
    const result = ve.show(child);
    child.stdout.write(Buffer.from("output\n"));
    child.stderr.write(Buffer.from("diagnostic\n"));
    child.stdout.emit("data", "text output\n");
    child.stderr.emit("data", "text diagnostic\n");
    expect(onOutput.mock.calls).toEqual([
      ["output\n", "stdout"],
      ["diagnostic\n", "stderr"],
      ["text output\n", "stdout"],
      ["text diagnostic\n", "stderr"]
    ]);
    child.resolve({ stdout: "output\ntext output\n", stderr: "diagnostic\ntext diagnostic\n" });
    await result;
    expect(child.stdout.listeners("data")).toEqual([observer]);
    expect(child.stderr.listenerCount("data")).toBe(0);
    expect(visualLogger.removeItem).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ exitCode: 7, code: 8 }, 7],
    [{ code: 8 }, 8],
    [{}, 1]
  ])("reports child failure %j to onComplete", async (properties, exitCode) => {
    const child = runningChild();
    const onComplete = vi.fn();
    const ve = new VisualExec({ command: "test", onComplete });
    const result = ve.show(child);
    const error = Object.assign(new Error("child failed"), properties);
    child.reject(error);
    await expect(result).rejects.toBe(error);
    expect(onComplete).toHaveBeenCalledWith(emptyOutput, exitCode);
    expect(child.stdout.listenerCount("data")).toBe(0);
    expect(child.stderr.listenerCount("data")).toBe(0);
  });

  it("allows abort and kill before a child starts or without a process ID", async () => {
    const ve = new VisualExec({ command: "test" });
    expect(() => ve.abort()).not.toThrow();
    expect(() => ve.kill("SIGINT")).not.toThrow();
    const child = runningChild();
    const handle = { kill: vi.fn(() => false) };
    const result = ve.show({ ...child, child: handle });
    ve.kill();
    expect(handle.kill).not.toHaveBeenCalled();
    child.resolve(emptyOutput);
    await result;
  });

  it("forwards a custom kill signal and suppresses a later timeout", async () => {
    const child = runningChild();
    const onTimeout = vi.fn();
    const ve = new VisualExec({ command: "test", timeout: 100, onTimeout });
    const result = ve.show(child);
    ve.kill("SIGINT");
    await vi.advanceTimersByTimeAsync(100);
    expect(child.child.kill).toHaveBeenCalledExactlyOnceWith("SIGINT");
    expect(onTimeout).not.toHaveBeenCalled();
    child.resolve(emptyOutput);
    await result;
  });

  it("clears the timeout when the child completes first", async () => {
    const child = runningChild();
    const onTimeout = vi.fn();
    const result = new VisualExec({ command: "test", timeout: 100, onTimeout }).show(child);
    child.resolve(emptyOutput);
    await result;
    await vi.advanceTimersByTimeAsync(100);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(child.child.kill).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([true, false])("escalates timeout only while a process has an ID: %s", async running => {
    const child = runningChild();
    const onTimeout = vi.fn();
    const ve = new VisualExec({
      command: "test",
      cwd: "/tmp",
      timeout: 100,
      timeoutGrace: 20,
      onTimeout
    });
    const failure = expect(ve.show(child)).rejects.toMatchObject({
      name: "TimeoutError",
      context: { command: "test", cwd: "/tmp", exitCode: -1, signal: "SIGTERM", duration: 100 }
    });
    await vi.advanceTimersByTimeAsync(100);
    await failure;
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(child.child.kill).toHaveBeenCalledExactlyOnceWith("SIGTERM");
    if (!running) child.child.pid = 0;
    await vi.advanceTimersByTimeAsync(20);
    expect(child.child.kill.mock.calls).toEqual(
      running ? [["SIGTERM"], ["SIGKILL"]] : [["SIGTERM"]]
    );
    child.resolve(emptyOutput);
    await child.promise;
  });

  it("times out a child that has no process handle", async () => {
    const child = runningChild();
    const ve = new VisualExec({ command: "test", timeout: 100 });
    const failure = expect(ve.show({ ...child, child: undefined })).rejects.toMatchObject({
      name: "TimeoutError"
    });
    await vi.advanceTimersByTimeAsync(100);
    await failure;
    expect(vi.getTimerCount()).toBe(0);
    child.resolve(emptyOutput);
    await child.promise;
  });

  it.each([true, false])(
    "cancels for an AbortSignal (already aborted: %s)",
    async alreadyAborted => {
      const child = runningChild();
      const controller = new AbortController();
      if (alreadyAborted) controller.abort();
      const ve = new VisualExec({ command: "test", cwd: "/tmp", signal: controller.signal });
      const failure = expect(ve.show(child)).rejects.toMatchObject({
        name: "AbortError",
        context: {
          command: "test",
          cwd: "/tmp",
          exitCode: -1,
          signal: "SIGTERM",
          duration: alreadyAborted ? 0 : 25
        }
      });
      if (!alreadyAborted) {
        await vi.advanceTimersByTimeAsync(25);
        controller.abort();
      }
      await failure;
      expect(child.child.kill).toHaveBeenCalledExactlyOnceWith("SIGTERM");
      child.resolve(emptyOutput);
      await child.promise;
    }
  );
});

describe("execute failure context", () => {
  it("passes command, environment and buffer limits to xsh", async () => {
    const child = runningChild();
    vi.mocked(xsh.exec).mockReturnValue(child as any);
    const ve = new VisualExec({ command: "original", cwd: "/tmp", maxBuffer: 1234 });
    const result = ve.execute("override");
    expect(xsh.exec).toHaveBeenCalledWith(
      {
        silent: true,
        cwd: "/tmp",
        maxBuffer: 1234,
        env: { ...process.env, PWD: "/tmp" }
      },
      "override"
    );
    child.resolve(emptyOutput);
    await expect(result).resolves.toEqual(emptyOutput);
  });

  it("keeps the full context but bounds error output and keeps the last ten nonempty lines", async () => {
    const child = runningChild();
    vi.mocked(xsh.exec).mockReturnValue(child as any);
    const ve = new VisualExec({ command: "original", cwd: "/tmp" });
    const result = ve.execute("override");
    const stdout = "x".repeat(50001);
    const lines = Array.from({ length: 12 }, (_, n) => `line ${n}`);
    const stderr = "y".repeat(50001) + "\n\n" + lines.join("\n") + "\n";
    const error = Object.assign(new Error("failed"), {
      code: 9,
      signal: "SIGINT",
      output: { stdout, stderr }
    });
    await vi.advanceTimersByTimeAsync(25);
    child.reject(error);
    await expect(result).rejects.toMatchObject({
      exitCode: 9,
      signal: "SIGINT",
      cwd: "/tmp",
      command: "override",
      duration: 25,
      stdout: stdout.slice(-50000),
      stderr: stderr.slice(-50000),
      lastLines: lines.slice(-10),
      context: { stdout, stderr, lastLines: lines.slice(-10) }
    });
  });

  it.each([true, false])(
    "uses empty output, a default code, and killed state when error fields are missing: %s",
    async killed => {
      const child = runningChild();
      child.child.killed = killed;
      vi.mocked(xsh.exec).mockReturnValue(child as any);
      const result = new VisualExec({ command: "test" }).execute();
      child.reject(new Error("spawn failed"));
      await expect(result).rejects.toMatchObject({
        exitCode: 1,
        signal: killed ? "SIGTERM" : null,
        stdout: "",
        stderr: "",
        lastLines: []
      });
    }
  );
});
