// testing the finally hook

import XRun from "../../lib/xrun.js";
import { expect } from "vitest";
import xstdout from "xstdout";
import { verify } from "run-verify";

describe("xrun finally", function() {  let logs = [];
  const tasks = {
    fnFail: () => {
      throw new Error("fnFail throwing");
    },
    fnFoo2: "echo hello from foo2",
    fnFoo: {
      task: () => {
        logs.push("fnFoo");
        return new Promise(resolve => setTimeout(resolve, 400)).then(() => {
          logs.push("fnFoo async");
          return "fnFoo2";
        });
      },
      finally: ["fooCleanup"]
    },
    fooCleanup: function() {
      logs.push(`woop finally ${this.err} ${this.failed}`);
    },
    fnFooX: {
      task: () => {
        logs.push("fnFooX");
        return new Promise(resolve => setTimeout(resolve, 0)).then(() => {
          logs.push("fnFooX async");
          throw new Error("fnFooX error");
        });
      },
      finally: function() {
        logs.push(`woopX finally ${this.err} ${this.failed}`);
      }
    },
    shFoo: {
      task: "~$echo sleep 1 && sleep 1",
      finally: "~$echo sh finally"
    },
    shFooX: {
      task: "~$blah",
      finally: "~$echo err $XRUN_ERR fail $XRUN_FAILED"
    },
    fnSh: {
      task: () => {
        throw new Error();
      },
      finally: "~$echo fhSh err $XRUN_ERR fail $XRUN_FAILED"
    },
    fooConcurrent: [["fnFoo", "fnFail", "fnFooX"]],
    shConcurrent: [["shFoo", "fnFoo"]]
  };

  beforeEach(() => {
    logs = [];
  });

  it("should invoke simple function hook", () => {
    const xrun = new XRun(tasks);
    xrun.stopOnError = "soft";
    xrun.on("execute", data => {
      const fin = data.qItem.isFinally ? " X" : "";
      logs.push(`${data.type}${fin}`);
    });
    return verify()
      .expectError.callbackStep(next => xrun.run("fooConcurrent", next))
      .step(err => {
        expect(err.message).toBe("fnFail throwing");
        expect(logs.sort()).toStrictEqual(
          [
            "lookup",
            "serial-arr",
            "concurrent-arr",
            "lookup",
            "lookup",
            "lookup",
            "function",
            "fnFoo",
            "function",
            "function",
            "fnFooX",
            "fnFoo async",
            "fnFooX async",
            "function X",
            "woopX finally Error: fnFooX error Error: fnFail throwing",
            "serial-arr X",
            "lookup X",
            "function X",
            "woop finally undefined Error: fnFail throwing"
          ].sort()
        );
      });
  });

  it("should invoke simple shell hook", () => {
    const xrun = new XRun(tasks);
    xrun.stopOnError = "soft";
    xrun.on("execute", data => {
      const fin = data.qItem.isFinally ? " X" : "";
      logs.push(`${data.type}${fin}`);
    });
    const intercept = xstdout.intercept(true);
    // restore() is idempotent, so keeping the inline call below (which must run
    // before the assertions, or their output would be intercepted too) and also
    // registering it here is safe. Without this, a failed run leaves stdout
    // intercepted for every later test.
    return verify({ cleanup: () => intercept.restore() })
      .callbackStep(next => xrun.run("shConcurrent", next))
      .step(() => {
        intercept.restore();
        expect(intercept.stdout.map(x => x.trim())).toStrictEqual([
          "sleep 1",
          "hello from foo2",
          "sh finally"
        ]);
        expect(logs).toStrictEqual([
          "lookup",
          "serial-arr",
          "concurrent-arr",
          "lookup",
          "lookup",
          "function",
          "fnFoo",
          "shell",
          "fnFoo async",
          "lookup",
          "shell",
          "serial-arr X",
          "lookup X",
          "function X",
          "woop finally undefined null",
          "shell X"
        ]);
      });
  });

  it("should invoke shell hook with errors", () => {
    const xrun = new XRun(tasks);
    xrun.stopOnError = "soft";
    xrun.on("execute", data => {
      const fin = data.qItem.isFinally ? " X" : "";
      logs.push(`${data.type}${fin}`);
    });
    const intercept = xstdout.intercept(true);
    return verify({ cleanup: () => intercept.restore() })
      // the callback swallows the error deliberately
      .callbackStep(next => xrun.run(["shFooX", "fnSh"], () => next()))
      .step(() => {
        intercept.restore();
        expect(logs).toStrictEqual([
          "concurrent-arr",
          "lookup",
          "lookup",
          "function",
          "shell",
          "shell X",
          "shell X"
        ]);
        expect(intercept.stdout.map(x => x.trim())).toStrictEqual([
          "fhSh err true fail true",
          "err shell cmd 'blah' exit code 127 fail true"
        ]);
      });
  });
});
