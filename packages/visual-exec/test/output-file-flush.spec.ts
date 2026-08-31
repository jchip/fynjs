import { describe, it, expect, vi } from "vitest";
import Path from "path";
import os from "os";
import fs from "fs";

//
// `execute()` used to resolve while the output file was still being written: `end()` starts
// the flush rather than finishing it, and `createWriteStream` opens the file asynchronously.
// A caller that awaited execute() could read a short file, or none at all - CI hit
// `ENOENT: no such file or directory` on the outputFile test while it passed locally.
//
// Racing it with a large payload is load-dependent (20k lines still flushed in time on a
// fast disk), so this holds the close open deliberately instead. If execute() does not wait
// for the stream, `closed` is still false when it resolves.
//
// The mock lives in its own spec file because it replaces `fs` for the whole module graph.
//
const state = { closed: false, delayMs: 50 };

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();

  const createWriteStream = (...args: Parameters<typeof actual.createWriteStream>) => {
    const stream = actual.createWriteStream(...args);
    const realEnd = stream.end.bind(stream);

    stream.end = ((...endArgs: any[]) => {
      setTimeout(() => (realEnd as any)(...endArgs), state.delayMs);
      return stream;
    }) as typeof stream.end;

    stream.once("close", () => {
      state.closed = true;
    });

    return stream;
  };

  return { ...actual, default: { ...actual, createWriteStream }, createWriteStream };
});

import { VisualExec } from "../src/visual-exec";

describe("outputFile flushing", () => {
  it("does not resolve until the output file is closed", async () => {
    const outFile = Path.join(os.tmpdir(), `visual-exec-close-${Date.now()}.log`);
    state.closed = false;

    const ve = new VisualExec({
      command: "echo hello world",
      outputFile: outFile,
      outputLevel: "debug"
    });
    ve.logFinalOutput = vi.fn();

    try {
      await ve.execute();

      expect(state.closed).toBe(true);
      expect(fs.readFileSync(outFile, "utf8")).toContain("hello");
    } finally {
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    }
  });
});
