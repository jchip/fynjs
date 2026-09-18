import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import path from "path";
import { PassThrough } from "stream";
import { VisualExec, type ExecOutput, type VisualExecOptions } from "../src/visual-exec.js";

vi.mock("visual-logger", () => ({
  default: class {
    static spinners = [null, {}];
    addItem = vi.fn();
    removeItem = vi.fn();
    updateItem = vi.fn();
    info = vi.fn();
    verbose = vi.fn();
    error = vi.fn();
    prefix = vi.fn(() => this);
    setItemType = vi.fn();
  }
}));

vi.mock("fs", async importOriginal => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, createWriteStream: vi.fn(actual.createWriteStream) };
});

const directories: string[] = [];

function temporaryDirectory(): string {
  const root = path.resolve(".temp");
  fs.mkdirSync(root, { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, "streaming-"));
  directories.push(directory);
  return directory;
}

function start(options: Omit<VisualExecOptions, "command">) {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  stdout.setEncoding("utf8");
  let complete: (output: ExecOutput) => void;
  const promise = new Promise<ExecOutput>(resolve => {
    complete = resolve;
  });
  const execution = new VisualExec({ command: "controlled child", ...options });
  const result = execution.show({ stdout, stderr, promise });
  return {
    stdout,
    stderr,
    result,
    finish(output: ExecOutput = { stdout: "", stderr: "" }) {
      stdout.end();
      stderr.end();
      complete(output);
      return result;
    }
  };
}

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true });
  vi.restoreAllMocks();
});

describe("streaming output", () => {
  it("creates parent directories and flushes stdout and stderr before resolving", async () => {
    const outputFile = path.join(temporaryDirectory(), "nested", "output.log");
    const child = start({ outputFile });
    child.stdout.write("stdout\n");
    child.stderr.write("stderr\n");

    await child.finish({ stdout: "stdout\n", stderr: "stderr\n" });

    expect(fs.readFileSync(outputFile, "utf8")).toBe("stdout\nstderr\n");
  });

  it.each([true, false])("honors append: %s for an existing file", async append => {
    const outputFile = path.join(temporaryDirectory(), "output.log");
    fs.writeFileSync(outputFile, "previous\n");
    const child = start({ outputFile, outputFileOptions: { append, includeStderr: false } });
    child.stdout.write("next\n");
    child.stderr.write("excluded\n");

    await child.finish({ stdout: "next\n", stderr: "excluded\n" });

    expect(fs.readFileSync(outputFile, "utf8")).toBe(append ? "previous\nnext\n" : "next\n");
  });

  it("writes timestamped raw output to a caller stream and leaves it open", async () => {
    const outputFile = new PassThrough();
    const chunks: string[] = [];
    outputFile.on("data", chunk => chunks.push(chunk.toString()));
    const onOutput = vi.fn();
    const child = start({ outputFile, outputFileOptions: { timestamps: true }, onOutput });
    child.stdout.write("\u001b[2Kstdout\n");
    child.stderr.write("stderr\n");

    await child.finish();

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatch(/^\[\d{4}-\d\d-\d\dT[\d:.]+Z\] \u001b\[2Kstdout\n$/);
    expect(chunks[1]).toMatch(/^\[\d{4}-\d\d-\d\dT[\d:.]+Z\] stderr\n$/);
    expect(onOutput.mock.calls).toEqual([
      ["\u001b[2Kstdout\n", "stdout"],
      ["stderr\n", "stderr"]
    ]);
    expect(outputFile.writableEnded).toBe(false);
    outputFile.end();
  });

  it("settles when opening the output file fails during cleanup", async () => {
    const child = start({ outputFile: temporaryDirectory() });
    await expect(child.finish()).resolves.toEqual({ stdout: "", stderr: "" });
  });

  it("does not wait for a second close from an already destroyed file stream", async () => {
    const child = start({ outputFile: path.join(temporaryDirectory(), "output.log") });
    const calls = vi.mocked(fs.createWriteStream).mock.results;
    const stream = calls[calls.length - 1].value as fs.WriteStream;
    const closed = new Promise<void>(resolve => stream.once("close", resolve));
    stream.destroy();
    await closed;

    await expect(child.finish()).resolves.toEqual({ stdout: "", stderr: "" });
  });

  it("ignores late file output after timeout cleanup while the child is still running", async () => {
    const outputFile = path.join(temporaryDirectory(), "output.log");
    const child = start({ outputFile, timeout: 1 });
    child.stdout.write("before timeout\n");

    await expect(child.result).rejects.toMatchObject({ name: "TimeoutError" });
    expect(() => child.stdout.write("late\n")).not.toThrow();
    await expect(child.finish()).rejects.toMatchObject({ name: "TimeoutError" });

    expect(fs.readFileSync(outputFile, "utf8")).toBe("before timeout\n");
  });
});

describe("progress and matchers", () => {
  it.each([
    {
      pattern: /(?<current>\d+)\/(?<total>\d+)/,
      line: "5/10",
      progress: { current: 5, total: 10, percent: undefined }
    },
    {
      pattern: /(?<percent>\d+)%/,
      line: "75%",
      progress: { current: undefined, total: undefined, percent: 75 }
    }
  ])("extracts named groups from $line", async ({ pattern, line, progress }) => {
    const onProgress = vi.fn();
    const onMatch = vi.fn();
    const child = start({
      progress: { pattern },
      onProgress,
      matchers: [{ pattern: /status: (.+)/, onMatch }]
    });
    child.stdout.write(`\n${line}\nstatus: ready\nunrelated\n`);
    child.stderr.write("status: done\n");

    await child.finish();

    expect(onProgress.mock.calls).toEqual([[progress]]);
    expect(onMatch.mock.calls.map(([match]) => match[1])).toEqual(["ready", "done"]);
  });

  it.each([{}, { pattern: /progress: (\d+)/ }, { pattern: /unmatched/ }])(
    "ignores progress without matching named groups: %j",
    async progress => {
      const onProgress = vi.fn();
      const child = start({ progress, onProgress });
      child.stdout.write("progress: 50\n");
      await child.finish();
      expect(onProgress).not.toHaveBeenCalled();
    }
  );

  it("does not run the extractor without a progress callback", async () => {
    const extract = vi.fn(() => ({ percent: 50 }));
    const child = start({ progress: { extract } });
    child.stdout.write("progress: 50\n");
    await child.finish();
    expect(extract).not.toHaveBeenCalled();
  });
});
