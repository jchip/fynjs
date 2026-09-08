import { describe, it, expect } from "vitest";
import xstdout, { intercept, interceptStdout, interceptStdouterr } from "../../src/index.ts";

describe("xstdout", () => {
  it("should silently capture stdout & stderr", () => {
    const res = intercept(true);
    process.stdout.write("hello");
    process.stderr.write("blah");
    res.restore();
    expect(res.stdout[0]).toBe("hello");
    expect(res.stderr[0]).toBe("blah");
  });

  it("should silently capture stdout & stderr to same interceptor", () => {
    const stdout: string[] = [];
    const restore = interceptStdouterr(msg => {
      stdout.push(msg);
      return false;
    });
    process.stdout.write("hello");
    process.stderr.write("blah");
    restore();
    expect(stdout[0]).toBe("hello");
    expect(stdout[1]).toBe("blah");
  });

  it("should allow capture only stdout w/o stderr", () => {
    const stdout: string[] = [];
    const restore = interceptStdout(msg => {
      stdout.push(msg);
      return false;
    });
    process.stdout.write("hello");
    process.stderr.write("blah");
    restore();
    expect(stdout[0]).toBe("hello");
    expect(stdout[1]).toBeUndefined();
  });

  it("should catch error from interceptor", () => {
    const restore = interceptStdout(() => {
      throw new Error("oh no");
    });
    process.stdout.write("hello");
    restore();
  });

  it("should catch non-Error thrown from interceptor", () => {
    const restore = interceptStdout(() => {
      throw "string error";
    });
    process.stdout.write("hello");
    restore();
  });

  it("should unsilently capture stdout & stderr", () => {
    const res = intercept(false);
    process.stdout.write("hello\n");
    process.stderr.write("blah\n");
    res.restore();
    expect(res.stdout[0]).toBe("hello\n");
    expect(res.stderr[0]).toBe("blah\n");
  });

  it("should unsilently capture stderr", () => {
    const res = intercept(true, false);
    process.stdout.write("hello\n");
    process.stderr.write("blah\n");
    res.restore();
    expect(res.stdout[0]).toBe("hello\n");
    expect(res.stderr[0]).toBe("blah\n");
  });

  it("should replace string to console", () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const restore = interceptStdouterr(
      msg => {
        stdout.push(msg);
        return "test";
      },
      msg => {
        stderr.push(msg);
        return "test-err";
      }
    );
    process.stdout.write("foo");
    console.log("hello");
    restore();
    expect(stdout[0]).toBe("foo");
    expect(stdout[1]).toBe("hello\n");
  });

  it("should handle empty string replacement", () => {
    const stdout: string[] = [];
    const restore = interceptStdout(msg => {
      stdout.push(msg);
      return "";
    });
    process.stdout.write("hello\n");
    restore();
    expect(stdout[0]).toBe("hello\n");
  });

  it("should expose default export with intercept methods", () => {
    expect(typeof xstdout.intercept).toBe("function");
    expect(typeof xstdout.interceptStdout).toBe("function");
    expect(typeof xstdout.interceptStdouterr).toBe("function");
  });
});
