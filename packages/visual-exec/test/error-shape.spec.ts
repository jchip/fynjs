import { afterEach, describe, expect, it, vi } from "vitest";
import { PassThrough } from "node:stream";
import { getEventListeners } from "node:events";
import { verify } from "run-verify";
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

// execute() hands this child to show(), so tests drive it as if xsh had spawned it
function execWith(child: ReturnType<typeof runningChild>) {
  vi.mocked(xsh.exec).mockReturnValue(child as any);
}

afterEach(() => vi.clearAllMocks());

describe("timeout and abort errors", () => {
  it("carry the full error shape and the command execute() ran", () => {
    const child = runningChild();
    execWith(child);
    const ve = new VisualExec({ command: "constructor-cmd", cwd: "/tmp", timeout: 10 });

    return verify({ timeout: 2000, cleanup: () => child.resolve({ stdout: "", stderr: "" }) })
      .expectError.step(() => {
        const result = ve.execute("override-cmd");
        child.stdout.write("out line\n");
        child.stderr.write("err line\n");
        return result;
      })
      .step(err => err as VisualExecError)
      .keep.step((err: VisualExecError) => expect(err.name).toBe("TimeoutError"))
      .keep.step((err: VisualExecError) => expect(err.message).toContain("override-cmd"))
      .step((err: VisualExecError) =>
        expect(err).toMatchObject({
          command: "override-cmd",
          cwd: "/tmp",
          exitCode: -1,
          signal: "SIGTERM",
          duration: 10,
          stdout: "out line\n",
          stderr: "err line\n",
          lastLines: ["out line", "err line"],
          output: { stdout: "out line\n", stderr: "err line\n" },
          context: { command: "override-cmd", exitCode: -1, stdout: "out line\n" }
        })
      );
  });

  it("carry the full error shape on abort", () => {
    const child = runningChild();
    execWith(child);
    const controller = new AbortController();
    const ve = new VisualExec({ command: "constructor-cmd", cwd: "/tmp", signal: controller.signal });

    return verify({ timeout: 2000, cleanup: () => child.resolve({ stdout: "", stderr: "" }) })
      .expectError.step(() => {
        const result = ve.execute("override-cmd");
        child.stdout.write("partial\n");
        controller.abort();
        return result;
      })
      .step(err => err as VisualExecError)
      .keep.step((err: VisualExecError) => expect(err.name).toBe("AbortError"))
      .keep.step((err: VisualExecError) => expect(err.message).toContain("override-cmd"))
      .step((err: VisualExecError) =>
        expect(err).toMatchObject({
          command: "override-cmd",
          cwd: "/tmp",
          exitCode: -1,
          signal: "SIGTERM",
          stdout: "partial\n",
          stderr: "",
          lastLines: ["partial"],
          context: { command: "override-cmd" }
        })
      );
  });

  it("keep only the tail of long output", () => {
    const child = runningChild();
    const ve = new VisualExec({ command: "test", timeout: 10 });
    const big = "x".repeat(60000);

    return verify({ timeout: 2000, cleanup: () => child.resolve({ stdout: "", stderr: "" }) })
      .expectError.step(() => {
        const result = ve.show(child);
        child.stdout.write(big);
        child.stdout.write("end");
        return result;
      })
      .step(err => err as VisualExecError)
      .keep.step((err: VisualExecError) => expect(err.stdout!.length).toBe(50000))
      .step((err: VisualExecError) => expect(err.stdout!.endsWith("xend")).toBe(true));
  });
});

describe("onComplete throwing on failure", () => {
  it("keeps the original error and still logs the result", () => {
    const child = runningChild();
    const visualLogger = new VisualLogger();
    const original = Object.assign(new Error("child failed"), { code: 2 });
    const ve = new VisualExec({
      command: "test",
      visualLogger,
      onComplete: () => {
        throw new Error("callback failed");
      }
    });

    return verify({ timeout: 2000 })
      .expectError.step(() => {
        const result = ve.show(child);
        child.reject(original);
        return result;
      })
      .step(err => expect(err).toBe(original))
      .step(() => expect(visualLogger.removeItem).toHaveBeenCalledTimes(2));
  });
});

describe("AbortSignal listener", () => {
  it("is removed when execution finishes by success, failure, timeout or abort", () => {
    const controller = new AbortController();
    const { signal } = controller;
    const listeners = () => getEventListeners(signal, "abort").length;
    const run = (opts: { timeout?: number } = {}) => {
      const child = runningChild();
      const ve = new VisualExec({ command: "test", signal, ...opts });
      return { child, result: ve.show(child) };
    };
    const ok = { stdout: "", stderr: "" };

    return verify({ timeout: 2000 })
      .step(() => {
        const { child, result } = run();
        child.resolve(ok);
        return result;
      })
      .step(() => expect(listeners()).toBe(0))
      .expectError.step(() => {
        const { child, result } = run();
        child.reject(new Error("child failed"));
        return result;
      })
      .step(() => expect(listeners()).toBe(0))
      .expectError.step(() => run({ timeout: 10 }).result)
      .step(() => expect(listeners()).toBe(0))
      .expectError.step(() => {
        const { result } = run();
        controller.abort();
        return result;
      })
      .step(() => expect(listeners()).toBe(0));
  });
});
