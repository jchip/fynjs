import { describe, it, expect, vi } from "vitest";
import { VisualExec, VisualExecOptions, parsers } from "../src/visual-exec";
import Path from "path";
import fs from "fs";
import os from "os";

// Mock visual-logger to avoid actual console output during tests
vi.mock("visual-logger", () => {
  return {
    default: class MockVisualLogger {
      static spinners = [null, {}];
      info = vi.fn();
      warn = vi.fn();
      error = vi.fn();
      debug = vi.fn();
      verbose = vi.fn();
      addItem = vi.fn();
      removeItem = vi.fn();
      updateItem = vi.fn();
      setItemType = vi.fn();
      prefix = vi.fn(() => this);
    }
  };
});

describe("VisualExec", () => {
  describe("constructor", () => {
    it("should create instance with required options", () => {
      const ve = new VisualExec({ command: "echo hello" });
      expect(ve).toBeInstanceOf(VisualExec);
    });

    it("should accept custom cwd", () => {
      const ve = new VisualExec({
        command: "pwd",
        cwd: "/tmp"
      });
      expect(ve).toBeInstanceOf(VisualExec);
    });

    it("should accept displayTitle option", () => {
      const ve = new VisualExec({
        command: "echo test",
        displayTitle: "Custom Title"
      });
      expect(ve).toBeInstanceOf(VisualExec);
    });

    it("should accept all optional parameters", () => {
      const options: VisualExecOptions = {
        command: "echo test",
        cwd: "/tmp",
        displayTitle: "Test Title",
        logLabel: "test-log",
        outputLabel: "test-output",
        outputLevel: "info",
        maxBuffer: 1024 * 1024,
        forceStderr: false,
        checkStdoutError: /custom-error/i
      };
      const ve = new VisualExec(options);
      expect(ve).toBeInstanceOf(VisualExec);
    });
  });

  describe("execute", () => {
    it("should execute a simple command", async () => {
      const ve = new VisualExec({
        command: "echo hello",
        outputLevel: "debug"
      });

      // Suppress output logging for test
      ve.logFinalOutput = vi.fn();

      const result = await ve.execute();
      expect(result.stdout).toContain("hello");
    });

    it("should capture stderr", async () => {
      const ve = new VisualExec({
        command: `${process.execPath} -e "console.error('error output')"`,
        outputLevel: "debug"
      });

      ve.logFinalOutput = vi.fn();

      const result = await ve.execute();
      expect(result.stderr).toContain("error output");
    });

    it("should use provided cwd", async () => {
      const ve = new VisualExec({
        command: "pwd",
        cwd: "/tmp",
        outputLevel: "debug"
      });

      ve.logFinalOutput = vi.fn();

      const result = await ve.execute();
      // On macOS, /tmp is a symlink to /private/tmp
      expect(result.stdout.trim()).toMatch(/\/(tmp|private\/tmp)$/);
    });

    it("should reject on command failure", async () => {
      const ve = new VisualExec({
        command: `${process.execPath} -e "process.exit(1)"`,
        outputLevel: "debug"
      });

      ve.logFinalOutput = vi.fn();

      await expect(ve.execute()).rejects.toThrow();
    });

    it("should execute command passed to execute()", async () => {
      const ve = new VisualExec({
        command: "echo original",
        outputLevel: "debug"
      });

      ve.logFinalOutput = vi.fn();

      const result = await ve.execute("echo override");
      expect(result.stdout).toContain("override");
    });
  });

  describe("checkForErrors", () => {
    it("should match default error patterns", () => {
      const ve = new VisualExec({ command: "test" });

      expect(ve.checkForErrors("Something failed")).toBeTruthy();
      expect(ve.checkForErrors("Error occurred")).toBeTruthy();
      expect(ve.checkForErrors("Fatal error")).toBeTruthy();
      expect(ve.checkForErrors("warning: something")).toBeTruthy();
    });

    it("should not match when disabled", () => {
      const ve = new VisualExec({
        command: "test",
        checkStdoutError: false
      });

      expect(ve.checkForErrors("Something failed")).toBeNull();
    });

    it("should use custom regex", () => {
      const ve = new VisualExec({
        command: "test",
        checkStdoutError: /CUSTOM_ERROR/
      });

      expect(ve.checkForErrors("CUSTOM_ERROR found")).toBeTruthy();
      expect(ve.checkForErrors("Something failed")).toBeNull();
    });
  });

  describe("onOutput/onComplete callbacks", () => {
    it("should call onOutput with each chunk", async () => {
      const onOutput = vi.fn();
      const ve = new VisualExec({
        command: "echo hello",
        onOutput,
        outputLevel: "debug"
      });
      ve.logFinalOutput = vi.fn();

      await ve.execute();
      expect(onOutput).toHaveBeenCalled();
      expect(onOutput.mock.calls.some((c: any) => c[0].includes("hello") && c[1] === "stdout")).toBe(
        true
      );
    });

    it("should call onComplete with output and exitCode 0 on success", async () => {
      const onComplete = vi.fn();
      const ve = new VisualExec({
        command: "echo hello",
        onComplete,
        outputLevel: "debug"
      });
      ve.logFinalOutput = vi.fn();

      await ve.execute();
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({ stdout: expect.stringContaining("hello"), stderr: "" }),
        0
      );
    });

    it("should call onComplete with output and exitCode on failure", async () => {
      const onComplete = vi.fn();
      const ve = new VisualExec({
        command: `${process.execPath} -e "process.exit(42)"`,
        onComplete,
        outputLevel: "debug"
      });
      ve.logFinalOutput = vi.fn();

      await expect(ve.execute()).rejects.toThrow();
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({ stdout: "", stderr: "" }),
        42
      );
    });

    it("should return onComplete result when provided", async () => {
      const ve = new VisualExec({
        command: "echo hello",
        onComplete: (output) => ({ parsed: output.stdout.trim() }),
        outputLevel: "debug"
      });
      ve.logFinalOutput = vi.fn();

      const result = await ve.execute();
      expect(result).toEqual({ parsed: "hello" });
    });
  });

  describe("timeout", () => {
    it("should reject on timeout", async () => {
      const ve = new VisualExec({
        command: "sleep 10",
        timeout: 100,
        outputLevel: "debug"
      });
      ve.logFinalOutput = vi.fn();

      await expect(ve.execute()).rejects.toMatchObject({
        name: "TimeoutError",
        message: expect.stringContaining("timed out")
      });
    });
  });

  describe("abort", () => {
    it("should have abort and kill methods", () => {
      const ve = new VisualExec({ command: "echo test" });
      expect(typeof ve.abort).toBe("function");
      expect(typeof ve.kill).toBe("function");
    });

    it("should support AbortSignal", async () => {
      const controller = new AbortController();
      const ve = new VisualExec({
        command: "sleep 5",
        signal: controller.signal,
        outputLevel: "debug"
      });
      ve.logFinalOutput = vi.fn();

      const promise = ve.execute();
      controller.abort();

      await expect(promise).rejects.toMatchObject({
        name: "AbortError",
        message: expect.stringContaining("aborted")
      });
    });
  });

  describe("error context", () => {
    it("should include context on failure", async () => {
      const ve = new VisualExec({
        command: `${process.execPath} -e "console.error('stderr msg'); process.exit(1)"`,
        outputLevel: "debug"
      });
      ve.logFinalOutput = vi.fn();

      try {
        await ve.execute();
      } catch (err: any) {
        expect(err.exitCode).toBe(1);
        expect(err.command).toBeDefined();
        expect(err.cwd).toBeDefined();
        expect(err.duration).toBeDefined();
        expect(err.lastLines).toBeDefined();
        expect(err.context).toBeDefined();
        expect(err.stdout).toBeDefined();
        expect(err.stderr).toContain("stderr msg");
      }
    });
  });

  describe("outputFile", () => {
    it("should stream output to file", async () => {
      const tmpDir = os.tmpdir();
      const outFile = Path.join(tmpDir, `visual-exec-test-${Date.now()}.log`);

      const ve = new VisualExec({
        command: "echo hello world",
        outputFile: outFile,
        outputLevel: "debug"
      });
      ve.logFinalOutput = vi.fn();

      await ve.execute();

      const content = fs.readFileSync(outFile, "utf8");
      expect(content).toContain("hello");
      fs.unlinkSync(outFile);
    });
  });

  describe("progress", () => {
    it("should call onProgress when pattern matches", async () => {
      const onProgress = vi.fn();
      const ve = new VisualExec({
        command: `${process.execPath} -e "console.log('Progress: 5/10'); console.log('done')"`,
        progress: {
          extract: (line) => {
            const m = line.match(/(\d+)\/(\d+)/);
            return m ? { current: parseInt(m[1], 10), total: parseInt(m[2], 10) } : null;
          }
        },
        onProgress,
        outputLevel: "debug"
      });
      ve.logFinalOutput = vi.fn();

      await ve.execute();
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({ current: 5, total: 10 })
      );
    });
  });

  describe("matchers", () => {
    it("should call onMatch when pattern matches", async () => {
      const errors: string[] = [];
      const ve = new VisualExec({
        command: `${process.execPath} -e "console.log('error: something wrong'); console.log('ok')"`,
        matchers: [{ pattern: /error: (.+)/, onMatch: (m) => errors.push(m[1]) }],
        outputLevel: "debug"
      });
      ve.logFinalOutput = vi.fn();

      await ve.execute();
      expect(errors).toContain("something wrong");
    });
  });

  describe("parsers", () => {
    it("jsonLinesParser should parse valid JSON lines", () => {
      expect(parsers.jsonLines('{"a":1}')).toEqual({ a: 1 });
      expect(parsers.jsonLines('  {"b":2}  ')).toEqual({ b: 2 });
      expect(parsers.jsonLines("")).toBeNull();
      expect(parsers.jsonLines("not json")).toBeNull();
    });

    it("keyValueParser should parse key=value and key: value", () => {
      expect(parsers.keyValue("foo=bar")).toEqual({ foo: "bar" });
      expect(parsers.keyValue("key: value")).toEqual({ key: "value" });
      expect(parsers.keyValue("no match")).toBeNull();
    });
  });
});
