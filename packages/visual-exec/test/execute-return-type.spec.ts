import { describe, it, expect, vi } from "vitest";
import { VisualExec, type ExecOutput } from "../src/visual-exec.ts";

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

//
// FPM-115: `execute()` used to be declared `Promise<ExecOutput | unknown>`. A union with
// `unknown` is absorbed by `unknown`, so the signature carried no information and every
// caller had to cast. The assertions below are compile-time: they are checked by
// `tsc --noEmit -p tsconfig.test.json`, and fail there if the signature ever widens back.
//
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

interface ParsedResult {
  parsed: string;
}

// Never invoked - it exists so `tsc` checks the types of these call sites.
async function typeProbe(ve: VisualExec, child: Parameters<VisualExec["show"]>[0]) {
  const defaultResult = await ve.execute();
  type _DefaultIsExecOutput = Expect<Equal<typeof defaultResult, ExecOutput>>;

  // The fields are reachable with no cast - reading them was TS2339 under the old signature.
  const stdout: string = defaultResult.stdout;
  const stderr: string = defaultResult.stderr;

  const customResult = await ve.execute<ParsedResult>();
  type _CustomIsParsedResult = Expect<Equal<typeof customResult, ParsedResult>>;

  // `show()` carries the same guarantee, since `execute()` is a thin wrapper over it.
  const shownResult = await ve.show(child);
  type _ShowIsExecOutput = Expect<Equal<typeof shownResult, ExecOutput>>;

  const shownCustom = await ve.show<ParsedResult>(child);
  type _ShowCustomIsParsedResult = Expect<Equal<typeof shownCustom, ParsedResult>>;

  return { stdout, stderr, customResult, shownResult, shownCustom };
}

void typeProbe;

describe("execute() return type", () => {
  it("should resolve to ExecOutput with no cast at the call site", async () => {
    const ve = new VisualExec({
      command: "echo hello",
      outputLevel: "debug"
    });
    ve.logFinalOutput = vi.fn();

    const result = await ve.execute();

    // Typed as ExecOutput: `.stdout` needs no cast to reach.
    expect(result.stdout).toContain("hello");
    expect(result.stderr).toBe("");
  });

  it("should resolve to the requested type when onComplete substitutes a result", async () => {
    const ve = new VisualExec({
      command: "echo hello",
      onComplete: (output): ParsedResult => ({ parsed: output.stdout.trim() }),
      outputLevel: "debug"
    });
    ve.logFinalOutput = vi.fn();

    const result = await ve.execute<ParsedResult>();

    expect(result.parsed).toBe("hello");
  });
});
