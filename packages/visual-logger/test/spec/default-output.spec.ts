import { describe, it, expect } from "vitest";
import { defaultOutput } from "../../src/index.ts";

describe("default output write", () => {
  it("should write to process.stdout", () => {
    const write = process.stdout.write.bind(process.stdout);
    let called: string | undefined;
    process.stdout.write = ((x: string) => {
      called = x;
      return true;
    }) as any;
    defaultOutput.write("blah");
    process.stdout.write = write;
    expect(called).toBe("blah");
  });

  it("should detect tty", () => {
    expect(defaultOutput.isTTY()).toBeUndefined();
  });
});
