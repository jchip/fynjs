import { describe, it, expect, vi, beforeEach } from "vitest";
import { VisualExec, VisualExecOptions } from "../src/visual-exec";
import Path from "path";

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
});
