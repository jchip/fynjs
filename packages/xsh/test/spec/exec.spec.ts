import { describe, it, expect } from "vitest";
import AveAzul from "aveazul";
import xsh from "../../src/index.ts";
import type { ExecError, ExecOutput, ExecResult } from "../../src/index.ts";

// run the callback form of xsh.exec and resolve with what the callback got
const execCb = (...args: any[]): Promise<{ err: ExecError | null; output: ExecOutput }> =>
  new Promise(resolve => {
    (xsh.exec as any)(...args, (err: ExecError | null, output: ExecOutput) =>
      resolve({ err, output })
    );
  });

describe("exec", function () {
  const expectUnknownCmdSig = process.platform === "win32" ? "is not recognized" : "not found";

  it("should failed for unknown command", async () => {
    const { err, output } = await execCb("unknown_command");
    expect(err).to.be.ok;
    expect(err!.output.stderr).equals(output.stderr);
    expect(output.stderr).includes(expectUnknownCmdSig);
  });

  it("should failed for unknown command @Promise", () => {
    return (xsh.exec("unknown_command") as ExecResult).promise.then(
      () => {
        throw new Error("expected failure");
      },
      err => {
        expect(err.output.stderr).includes(expectUnknownCmdSig);
      }
    );
  });

  it("should execute command", async () => {
    const { err, output } = await execCb("echo hello, world");
    expect(err).to.be.not.ok;
    expect(output.stdout.trim()).to.equal("hello, world");
  });

  it("should execute command with output silent", async () => {
    const { err, output } = await execCb(false, "echo hello, world");
    expect(err).to.be.not.ok;
    expect(output.stdout.trim()).to.equal("hello, world");
  });

  it("should execute command @Promise", () => {
    return (xsh.exec("echo hello, world") as ExecResult).promise.then(output => {
      expect(output.stdout.trim()).to.equal("hello, world");
    });
  });

  it("should failed for empty arguments", () => {
    expect(() => (xsh.exec as any)()).to.throw(Error);
  });

  it("should failed for no command", () => {
    expect(() => xsh.exec(() => undefined)).to.throw(Error);
  });

  it("should exec command split in array", async () => {
    const { err, output } = await execCb(["echo", "hello,", "world"]);
    expect(err).to.be.not.ok;
    expect(output.stdout.trim()).to.equal("hello, world");
  });

  it("should exec command split in multiple arrays", async () => {
    const { err, output } = await execCb(["echo", "hello, world"], ["my", "name", "is", "test"]);
    expect(err).to.be.not.ok;
    expect(output.stdout.trim()).to.equal("hello, world my name is test");
  });

  it("should exec command split in arrays and strings", async () => {
    const { err, output } = await execCb(
      ["echo", "hello, world"],
      ["my", "name"],
      "is",
      "test",
      ["foo", "bar"],
      "more",
      "text"
    );
    expect(err).to.be.not.ok;
    expect(output.stdout.trim()).to.equal("hello, world my name is test foo bar more text");
  });

  it("should exec with user env", async () => {
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
    try {
      const { err, output } = await execCb(
        {
          env: {
            hello: "test",
            PATH: process.env.PATH
          }
        },
        cmd
      );
      expect(err).to.be.not.ok;
      expect(output.stdout.trim()).includes(expected);
    } finally {
      delete process.env.FOO;
    }
  });

  it("should fail if a command fragment is not array or string", () => {
    expect(() => (xsh.exec as any)("test", ["1", "2"], 1)).to.throw(
      "command fragment must be an array or string"
    );
  });

  it("should fail if options is not last or 2nd to last argument", () => {
    expect(() => (xsh.exec as any)("test", ["a"], true, "b", () => true)).to.throw(
      "options must be the first, last, or second to last argument"
    );
  });

  it("should emit stdout data before complete @callback", async () => {
    const data: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const r = xsh.exec(true, "echo 1 && sleep 1 && echo 2", () => {
        try {
          expect(data).to.deep.equal(["1", "2"]);
          resolve();
        } catch (e) {
          reject(e);
        }
      }) as any;
      r.stdout.on("data", (x: string | Buffer) => data.push(String(x).trim()));
    });
  });

  it("should emit stdout data before complete @Promise", () => {
    const data: string[] = [];
    const r = xsh.exec(true, "echo 1 && sleep 1 && echo 2") as ExecResult;

    r.stdout!.on("data", (x: string | Buffer) => data.push(String(x).trim()));

    return r.then(() => {
      expect(data).to.deep.equal(["1", "2"]);
    });
  });

  it("should provide catch for error", () => {
    let error: ExecError | undefined;
    return (xsh.exec(true, "blahblahblah") as ExecResult)
      .catch(err => {
        error = err;
      })
      .then(() => {
        expect(error).to.exist;
        expect(error!.output.stderr).includes(
          process.platform === "win32" ? "not recognized" : "not found"
        );
      });
  });

  it("should have its returned value be treated as a promise by aveazul", () => {
    return AveAzul.resolve("hello")
      .then(() => xsh.exec("echo blah") as ExecResult)
      .then((r: any) => {
        expect(r.stdout.trim()).to.equal("blah");
        expect(r.stderr).to.equal("");
      });
  });

  it("should have its returned value be treated as a promise by global.Promise", () => {
    return global.Promise.resolve("hello")
      .then(() => xsh.exec("echo blah") as ExecResult)
      .then((r: any) => {
        expect(r.stdout.trim()).to.equal("blah");
        expect(r.stderr).to.equal("");
      });
  });
});
