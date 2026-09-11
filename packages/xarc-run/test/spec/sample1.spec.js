import XRun from "../../lib/xrun.js";
import sample1 from "../fixtures/sample1.js";
import { expect } from "vitest";
import { verify } from "run-verify";
import xstdout from "xstdout";

describe("sample1", function() {
  it("should run sample1:foo2 tasks", () => {
    const intercept = xstdout.intercept(true);
    const expectOutput = [
        "a direct shell command xfoo2",
        "aaaaa",
        "aaaaa",
        "aaaaa",
        "aaaaa",
        "aaaaa",
        "aaaaa",
        "aaaaa",
        "aaaaa",
        "aaaaa",
        "anonymous",
        "bbbb",
        "bbbb",
        "bbbb",
        "bbbb",
        "bbbb",
        "bbbb",
        "bbbb",
        "bbbb",
        "bbbb",
        "cccc",
        "cccc",
        "cccc",
        "concurrent anon",
        "function task for foo3",
        "hello, this is xfoo1",
        "hello, this is xfoo4",
        "hello, this is xfoo4",
        "hello, this is xfoo4",
        "test anon shell",
        "this is foo3Dep"
      ];
    const xrun = new XRun(sample1);
    return verify({ cleanup: () => intercept.restore() })
      .callbackStep(next => xrun.run("foo2", next))
      .step(() => {
        intercept.restore();
        const output = intercept.stdout.sort().map(x => x.trim());
        expect(output).toStrictEqual(expectOutput.sort());
      });
  });

  it("should run sample1:foo2b tasks with failure", () => {
    let intercept = xstdout.intercept(true);
    const expectOutput = [
      "a direct shell command xfoo2",
      "aaaaa",
      "aaaaa",
      "aaaaa",
      "aaaaa",
      "aaaaa",
      "anonymous",
      "bbbb",
      "bbbb",
      "bbbb",
      "bbbb",
      "bbbb",
      "cccc",
      "concurrent anon",
      "function task for foo3",
      "hello, this is xfoo1",
      "test anon shell",
      "this is foo3Dep"
    ];
    const xrun = new XRun(sample1);
    return verify({ cleanup: () => intercept.restore() })
      .expectError.callbackStep(next => xrun.run("foo2ba", next))
      .step(err => {
        intercept.restore();
        expect(err).toEqual(expect.anything());
        const output = intercept.stdout.sort().map(x => x.trim());
        expect(output).toStrictEqual(expectOutput.sort());
        intercept = xstdout.intercept(true);
      })
      .callbackStep(next => xrun.waitAllPending(next))
      .step(() => {
        intercept.restore();
      });
  });

  it("should run sample1:foo2b tasks with stopOnError false", () => {
    let intercept = xstdout.intercept(true);
    const xrun = new XRun(sample1);
    xrun.stopOnError = false;
    return verify({ cleanup: () => intercept.restore() })
      .expectErrorToBe("xerr")
      .callbackStep(next => xrun.run("foo2ba", next))
      .step(err => {
        intercept.restore();
        expect(err).toEqual(expect.anything());
        expect(err.more).toEqual(expect.anything());
        expect(err.more.length).toBe(1);
        expect(err.more[0].message).toBe("xerr");
        intercept = xstdout.intercept(true);
      })
      .callbackStep(next => xrun.waitAllPending(next))
      .step(() => {
        intercept.restore();
      });
  });
});
