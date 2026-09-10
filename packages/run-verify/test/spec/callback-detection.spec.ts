import { describe, it, expect } from "vitest";
import { asyncVerify, withCallback } from "../../src/index.js";

/**
 * The runner decides how a step completes by reading its parameters, which it
 * recovers from `Function.prototype.toString()`. These cover every form a step
 * can take, so the parser's behavior is pinned rather than incidental.
 *
 * The contract:
 *
 * - A zero-parameter step is called with no arguments and its return value
 *   forwards, whichever syntax declared it.
 * - A one-parameter step whose name starts with `next`, `cb`, `callback` or
 *   `done` receives only that callback and completes through it.
 * - Any other one-parameter step receives the previous value.
 * - Nothing in a function's *body* may change that decision. In particular an
 *   arrow inside the body is not part of the parameter list.
 */

const run = (step: unknown) => asyncVerify(() => "PREV", step as () => unknown);

describe("zero-parameter steps forward their return value", () => {
  it("arrow", async () => {
    expect(await run(() => "ok")).toBe("ok");
  });

  it("async arrow", async () => {
    expect(await run(async () => "ok")).toBe("ok");
  });

  it("async function expression", async () => {
    expect(
      await run(async function () {
        return "ok";
      })
    ).toBe("ok");
  });

  it("anonymous function expression", async () => {
    expect(
      await run(function () {
        return "ok";
      })
    ).toBe("ok");
  });

  it("named function expression", async () => {
    expect(
      await run(function named() {
        return "ok";
      })
    ).toBe("ok");
  });

  it("method shorthand", async () => {
    const obj = {
      m() {
        return "ok";
      }
    };
    expect(await run(obj.m)).toBe("ok");
  });

  it("function expression with an arrow in its body", async () => {
    expect(
      await run(function () {
        return [1].map(x => x) && "ok";
      })
    ).toBe("ok");
  });

  it("is called with no arguments at all", async () => {
    let argCount = -1;
    await run(function () {
      // eslint-disable-next-line prefer-rest-params
      argCount = arguments.length;
    });
    expect(argCount).toBe(0);
  });
});

describe("one-parameter steps that are not callback-named receive the value", () => {
  it("arrow", async () => {
    expect(await run((v: string) => v + "!")).toBe("PREV!");
  });

  it("function expression", async () => {
    expect(
      await run(function (v: string) {
        return v + "!";
      })
    ).toBe("PREV!");
  });

  it("function expression with an arrow in its body", async () => {
    expect(
      await run(function (v: string) {
        return [1].map(x => x) && v + "!";
      })
    ).toBe("PREV!");
  });

  it("destructured parameter", async () => {
    const step = ({ id }: { id: string }) => id;
    expect(await asyncVerify(() => ({ id: "a" }), step)).toBe("a");
  });
});

describe("one-parameter callback-named steps receive only the callback", () => {
  it("bare arrow parameter", async () => {
    expect(await run((next: any) => next(null, "ok"))).toBe("ok");
  });

  it("parenthesized arrow parameter", async () => {
    expect(await run((next: any) => next(null, "ok"))).toBe("ok");
  });

  it("arrow whose body also contains an arrow", async () => {
    expect(
      await run((next: any) => {
        Promise.resolve().then(() => next(null, "ok"));
      })
    ).toBe("ok");
  });

  it("function expression", async () => {
    expect(
      await run(function (next: any) {
        next(null, "ok");
      })
    ).toBe("ok");
  });

  it.each(["next", "cb", "callback", "done"])("recognizes the name %s", async name => {
    // built so the parameter name is exactly `name`, with no body arrow
    const step = new Function(name, `${name}(null, "ok");`) as (...a: any[]) => any;
    expect(await run(step)).toBe("ok");
  });

  it("does not receive the previous value", async () => {
    let argCount = -1;
    let firstArgType = "";
    await run(function (next: any) {
      // eslint-disable-next-line prefer-rest-params
      argCount = arguments.length;
      firstArgType = typeof next;
      next(null, "ok");
    });
    expect(argCount).toBe(1);
    expect(firstArgType).toBe("function");
  });
});

describe("a body arrow does not change the parameter decision", () => {
  // Each step declares a callback-named parameter and contains an arrow in its
  // body BEFORE using it. The arrow is not part of the parameter list, so these
  // must still be callback steps. Each guards the call, so a misread shows up
  // as a wrong resolved value rather than an async throw with no owner.
  it("function (next)", async () => {
    expect(
      await run(function (next: any) {
        const send = () => (typeof next === "function" ? next(null, "ok") : undefined);
        send();
      })
    ).toBe("ok");
  });

  it("function (cb)", async () => {
    expect(
      await run(function (cb: any) {
        const send = () => (typeof cb === "function" ? cb(null, "ok") : undefined);
        send();
      })
    ).toBe("ok");
  });

  it("function (callback)", async () => {
    expect(
      await run(function (callback: any) {
        const send = () => (typeof callback === "function" ? callback(null, "ok") : undefined);
        send();
      })
    ).toBe("ok");
  });

  it("function (done)", async () => {
    expect(
      await run(function (done: any) {
        const send = () => (typeof done === "function" ? done(null, "ok") : undefined);
        send();
      })
    ).toBe("ok");
  });

  it("passes the callback, not the previous value", async () => {
    let firstArgType = "";
    const result = await run(function (next: any) {
      firstArgType = typeof next;
      const send = () => (typeof next === "function" ? next(null, "ok") : undefined);
      send();
    });
    expect(firstArgType).toBe("function");
    expect(result).toBe("ok");
  });

  it("completes through a deferred callback call", async () => {
    const result = await run(function (next: any) {
      if (typeof next !== "function") return undefined;
      setTimeout(() => next(null, "ok"), 5);
      return undefined;
    });
    expect(result).toBe("ok");
  });
});

describe("withCallback overrides the parameter name check", () => {
  it("treats an unrecognized single parameter as a callback", async () => {
    const result = await run(withCallback((n: any) => n(null, "ok")));
    expect(result).toBe("ok");
  });
});

describe("an unparseable step still fails loudly", () => {
  it("rejects a step whose source has no parameter list", async () => {
    class NotAStep {}
    await expect(run(NotAStep as unknown as () => void)).rejects.toThrow(
      /unable to match arg name/
    );
  });
});
