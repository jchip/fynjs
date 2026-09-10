import { describe, it, expect } from "vitest";
import AveAzul from "aveazul";
import { verify } from "run-verify";
import xsh from "../../src/index.ts";
import type { ExecError, ExecOutput, ExecResult } from "../../src/index.ts";

describe("exec", function () {
  const expectUnknownCmdSig = process.platform === "win32" ? "is not recognized" : "not found";

  it("should failed for unknown command", () => {
    let output!: ExecOutput;

    return verify()
      .expectError.callbackStep(next =>
        xsh.exec("unknown_command", (err, out) => {
          output = out;
          next(err);
        })
      )
      .step(err => {
        const execErr = err as ExecError;
        expect(execErr.output.stderr).toBe(output.stderr);
        expect(output.stderr).toContain(expectUnknownCmdSig);
      });
  });

  it("should failed for unknown command @Promise", () => {
    return verify()
      .expectError.step((xsh.exec("unknown_command") as ExecResult).promise)
      .step(err => {
        expect((err as ExecError).output.stderr).toContain(expectUnknownCmdSig);
      });
  });

  it("should execute command", () => {
    return verify()
      .callbackStep<ExecOutput>(next => xsh.exec("echo hello, world", next))
      .step(output => {
        expect(output.stdout.trim()).toBe("hello, world");
      });
  });

  it("should execute command with output silent", () => {
    return verify()
      .callbackStep<ExecOutput>(next => xsh.exec(false, "echo hello, world", next))
      .step(output => {
        expect(output.stdout.trim()).toBe("hello, world");
      });
  });

  it("should execute command @Promise", () => {
    return (xsh.exec("echo hello, world") as ExecResult).promise.then(output => {
      expect(output.stdout.trim()).toBe("hello, world");
    });
  });

  it("should failed for empty arguments", () => {
    expect(() => (xsh.exec as any)()).toThrow(Error);
  });

  it("should failed for no command", () => {
    expect(() => xsh.exec(() => undefined)).toThrow(Error);
  });

  it("should exec command split in array", () => {
    return verify()
      .callbackStep<ExecOutput>(next => xsh.exec(["echo", "hello,", "world"], next))
      .step(output => {
        expect(output.stdout.trim()).toBe("hello, world");
      });
  });

  it("should exec command split in multiple arrays", () => {
    return verify()
      .callbackStep<ExecOutput>(next =>
        xsh.exec(["echo", "hello, world"], ["my", "name", "is", "test"], next)
      )
      .step(output => {
        expect(output.stdout.trim()).toBe("hello, world my name is test");
      });
  });

  it("should exec command split in arrays and strings", () => {
    return verify()
      .callbackStep<ExecOutput>(next =>
        xsh.exec(
          ["echo", "hello, world"],
          ["my", "name"],
          "is",
          "test",
          ["foo", "bar"],
          "more",
          "text",
          next
        )
      )
      .step(output => {
        expect(output.stdout.trim()).toBe("hello, world my name is test foo bar more text");
      });
  });

  it("should exec with user env", () => {
    let cmd;
    let expected;
    if (process.platform === "win32") {
      cmd = "echo FOO=%FOO% hello=%hello%";
      expected = "FOO=%FOO% hello=test";
    } else {
      cmd = "echo FOO=$FOO hello=$hello";
      expected = "FOO= hello=test";
    }
    process.env.FOO = "bar";

    return verify({ cleanup: () => delete process.env.FOO })
      .callbackStep<ExecOutput>(next =>
        xsh.exec({ env: { hello: "test", PATH: process.env.PATH } }, cmd, next)
      )
      .step(output => {
        expect(output.stdout.trim()).toContain(expected);
      });
  });

  it("should fail if a command fragment is not array or string", () => {
    expect(() => (xsh.exec as any)("test", ["1", "2"], 1)).toThrow(
      "command fragment must be an array or string"
    );
  });

  it("should reject null as a command fragment", () => {
    expect(() => (xsh.exec as any)("echo hi", null)).toThrow(
      "command fragment must be an array or string"
    );
  });

  it("should accept options with a null prototype", () => {
    const opts = Object.create(null);
    opts.silent = true;

    return verify()
      .callbackStep<ExecOutput>(next => xsh.exec(opts, "echo hello, world", next))
      .step(output => {
        expect(output.stdout.trim()).toBe("hello, world");
      });
  });

  it("should accept a class instance as options", () => {
    class Options {
      silent = true;
    }

    return verify()
      .callbackStep<ExecOutput>(next => (xsh.exec as any)(new Options(), "echo hello, world", next))
      .step(output => {
        expect(output.stdout.trim()).toBe("hello, world");
      });
  });

  it("should fail if options is not last or 2nd to last argument", () => {
    expect(() => (xsh.exec as any)("test", ["a"], true, "b", () => true)).toThrow(
      "options must be the first, last, or second to last argument"
    );
  });

  it("should emit stdout data before complete @callback", () => {
    const data: string[] = [];

    return verify()
      .callbackStep(next => {
        const r = xsh.exec(true, "echo 1 && sleep 1 && echo 2", next) as any;
        r.stdout.on("data", (x: string | Buffer) => data.push(String(x).trim()));
      })
      .step(() => {
        expect(data).toStrictEqual(["1", "2"]);
      });
  });

  it("should emit stdout data before complete @Promise", () => {
    const data: string[] = [];
    const r = xsh.exec(true, "echo 1 && sleep 1 && echo 2") as ExecResult;

    r.stdout!.on("data", (x: string | Buffer) => data.push(String(x).trim()));

    return r.then(() => {
      expect(data).toStrictEqual(["1", "2"]);
    });
  });

  it("should provide catch for error", () => {
    return verify()
      .expectError.step(xsh.exec(true, "blahblahblah") as ExecResult)
      .step(err => {
        const error = err as ExecError;
        expect(error).toEqual(expect.anything());
        expect(error.output.stderr).toContain(
          process.platform === "win32" ? "not recognized" : "not found"
        );
      });
  });

  it("should have its returned value be treated as a promise by aveazul", () => {
    return AveAzul.resolve("hello")
      .then(() => xsh.exec("echo blah") as ExecResult)
      .then((r: any) => {
        expect(r.stdout.trim()).toBe("blah");
        expect(r.stderr).toBe("");
      });
  });

  it("should have its returned value be treated as a promise by global.Promise", () => {
    return global.Promise.resolve("hello")
      .then(() => xsh.exec("echo blah") as ExecResult)
      .then((r: any) => {
        expect(r.stdout.trim()).toBe("blah");
        expect(r.stderr).toBe("");
      });
  });
});
