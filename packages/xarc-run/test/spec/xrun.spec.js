import gxrun from "../../lib/index.js";
import XRun from "../../lib/xrun.js";
import childProc from "child_process";
import xrun from "../../lib/index.js";
import { expect } from "vitest";
import xstdout from "xstdout";
import chalk from "../../lib/chalk.js";
import assert from "assert";
import stripAnsi from "strip-ansi";
import Munchy from "munchy";
import { PassThrough } from "stream";
// verify.signal rather than the bare `signal` export: the SIGTERM test below has a
// local `signal` from node's (code, signal) exit handler, so the name is taken here.
import { verify } from "run-verify";
import xsh from "xsh";
import * as xaa from "xaa";
import { CliContext } from "../../lib/cli-context.js";

describe("xrun", function() {
  it("should lookup and exe a task as a function once", () => {
    let foo = 0;
    const xrun = new XRun({
      foo: () => foo++
    });
    const exeEvents = ["lookup", "function"];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      expect(data.qItem.name).toBe("foo");
      exeEvents.shift();
    });

    let doneItem = 0;
    xrun.on("done-item", () => doneItem++);

    return verify()
      .callbackStep(next => xrun.run("foo", next))
      .step(() => {
        expect(doneItem).toBe(1);
        expect(foo).toBe(1);
      });
  });

  it("should lookup and call task function with 2 params with context and callback", () => {
    let context;
    const xrun = new XRun({
      foo(ctx, done) {
        context = ctx;
        done();
      }
    });

    return verify({ timeout: 500 })
      .step(() => xrun.asyncRun("foo --a=50 --bar=60"))
      .step(() => {
        expect(Object.prototype.toString.call(context)).toBe("[object Object]");
        expect(context.argOpts).toStrictEqual({ a: 50, bar: 60 });
      });
  });

  it("should call task function with only callback parameter (no context)", () => {
    let callbackCalled = false;
    const xrun = new XRun({
      foo(done) {
        setTimeout(() => {
          callbackCalled = true;
          done();
        }, 10);
      }
    });

    return verify({ timeout: 500 })
      .step(() => xrun.asyncRun("foo"))
      .step(() => {
        expect(callbackCalled).toBe(true);
      });
  });

  it("should handle synchronous task function that doesn't return a promise", () => {
    let taskCalled = false;
    const xrun = new XRun({
      foo(ctx) {
        taskCalled = true;
        // synchronous task - no return value
      }
    });

    return verify({ timeout: 500 })
      .step(() => xrun.asyncRun("foo"))
      .step(() => {
        expect(taskCalled).toBe(true);
      });
  });

  it("should fail on unknown options if cliParser.allowUnknownOption is false", () => {
    let context;
    const xrun = new XRun({
      foo: {
        cliParser: {
          allowUnknownOption: false
        },
        task(ctx) {
          context = ctx;
        }
      }
    });

    return verify({ timeout: 500 })
      .expectError.step(() => xrun.asyncRun("foo --a=50 --bar=60"))
      .step(error => {
        expect(error.message).toBe("Unknown options for task foo: a, bar");
        expect(context).toBeUndefined();
      });
  });

  it("should parse task argOpts with aliases and values (FJM-131)", () => {
    let context;
    const xrun = new XRun({
      foo: {
        argOpts: {
          name: { required: true, args: "<val string>", alias: "n" }
        },
        task(ctx) {
          context = ctx;
        }
      }
    });

    return verify({ timeout: 500 })
      .step(() => xrun.asyncRun("foo -n world"))
      .step(() => {
        expect(context.argOpts.name).toBe("world");
        expect(context.argOpts.n).toBe("world");
      });
  });

  it("should fail when required task argOpts is missing (FJM-131)", () => {
    let context;
    const xrun = new XRun({
      foo: {
        argOpts: {
          name: { required: true, args: "<val string>", alias: "n" }
        },
        task(ctx) {
          context = ctx;
        }
      }
    });

    return verify({ timeout: 500 })
      .expectError.step(() => xrun.asyncRun("foo"))
      .step(error => {
        expect(error.message).toContain("missing these required options name");
        expect(context).toBeUndefined();
      });
  });

  it("should support legacy require: true and type: 'string' in argOpts (FJM-131)", () => {
    let context;
    const xrun = new XRun({
      foo: {
        argOpts: {
          name: { require: true, type: "string", alias: "n" }
        },
        task(ctx) {
          context = ctx;
        }
      }
    });

    return verify({ timeout: 500 })
      .step(() => xrun.asyncRun("foo -n legacy"))
      .step(() => {
        expect(context.argOpts.name).toBe("legacy");
      });
  });

  it("should run a top-level exec task with env options without leaking env to argOpts (FJM-191)", () => {
    let context;
    const xrun = new XRun();
    xrun.load({
      foo: xrun.exec("echo $FOO", { env: { FOO: "bar" } }),
      check(ctx) {
        context = ctx;
      }
    });

    return verify({ timeout: 1000 })
      .step(() => xrun.asyncRun(xrun.serial("foo", "check")))
      .step(() => {
        expect(context.argOpts).toBeUndefined();
      });
  });

  it("should parse task with array and count options (FJM-194)", () => {
    let context;
    const xrun = new XRun({
      foo: {
        argOpts: {
          files: { type: "array" },
          verbose: { type: "count", alias: "v" }
        },
        task(ctx) {
          context = ctx;
        }
      }
    });

    return verify({ timeout: 1000 })
      .step(() => xrun.asyncRun("foo --files a b -vvv"))
      .step(() => {
        expect(context.argOpts.files).toStrictEqual(["a", "b"]);
        expect(context.argOpts.verbose).toBe(3);
        expect(context.argOpts.v).toBe(3);
      });
  });

  it("should pass context to function that take a single param named ctx/context", () => {
    let receivedContext;
    let receivedCtx;
    const xrun = new XRun({
      foo: {
        task(context) {
          receivedContext = context;
        }
      },
      blah: {
        task(ctx) {
          receivedCtx = ctx;
        }
      }
    });

    xrun.setCliContext(
      new CliContext({
        tasks: ["foo", "blah"],
        cmdNodes: {
          foo: { argv: ["foo", "-a=50", "--bar=60"], opts: { a: "50", bar: "60" } },
          blah: { argv: ["blah", "-x=500", "--abc=100"], opts: { x: "500", abc: "100" } }
        }
      })
    );

    return verify()
      .callbackStep(next => xrun.run("foo", next))
      .step(() => {
        expect(Object.prototype.toString.call(receivedContext)).toBe("[object Object]");
        expect(receivedContext.argOpts.a).toBe(50);
        expect(receivedContext.argOpts.bar).toBe(60);
      })
      .callbackStep(next => xrun.run("blah", next))
      .step(() => {
        expect(Object.prototype.toString.call(receivedCtx)).toBe("[object Object]");
        expect(receivedCtx.argOpts.x).toBe(500);
        expect(receivedCtx.argOpts.abc).toBe(100);
      });
  });

  it("should exe task name return by function", () => {
    let foo = 0;
    const xrun = new XRun({
      foo: () => "foo2",
      foo2: () => foo++
    });
    const exeEvents = ["lookup", "function", "lookup", "function"];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    let doneItem = 0;
    xrun.on("done-item", () => doneItem++);

    return verify()
      .callbackStep(next => xrun.run("foo", next))
      .step(() => {
        expect(doneItem).toBe(2);
        expect(foo).toBe(1);
      });
  });

  it("should exe task array return by function", () => {
    let foo2 = 0,
      foo3 = 0;
    const xrun = new XRun({
      foo: () => ["foo2", "foo3"],
      foo2: () => foo2++,
      foo3: () => foo3++
    });
    const exeEvents = [
      "lookup",
      "function",
      "concurrent-arr",
      "lookup",
      "lookup",
      "function",
      "function"
    ];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    let doneItem = 0;
    xrun.on("done-item", () => doneItem++);

    return verify()
      .callbackStep(next => xrun.run("foo", next))
      .step(() => {
        expect(doneItem).toBe(4);
        expect(foo2).toBe(1);
        expect(foo3).toBe(1);
      });
  });

  it("should exe function return by function", () => {
    let foo = 0;
    const xrun = new XRun({
      foo: () => () => foo++
    });
    const exeEvents = ["lookup", "function", "function"];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    let doneItem = 0;
    xrun.on("done-item", () => doneItem++);

    return verify()
      .callbackStep(next => xrun.run("foo", next))
      .step(() => {
        expect(doneItem).toBe(2);
        expect(foo).toBe(1);
      });
  });

  it("should pass task options as argv", () => {
    const xrun = new XRun({
      foo: function() {
        expect(this.argv).toStrictEqual([]);
      },
      foo1: function() {
        expect(this.argv).toStrictEqual(["foo1", "--test"]);
      },
      foo2: function() {
        expect(this.argv).toStrictEqual(["foo2", "--a", "--b"]);
      }
    });

    return verify().callbackStep(next => xrun.run(["foo", "foo1 --test", "foo2 --a --b"], next));
  });

  it("should execute a dep string as shell directly", () => {
    let foo = 0;
    const xrun = new XRun({
      foo: {
        dep: "set a=0",
        task: () => foo++
      }
    });
    const exeEvents = ["lookup", "shell", "function"];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    let doneItem = 0;
    xrun.on("done-item", _data => doneItem++);

    return verify()
      .callbackStep(next => xrun.run("foo", next))
      .step(() => {
        expect(doneItem).toBe(2);
        expect(foo).toBe(1);
      });
  });

  it("should handle error from dep shell", () => {
    let foo = 0;
    const xrun = new XRun({
      foo: {
        dep: "exit 1",
        task: () => foo++
      }
    });
    const exeEvents = ["lookup", "shell", "function"];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    let doneItem = 0;
    xrun.on("done-item", _data => doneItem++);

    return verify()
      .expectError.callbackStep(next => xrun.run("foo", next))
      .step(err => {
        expect(err.message).toBe("shell cmd 'exit 1' exit code 1");
        expect(doneItem).toBe(1);
        expect(foo).toBe(0);
      });
  });

  it.skipIf(!process.stdout.isTTY)("should execute shell with tty", () => {
    const xrun = new XRun({
      foo: `~(tty)$node -e "process.exit(process.stdout.isTTY ? 0 : 1)"`
    });
    const exeEvents = ["lookup", "shell"];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    let doneItem = 0;
    xrun.on("done-item", _data => doneItem++);

    return verify()
      .callbackStep(next => xrun.run("foo", next))
      .step(() => {
        expect(doneItem).toBe(1);
      });
  });

  it("should execute shell with remaining args", () => {
    const xrun = new XRun({
      foo: { task: gxrun.exec("echo hello") }
    });

    const intercept = xstdout.intercept(true);

    xrun.setCliContext(
      new CliContext({
        tasks: ["foo"],
        cmdNodes: { foo: { argv: ["foo"], opts: {} } },
        parsed: { _: ["foo     world", "a", "b", "   test  1   2   3"] }
      })
    );

    return verify({ cleanup: () => intercept.restore() })
      .callbackStep(next => xrun.run("foo", next))
      .step(() => {
        intercept.restore();
        expect(intercept.stdout.join().trim()).toBe(
          "hello foo     world a b    test  1   2   3"
        );
      });
  });

  it("should execute XTaskSpec shell with flags as array", () => {
    const xrun = new XRun({
      foo: gxrun.exec("echo test-flags-array", { flags: ["noenv"] })
    });
    const exeEvents = ["lookup", "shell"];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    let doneItem = 0;
    xrun.on("done-item", _data => doneItem++);

    const intercept = xstdout.intercept(true);

    return verify({ cleanup: () => intercept.restore() })
      .callbackStep(next => xrun.run("foo", next))
      .step(() => {
        intercept.restore();
        expect(doneItem).toBe(1);
        expect(intercept.stdout.join().trim()).toBe("test-flags-array");
      });
  });

  const execXTaskSpec = flags => {
    const xrun = new XRun({
      foo: gxrun.exec(`node -e "process.exit(process.stdout.isTTY ? 0 : 1)"`, { flags })
    });
    const exeEvents = ["lookup", "shell"];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    let doneItem = 0;
    xrun.on("done-item", _data => doneItem++);

    return verify()
      .callbackStep(next => xrun.run("foo", next))
      .step(() => {
        expect(doneItem).toBe(1);
      });
  };

  it.skipIf(!process.stdout.isTTY)("should execute XTaskSpec shell with tty flag", () => {
    return execXTaskSpec("tty");
  });

  it.skipIf(!process.stdout.isTTY)("should execute XTaskSpec shell with tty flag", () => {
    return execXTaskSpec(["tty"]);
  });

  it.skipIf(!process.stdout.isTTY)("should execute XTaskSpec shell with tty flag", () => {
    return execXTaskSpec({ tty: true });
  });

  it.skipIf(!process.stdout.isTTY)("should execute XTaskSpec shell with npm flag", () => {
    return execXTaskSpec({ npm: true });
  });

  it.skipIf(!process.stdout.isTTY)("should execute anonymous XTaskSpec shell task", () => {
    const xrun = new XRun({
      foo: [gxrun.exec(`node -e "process.exit(process.stdout.isTTY ? 0 : 1)"`, "tty")]
    });
    const exeEvents = ["lookup", "serial-arr", "shell"];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    let doneItem = 0;
    xrun.on("done-item", _data => doneItem++);

    return verify()
      .callbackStep(next => xrun.run("foo", next))
      .step(() => {
        expect(doneItem).toBe(2);
      });
  });

  it("should execute shell with spawn sync", () => {
    const xrun = new XRun({
      foo: `~(spawn,sync)$echo hello`
    });
    const exeEvents = ["lookup", "shell"];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    let doneItem = 0;
    xrun.on("done-item", _data => doneItem++);

    return verify()
      .callbackStep(next => xrun.run("foo", next))
      .step(() => {
        expect(doneItem).toBe(1);
      });
  });

  it("should execute shell with spawn sync noenv", () => {
    process.env.FOO_NOENV = 1;
    const xrun = new XRun({
      foo: `~(spawn,sync,noenv)$exit $FOO_NOENV`
    });
    const exeEvents = ["lookup", "shell"];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    let doneItem = 0;
    xrun.on("done-item", _data => doneItem++);

    return verify()
      .callbackStep(next => xrun.run("foo", next))
      .step(() => {
        expect(doneItem).toBe(1);
      });
  });

  it("env should avoid replacing if override is false", () => {
    const key = `TEST_${Date.now()}`;
    delete process.env[key];
    process.env[key] = "TEST123";
    const xrun = new XRun({});

    xrun.load({
      foo: xrun.env({ [key]: "blah" }, { override: false })
    });

    return verify()
      .callbackStep(next => xrun.run("foo", next))
      .step(() => {
        expect(process.env[key]).toBe("TEST123");
        delete process.env[key];
      });
  });

  it("updateEnv should set env", () => {
    const key = `TEST_${Date.now()}`;
    delete process.env[key];
    const xrun = new XRun({});
    xrun.updateEnv({ [key]: "hello" });
    expect(process.env[key]).toBe("hello");
    delete process.env[key];
  });

  it("should handle shell with unknown flag", () => {
    const xrun = new XRun({
      foo: `~(spawn,foo,sync)$echo hello`
    });
    const exeEvents = ["lookup", "shell"];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    let doneItem = 0;
    xrun.on("done-item", _data => doneItem++);

    return verify()
      .expectError.callbackStep(next => xrun.run("foo", next))
      .step(err => {
        expect(doneItem).toBe(0);
        expect(err.message).toContain("Unknown flag foo in shell task");
      });
  });

  it("should handle XTaskSpec with unknown type", () => {
    const xrun = new XRun({
      foo: new gxrun.XTaskSpec({ type: "blah" })
    });

    return verify()
      .expectError.callbackStep(next => xrun.run("foo", next))
      .step(err => {
        expect(err.message).toContain("Unable to process XTaskSpec type blah");
      });
  });

  it("should handle anonymous XTaskSpec with unknown type", () => {
    const xrun = new XRun({
      foo: [new gxrun.XTaskSpec({ type: "blah" })]
    });

    return verify()
      .expectError.callbackStep(next => xrun.run("foo", next))
      .step(err => {
        expect(err.message).toContain("Unable to process XTaskSpec type blah");
      });
  });

  it("should handle fail status of shell with spawn", () => {
    const xrun = new XRun({ foo: `~(spawn)$node -e "process.exit(1)"` });
    const exeEvents = ["lookup", "shell"];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    let doneItem = 0;
    xrun.on("done-item", _data => doneItem++);

    return verify()
      .expectError.callbackStep(next => xrun.run("foo", next))
      .step(err => {
        expect(err.message).toBe(`cmd "node -e "process.exit(1)"" exit code 1`);
        expect(doneItem).toBe(1);
      });
  });

  it("should handle fail status of shell with spawn sync", () => {
    const xrun = new XRun({ foo: `~(spawn,sync)$node -e "process.exit(1)"` });
    const exeEvents = ["lookup", "shell"];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    let doneItem = 0;
    xrun.on("done-item", _data => doneItem++);

    return verify()
      .expectError.callbackStep(next => xrun.run("foo", next))
      .step(err => {
        expect(err.message).toBe(`cmd "node -e "process.exit(1)"" exit code 1`);
        expect(doneItem).toBe(1);
      });
  });

  it("should handle error of shell with spawn sync", () => {
    const xrun = new XRun({
      foo: {
        options: { timeout: 10 },
        task: `~(spawn,sync)$sleep 1`
      }
    });
    const exeEvents = ["lookup", "shell"];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    let doneItem = 0;
    xrun.on("done-item", _data => doneItem++);

    return verify()
      .expectError.callbackStep(next => xrun.run("foo", next))
      .step(err => {
        expect(err.message).toContain(`ETIMEDOUT`);
        expect(doneItem).toBe(1);
      });
  });

  // Skip on macOS in sandboxed environments where process.kill may fail with EPERM
  it.skipIf(process.platform === "darwin" && !process.stdout.isTTY)("should kill task exec child and stop", () => {
    const xrun = new XRun();
    xrun.load({
      ".stop": () => xrun.stop(),
      "test-stop": xrun.concurrent(
        xrun.serial("~$echo abc", "~$sleep 1", "~$echo BAD IF YOU SEE THIS"),
        xrun.serial(() => xaa.delay(100), ".stop", "~$echo BAD IF YOU SEE THIS ALSO")
      )
    });

    const intercept = xstdout.intercept(true);

    return verify({ cleanup: () => intercept.restore() })
      .callbackStep(next => {
        xrun.run("test-stop", next);
      })
      .step(() => {
        intercept.restore();
        expect(intercept.stdout.join()).not.toContain("BAD IF YOU SEE THIS");
      });
  });

  it("should kill task spawn child and stop", () => {
    const xrun = new XRun();
    xrun.load({
      "test-stop": xrun.concurrent(
        xrun.serial("~$echo abc", "~(spawn)$sleep 2", "~$echo BAD IF YOU SEE THIS"),
        xrun.serial(() => xaa.delay(100), xrun.stop(), "~$echo BAD IF YOU SEE THIS ALSO")
      )
    });

    const intercept = xstdout.intercept(true);

    return verify({ cleanup: () => intercept.restore() })
      .callbackStep(next => {
        xrun.run("test-stop", next);
      })
      .step(() => {
        intercept.restore();
        expect(intercept.stdout.join()).not.toContain("BAD IF YOU SEE THIS");
      });
  });

  // Skip on macOS in sandboxed environments where process.kill may fail with EPERM
  it.skipIf(process.platform === "darwin" && !process.stdout.isTTY)("should kill task child from a function and stop", () => {
    const xrun = new XRun();
    xrun.load({
      ".stop": () => xrun.stop(),
      "test-stop": xrun.concurrent(
        xrun.serial("~$echo abc", () => xsh.exec("sleep 2"), "~$echo BAD IF YOU SEE THIS"),
        xrun.serial(() => xaa.delay(100), ".stop", "~$echo BAD IF YOU SEE THIS ALSO")
      )
    });

    const intercept = xstdout.intercept(true);

    return verify({ cleanup: () => intercept.restore() })
      .callbackStep(next => {
        xrun.run("test-stop", next);
      })
      .step(() => {
        intercept.restore();
        expect(intercept.stdout.join()).not.toContain("BAD IF YOU SEE THIS");
      });
  });

  it("should handle error of shell command malformed", () => {
    const xrun = new XRun({
      foo: {
        options: { timeout: 10 },
        task: `~(spawn,syncsleep 1`
      }
    });
    const exeEvents = ["lookup", "shell"];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    let doneItem = 0;
    xrun.on("done-item", _data => doneItem++);

    return verify()
      .expectError.callbackStep(next => xrun.run("foo", next))
      .step(err => {
        expect(err.message).toContain(`Missing )$ in shell task: ~(spawn,syncsleep 1`);
        expect(doneItem).toBe(0);
      });
  });

  it("should handle error from task shell", () => {
    const xrun = new XRun({
      foo: {
        task: "exit 1"
      }
    });
    const exeEvents = ["lookup", "shell"];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    let doneItem = 0;
    xrun.on("done-item", _data => doneItem++);

    return verify()
      .expectError.callbackStep(next => xrun.run("foo", next))
      .step(err => {
        expect(err.message).toBe("shell cmd 'exit 1' exit code 1");
        expect(doneItem).toBe(1);
      });
  });

  it("should execute serial tasks", () => {
    let foo = 0;
    const xrun = new XRun({
      foo: [() => foo++, [".", "a", "b", "c"]],
      a: cb => process.nextTick(cb),
      b: cb => process.nextTick(cb),
      c: cb => process.nextTick(cb)
    });
    const exeEvents = [
      "lookup",
      "serial-arr",
      "function",
      "serial-arr",
      "lookup",
      "function",
      "lookup",
      "function",
      "lookup",
      "function"
    ];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    let doneItem = 0;
    xrun.on("done-item", () => doneItem++);

    return verify()
      .callbackStep(next => xrun.run("foo", next))
      .step(() => {
        expect(doneItem).toBe(6);
        expect(foo).toBe(1);
      });
  });

  it("should count tasks", () => {
    const xrun = new XRun();
    expect(xrun.countTasks()).toBe(0);
    xrun.load({ foo: () => undefined });
    expect(xrun.countTasks()).toBe(1);
    xrun.load("1", { foo: () => undefined, bar: () => undefined });
    expect(xrun.countTasks()).toBe(3);
  });

  it("should handle top serial tasks with first dot", () => {
    let foo = 0;
    const xrun = new XRun({
      foo: [".", () => foo++, [".", "a", "b", "c"]],
      a: cb => process.nextTick(cb),
      b: cb => process.nextTick(cb),
      c: cb => process.nextTick(cb)
    });
    const exeEvents = [
      "lookup",
      "serial-arr",
      "function",
      "serial-arr",
      "lookup",
      "function",
      "lookup",
      "function",
      "lookup",
      "function"
    ];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    let doneItem = 0;
    xrun.on("done-item", () => doneItem++);

    return verify()
      .callbackStep(next => xrun.run("foo", next))
      .step(() => {
        expect(doneItem).toBe(6);
        expect(foo).toBe(1);
      });
  });

  it("should execute concurrent tasks", () => {
    let foo = 0,
      foo2 = 0;
    const xrun = new XRun({
      foo: [() => foo++, ["a", "b", () => foo2++, "c"]],
      a: cb => process.nextTick(cb),
      b: cb => process.nextTick(cb),
      c: cb => process.nextTick(cb)
    });
    const exeEvents = [
      "lookup",
      "serial-arr",
      "function",
      "concurrent-arr",
      "lookup",
      "lookup",
      "lookup",
      "function",
      "function",
      "function",
      "function"
    ];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    let doneItem = 0;
    xrun.on("done-item", () => doneItem++);

    return verify()
      .callbackStep(next => xrun.run("foo", next))
      .step(() => {
        expect(doneItem).toBe(7);
        expect(foo).toBe(1);
        expect(foo2).toBe(1);
      });
  });

  it("should run a user array concurrently", () => {
    let foo = 0,
      foo2 = 0,
      fooX = 0;
    const xrun = new XRun({
      foo: [() => foo++, ["a", "b", () => foo2++, "c"]],
      fooX: cb => {
        fooX++;
        process.nextTick(cb);
      },
      a: cb => process.nextTick(cb),
      b: cb => process.nextTick(cb),
      c: cb => process.nextTick(cb)
    });
    const exeEvents = [
      "concurrent-arr",
      "lookup",
      "lookup",
      "serial-arr",
      "function",
      "function",
      "concurrent-arr",
      "lookup",
      "lookup",
      "lookup",
      "function",
      "function",
      "function",
      "function"
    ];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    let doneItem = 0;
    xrun.on("done-item", () => doneItem++);

    return verify()
      .callbackStep(next => xrun.run(["foo", "fooX"], next))
      .step(() => {
        expect(doneItem).toBe(9);
        expect(foo).toBe(1);
        expect(foo2).toBe(1);
        expect(fooX).toBe(1);
      });
  });

  it("should return all errors from concurrent tasks", () => {
    let foo = 0,
      foo2 = 0;
    const xrun = new XRun({
      foo: [() => foo++, ["a", "b", () => foo2++, "c"]],
      a: _cb => {
        throw new Error("a failed");
      },
      b: cb => setTimeout(() => process.nextTick(cb), 20),
      c: _cb => {
        throw new Error("c failed");
      }
    });
    const exeEvents = [
      "lookup",
      "serial-arr",
      "function",
      "concurrent-arr",
      "lookup",
      "lookup",
      "lookup",
      "function",
      "function",
      "function",
      "function"
    ];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    let doneItem = 0;
    xrun.on("done-item", () => doneItem++);

    return verify()
      .expectError.callbackStep(next => xrun.run("foo", next))
      .step(err => {
        expect(err.more).toEqual(expect.anything());
        expect(err.more.length).toBe(1);
        expect(err.message).toBe("a failed");
        expect(err.more[0].message).toBe("c failed");
        expect(doneItem).toBe(7);
        expect(foo).toBe(1);
        expect(foo2).toBe(1);
      })
      .callbackStep(next => xrun.waitAllPending(next))
      .step(() => {
        expect(doneItem).toBe(7);
      });
  });

  it("should execute a dep function directly", () => {
    let foo = 0,
      dep = 0;
    const xrun = new XRun({
      foo: {
        dep: () => dep++,
        task: () => foo++
      }
    });
    const exeEvents = ["lookup", "function", "function"];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    let doneItem = 0;
    xrun.on("done-item", () => doneItem++);

    return verify()
      .callbackStep(next => xrun.run("foo", next))
      .step(() => {
        expect(doneItem).toBe(2);
        expect(dep).toBe(1);
        expect(foo).toBe(1);
      });
  });

  it("should execute a dep as serial array", () => {
    let foo = 0,
      foo2 = 0;
    const xrun = new XRun({
      foo: {
        dep: ["foo2"],
        task: () => foo++
      },
      foo2: () => foo2++
    });
    const exeEvents = ["lookup", "serial-arr", "lookup", "function", "function"];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    return verify()
      .callbackStep(next => xrun.run("foo", next))
      .step(() => {
        expect(foo).toBe(1);
        expect(foo2).toBe(1);
      });
  });

  it("should parse and execute array in a string", () => {
    let foo2 = 0,
      foo3 = 0;
    const xrun = new XRun({
      foo: {
        dep: "~[foo2]",
        task: "~[fooX, [foo2, fooX]]"
      },
      fooX: "~[fooY]",
      fooY: () => "~[foo2, foo3]",
      foo2: () => foo2++,
      foo3: () => foo3++
    });
    const exeEvents = [
      "lookup",
      "serial-arr",
      "lookup",
      "function",
      "serial-arr",
      "lookup",
      "serial-arr",
      "lookup",
      "function",
      "concurrent-arr",
      "lookup",
      "lookup",
      "function",
      "function",
      "concurrent-arr",
      "lookup",
      "lookup",
      "function",
      "serial-arr",
      "lookup",
      "function",
      "concurrent-arr",
      "lookup",
      "lookup",
      "function",
      "function"
    ];
    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    return verify()
      .callbackStep(next => xrun.run("foo", next))
      .step(() => {
        expect(foo2).toBe(4);
        expect(foo3).toBe(2);
      });
  });

  it("should execute a dep as serial and then concurrent array", () => {
    let foo = 0,
      foo2 = 0;
    const xrun = new XRun({
      foo: {
        dep: [["foo2"]],
        task: () => foo++
      },
      foo2: () => foo2++
    });
    const exeEvents = ["lookup", "serial-arr", "concurrent-arr", "lookup", "function", "function"];

    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    return verify()
      .callbackStep(next => xrun.run("foo", next))
      .step(() => {
        expect(foo).toBe(1);
        expect(foo2).toBe(1);
      });
  });

  it("should await a promise a task function returned", () => {
    let foo2 = 0;
    const xrun = new XRun({
      foo: () => new Promise(resolve => setTimeout(() => resolve("foo2"), 10)),
      foo2: () => foo2++
    });

    const exeEvents = ["lookup", "function", "lookup", "function"];
    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    return verify()
      .callbackStep(next => xrun.run("foo", next))
      .step(() => {
        expect(foo2).toBe(1);
      });
  });

  it("should supply context as this to task function", () => {
    let foo = 0,
      foo3 = 0;
    const xrun = new XRun();
    xrun.load({
      foo2: {
        dep: "set a=0",
        task: ["foo3"]
      },
      foo3: [
        "~$set b=0",
        function() {
          this.run([".", "foo4", () => foo3++], _err => foo++);
        }
      ],
      foo4: "set c=0"
    });
    const exeEvents = [
      "lookup",
      "shell",
      "serial-arr",
      "lookup",
      "serial-arr",
      "shell",
      "function",
      "serial-arr",
      "lookup",
      "shell",
      "function"
    ];
    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    return verify()
      .callbackStep(next => xrun.run("foo2", next))
      .step(() => {
        expect(foo).toBe(1);
        expect(foo3).toBe(1);
      });
  });

  it("should ignore value returned by task function that's not string/function/array", () => {
    let foo;

    const xrun = new XRun({
      foo: () => (foo = 999)
    });

    // const events = [];

    const exeEvents = ["lookup", "function"];
    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    return verify()
      .callbackStep(next => xrun.run("foo", next))
      .step(() => {
        expect(foo).toBe(999);
      });
  });

  it("should handle error from event handler", () => {
    const xrun = new XRun({
      foo: () => undefined
    });
    xrun.on("execute", _data => {
      throw new Error("test");
    });
    return verify().expectError.callbackStep(next => xrun.run("foo", next));
  });

  it("should support load tasks", () => {
    const xrun = new XRun();
    xrun.load("1", {
      foo: () => {
        throw new Error("test");
      }
    });
    return verify().expectErrorToBe("test").callbackStep(next => xrun.run("1/foo", next));
  });

  it("should handle direct error from exe a function task", () => {
    const xrun = new XRun({
      foo: () => {
        throw new Error("test");
      }
    });
    return verify().expectErrorToBe("test").callbackStep(next => xrun.run("foo", next));
  });

  it("should exit on error", () => {
    const intercept = xstdout.intercept(true);
    let testStatus;
    const ox = process.exit;

    const exited = verify.signal(500);

    process.exit = status => {
      testStatus = status;
      exited.resolve();
    };

    const xrun = new XRun({
      foo: () => {
        throw new Error("test");
      }
    });

    return verify({ signals: { exited }, cleanup: () => intercept.restore() })
      .step(() => xrun.run("foo"))
      // wait for xrun to execute foo, catch the error, and then try to exit
      .awaiting(exited)
      .step(() => {
        // restore process.exit
        process.exit = ox;
        intercept.restore();
        expect(intercept.stdout.join()).toContain("Execution Failed - Errors:");
        expect(testStatus).toBe(1);
      });
  });

  it("should not exit on error if stopOnError is false", () => {
    const intercept = xstdout.intercept(true);
    let testStatus = "test";
    const ox = process.exit;

    process.exit = () => {
      testStatus = "called";
    };
    const ranFoo = verify.signal(500);
    const xrun = new XRun({
      foo: () => {
        ranFoo.resolve();
        throw new Error("test");
      }
    });
    xrun.stopOnError = false;

    return verify({ signals: { ranFoo }, cleanup: () => intercept.restore() })
      .step(() => xrun.run("foo"))
      .awaiting(ranFoo)
      .step(() => xaa.delay(10))
      .step(() => {
        process.exit = ox;
        intercept.restore();
        expect(intercept.stdout.join()).toContain("Execution Failed - Errors:");
        expect(testStatus).toBe("test");
      });
  });

  it("_exitOnError should do nothing for no error", () => {
    const ox = process.exit;
    let testStatus = "test";
    process.exit = () => {
      testStatus = "called";
    };
    const xrun = new XRun();
    xrun._exitOnError();
    process.exit = ox;
    expect(testStatus).toBe("test");
  });

  it("should fail for object task with unknown value type", () => {
    const xrun = new XRun({
      foo: ["foo2"],
      foo2: {
        desc: "foo2",
        task: true
      }
    });
    return verify()
      .expectError.callbackStep(next => xrun.run("foo", next))
      .step(err => {
        expect(err.message).toBe("Task foo2 has unrecognize task value type Boolean");
      });
  });

  it("should fail for task with unknown value type", () => {
    const xrun = new XRun({
      foo: [true]
    });
    return verify()
      .expectError.callbackStep(next => xrun.run("foo", next))
      .step(err => {
        expect(err.message).toBe(
          "Unable to process task foo.S because value type Boolean is unknown and no value.item"
        );
      });
  });

  it("should not fail if optional task name is not found", () => {
    const xrun = new XRun({});
    return verify().callbackStep(next => xrun.run("?foo", next));
  });

  it("should fail if task name is not found", () => {
    const xrun = new XRun({});
    return verify().expectErrorToBe("Task foo not found").callbackStep(next => xrun.run("foo", next));
  });

  it("should show similar tasks if not found", () => {
    const xrun = new XRun({
      ".foo": "",
      foo1: "",
      foo2: "",
      blah: "",
      test1: "",
      test2: "",
      test3: "",
      hello: "",
      moo: "",
      foo3: "",
      xoo: ""
    });
    const intercept = xstdout.intercept(true);

    return verify({ cleanup: () => intercept.restore() }).callbackStep(next => {
      xrun.exit = _code => {
        intercept.restore();
        const stdout = intercept.stdout.map(l => stripAnsi(l));
        expect(stdout[2].trim()).toBe("Maybe try: foo1, foo2, foo3, moo, xoo");
        next();
      };
      xrun.run("foox");
    });
  });

  it("should fail if namespace is not found", () => {
    const xrun = new XRun({});
    return verify()
      .expectErrorToBe("No task namespace foo exist")
      .callbackStep(next => xrun.run("foo/bar", next));
  });

  it("should fail if task name is empty", () => {
    const xrun = new XRun({});
    return verify()
      .expectError.callbackStep(next => xrun.run("", next))
      .step(err => {
        expect(err[0].message).toContain(`xqitem must have a name`);
      });
  });

  it("should fail if task is not in namespace", () => {
    const xrun = new XRun("foo", {
      test: () => undefined
    });
    return verify()
      .expectErrorToBe("Task bar in namespace foo not found")
      .callbackStep(next => xrun.run("foo/bar", next));
  });

  it("should fail if task is not in default namespace", () => {
    const xrun = new XRun({
      test: () => undefined
    });
    return verify()
      .expectErrorToBe("Task bar in namespace / not found")
      .callbackStep(next => xrun.run("/bar", next));
  });

  describe("stopOnError", function() {
    it("should throw if value is invalid", () => {
      const xrun = new XRun();
      expect(() => (xrun.stopOnError = "blah")).toThrow("stopOnError must be");
    });

    it("should allow to set one of the string values", () => {
      const xrun = new XRun();
      xrun.stopOnError = "full";
      expect(xrun.stopOnError).toBe("full");
    });

    it("should watch for failure when stopOnError is full with callback task", () => {
      let task1Called = false;
      let task2Called = false;
      const xrun = new XRun({
        task1(done) {
          task1Called = true;
          setTimeout(() => {
            done(new Error("task1 failed"));
          }, 10);
        },
        task2(done) {
          task2Called = true;
          setTimeout(() => {
            done();
          }, 100);
        }
      });
      xrun.stopOnError = "full";

      return verify()
        .expectError.callbackStep(next => xrun.run(["task1", "task2"], next))
        .step(err => {
          expect(task1Called).toBe(true);
          expect(err.message).toContain("task1 failed");
        });
    });

    it("should watch for failure when stopOnError is full with promise task", () => {
      let task1Called = false;
      let task2Called = false;
      const xrun = new XRun({
        task1() {
          task1Called = true;
          return new Promise((resolve, reject) => {
            setTimeout(() => {
              reject(new Error("task1 failed"));
            }, 50);
          });
        },
        task2() {
          task2Called = true;
          // Return a promise that takes longer than task1 to resolve
          return new Promise(resolve => {
            setTimeout(() => {
              resolve();
            }, 200);
          });
        }
      });
      xrun.stopOnError = "full";

      // Run tasks concurrently so task2's promise is active when task1 fails
      return verify()
        .expectError.callbackStep(next => xrun.run([["task1", "task2"]], next))
        .step(err => {
          expect(task1Called).toBe(true);
          expect(task2Called).toBe(true);
          expect(err.message).toContain("task1 failed");
          // task2's promise should be cancelled due to stopOnError full
        });
    });
  });

  describe("_exitOnError", function() {
    let intercept;
    const xrun = new XRun();
    xrun.stopOnError = false;
    let saveLevel;
    beforeEach(() => {
      saveLevel = chalk.level;
      chalk.level = 0;
      intercept = xstdout.intercept(true);
    });

    afterEach(() => {
      chalk.level = saveLevel;
      intercept.restore();
    });

    it("should log err if it has no stack", () => {
      xrun._exitOnError("blah test");
      intercept.restore();
      expect(intercept.stdout.length).toBe(2);
      expect(intercept.stdout[1]).toBe(" 1  blah test\n");
    });

    it("should not log stack for AssertionError", () => {
      let err;
      try {
        assert(false, "blah test");
      } catch (e) {
        err = e;
      }
      xrun._exitOnError([err]);
      intercept.restore();
      expect(intercept.stdout.length).toBe(2);
    });

    it("should not log stack if it's empty", () => {
      const err = {
        stack: "hello",
        message: "hello"
      };
      xrun._exitOnError([err]);
      intercept.restore();
      expect(intercept.stdout.length).toBe(2);
    });

    it("should not log stack if it's shell exec failed", () => {
      const err = {
        stack: "hello\n  at ..../xsh/lib/exec.js:9:9",
        message: "hello"
      };
      xrun._exitOnError([err]);
      intercept.restore();
      expect(intercept.stdout.length).toBe(2);
    });

    it("should handle err as non-array", () => {
      xrun._exitOnError(new Error("test 1"));
      intercept.restore();
      expect(intercept.stdout.length).toBeGreaterThan(2);
      expect(intercept.stdout[1]).toContain("1  test 1");
      expect(intercept.stdout[2]).toContain(" at ");
    });
  });

  it("getNamespaces should return namespaces in order of overrides", () => {
    const xrun = new XRun("test", {
      foo: () => undefined
    });
    xrun.load("blah", {});
    xrun.load({ namespace: "foo", overrides: "blah" }, {});
    xrun.load({ namespace: "blah", overrides: "hello" }, {});
    xrun.load("hello", {});
    expect(xrun.getNamespaces()).toStrictEqual(["/", "foo", "blah", "test", "hello"]);
  });

  it("should cancel and kill a shell exec on error", () => {
    const ranFnErr = verify.signal(500);
    const tasks = {
      sh: "sleep 1; echo sh output",
      fnErr: () => {
        ranFnErr.resolve();
        throw new Error("error");
      }
    };

    const xrun = new XRun(tasks);
    const intercept = xstdout.intercept(true);
    return verify({ signals: { ranFnErr }, cleanup: () => intercept.restore() })
      .expectError.callbackStep(next => xrun.run(["sh", "fnErr"], next))
      .awaiting(ranFnErr)
      .step(() => xaa.delay(100))
      .step(() => {
        intercept.restore();
        expect(intercept.stdout).toStrictEqual([]);
      });
  });

  const timeoutFoo = x => {
    return new Promise(resolve => {
      setTimeout(resolve, x);
    });
  };

  const testAsync = tasks => {
    const xrun = new XRun(tasks);

    const exeEvents = ["lookup", "function", "lookup", "function"];
    xrun.on("execute", data => {
      expect(data.type).toBe(exeEvents[0]);
      exeEvents.shift();
    });

    let cfoo2 = -1;
    setTimeout(() => (cfoo2 = tasks.foo2Value), 10);

    const start = Date.now();
    return verify()
      .callbackStep(next => xrun.run("foo", next))
      .step(() => {
        const end = Date.now();
        expect(end - start).toBeGreaterThan(28);
        expect(cfoo2).toBe(0);
        expect(tasks.foo2Value).toBe(1);
      });
  };

  it("should handle async function", () => {
    const tasks = {
      foo2Value: 0,
      foo: async () => {
        await timeoutFoo(30);
        return "foo2";
      },
      foo2: () => tasks.foo2Value++
    };
    return testAsync(tasks);
  });

  it("should handle async task function", () => {
    const tasks = {
      foo2Value: 0,
      foo: {
        task: async () => {
          await timeoutFoo(30);
          return "foo2";
        }
      },
      foo2: () => tasks.foo2Value++
    };
    return testAsync(tasks);
  });

  const drainIt = munchy => {
    const data = [];
    const drain = new PassThrough();
    drain.on("data", x => {
      data.push(x);
    });
    munchy.pipe(drain);
    return { data, drain };
  };

  it("should handle function returning stream", () => {
    const tasks = {
      foo2Value: 0,
      foo: {
        task: () => {
          const m = new Munchy({}, "hello, world");
          setTimeout(() => {
            m.munch(null);
            tasks.foo2Value++;
            drainIt(m);
          }, 30);

          return m;
        }
      }
    };

    return testAsync(tasks);
  });

  it("should handle function returning stream that fail", () => {
    const tasks = {
      foo2Value: 0,
      foo: {
        task: () => {
          const m = new Munchy({}, "hello, world");
          setTimeout(() => {
            tasks.foo2Value++;
            m.emit("error", new Error("test oops"));
          }, 30);
          return m;
        }
      }
    };

    return verify()
      .expectError.step(() => testAsync(tasks))
      .step(err => {
        expect(err.message).toContain("test oops");
      });
  });

  it("should handle promise rejection with SIGTERM child process", () => {
    const xrun = new XRun({
      foo: () => {
        // Create a child process that will be terminated
        const child = childProc.spawn("sleep", ["10"]);
        // Create a promise that will reject with SIGTERM-like error
        const promise = new Promise((resolve, reject) => {
          child.on("exit", (code, signal) => {
            if (signal === "SIGTERM") {
              // Create error with code === null to match _isChildSigTerm condition
              const err = new Error("Process terminated");
              err.code = null;
              // Set signalCode on child for _isChildSigTerm check
              child.signalCode = "SIGTERM";
              reject(err);
            } else {
              reject(new Error(`Process exited with code ${code}`));
            }
          });
        });
        // Return promise with child attached
        promise.child = child;
        // Terminate the child after a short delay
        setTimeout(() => {
          child.kill("SIGTERM");
        }, 50);
        return promise;
      }
    });

    let doneItem = 0;
    xrun.on("done-item", _data => doneItem++);

    return verify()
      .callbackStep(next => xrun.run("foo", next))
      .step(() => {
        // Should complete without error (SIGTERM treated as normal exit)
        expect(doneItem).toBeGreaterThan(0);
      });
  });
  //
  // exit() kills tracked children before leaving, so a stopped run does not orphan the
  // processes it spawned. The delay gives the kill time to land (taskkill on Windows).
  //
  describe("exit with tracked children", () => {
    it("should kill tracked children then exit", async () => {
      const x = new XRun({});
      const origExit = process.exit;
      const exited = [];
      const killed = [];
      process.exit = code => exited.push(code);
      x.killChildProcess = child => killed.push(child);

      try {
        x.stopOnError = "full";
        x._taskChildren[Symbol("child")] = { pid: 4242 };

        x.exit(7);
        expect(exited, "must not exit before the children are dealt with").toStrictEqual([]);

        await new Promise(resolve => setTimeout(resolve, 250));

        expect(killed.map(c => c.pid)).toStrictEqual([4242]);
        expect(exited).toStrictEqual([7]);
      } finally {
        process.exit = origExit;
      }
    });

    it("should exit immediately when there are no children", () => {
      const x = new XRun({});
      const origExit = process.exit;
      const exited = [];
      process.exit = code => exited.push(code);

      try {
        x.stopOnError = "full";
        x.exit(3);
        expect(exited).toStrictEqual([3]);
      } finally {
        process.exit = origExit;
      }
    });
  });
});
