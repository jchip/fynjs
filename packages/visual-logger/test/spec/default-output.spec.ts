import { describe, it, expect } from "vitest";
import { verify } from "run-verify";
import { defaultOutput } from "../../src/index.js";

describe("default output write", () => {
  it("should write to process.stdout", () => {
    const write = process.stdout.write.bind(process.stdout);
    let called: string | undefined;
    process.stdout.write = ((x: string) => {
      called = x;
      return true;
    }) as any;
    return verify({
      timeout: 500,
      cleanup: () => {
        process.stdout.write = write;
      }
    }).step(() => {
      defaultOutput.write("blah");
      process.stdout.write = write;
      expect(called).toBe("blah");
    });
  });

  it("should detect tty", () => {
    expect(defaultOutput.isTTY()).toBeUndefined();
  });
});
