import { describe, it, expect } from "vitest";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { verify, signal, asyncVerify, type Signal, type StepCallback } from "../../src/index.js";

// ---------------------------------------------------------------------------
// type-level assertions: a wrong inferred type fails the type-check, not a test
// ---------------------------------------------------------------------------
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// plain steps thread values with no annotations, across sync and async
type _threads = Expect<Equal<Awaited<ReturnType<typeof cThreads>>, number>>;
const cThreads = () =>
  verify({ timeout: 500 })
    .step(() => 2)
    .step(value => value * 3)
    .step(async value => `count=${value}`)
    .step(value => value.length);

// keep forwards the input whatever the step returns
type _keep = Expect<Equal<Awaited<ReturnType<typeof cKeep>>, { id: string }>>;
const cKeep = () =>
  verify()
    .step(() => ({ id: "a" }))
    .keep.step(record => assert.equal(record.id, "a"));

// expectError yields unknown, not Error
type _err = Expect<Equal<Awaited<ReturnType<typeof cErr>>, unknown>>;
const cErr = () =>
  verify().expectError.step(() => {
    throw new Error("boom");
  });

// callbackStep threads the callback's value type when given explicitly
type _cb = Expect<Equal<Awaited<ReturnType<typeof cCb>>, number>>;
const cCb = () =>
  verify()
    .step(() => 41)
    .callbackStep<number>((value: number, next: StepCallback<number>) => next(null, value + 1));

// without it, a callback step's output defaults to unknown, because the type
// only appears in the callback's parameter position and cannot be inferred
type _cbDefault = Expect<Equal<Awaited<ReturnType<typeof cCbDefault>>, unknown>>;
const cCbDefault = () =>
  verify()
    .step(() => 41)
    .callbackStep((value: number, next: StepCallback<unknown>) => next(null, value + 1));

// an unknown value is still fine to assert on, which is the common case
const cCbAssert = () =>
  verify()
    .callbackStep(next => next(null, "ok"))
    .step(value => {
      expect(value).toBe("ok");
    });
void cCbAssert;

// but using it structurally requires narrowing, which is the correct trade
const cCbNarrow = () =>
  verify()
    .callbackStep(next => next(null, "ok"))
    // @ts-expect-error - value is unknown; annotate the step or pass a type argument
    .step(value => value.length);
void cCbNarrow;

// one callbackStep, and BOTH arities are fully typed: a one-parameter step
// gets the callback, a two-parameter step gets the value and the callback
const cCbArity = () =>
  verify()
    .step(() => "seed")
    .callbackStep<number>(next => {
      const check: (err?: Error | null, value?: number) => void = next;
      check(null, 1);
    })
    .callbackStep<string>((input: number, next: StepCallback<string>) => {
      const n: number = input;
      next(null, `${n}`);
    });
void cCbArity;
type _cbArity = Expect<Equal<Awaited<ReturnType<typeof cCbArity>>, string>>;

// awaiting() takes its type from the named signal
type _await = Expect<Equal<Awaited<ReturnType<typeof cAwait>>, string>>;
const cAwait = () => {
  const saved = signal<{ id: string }>();
  return verify({ signals: { saved } })
    .step(() => "dropped")
    .awaiting("saved")
    .step(record => record.id);
};

// awaiting() also takes the signal itself, typed from the signal not the map
type _awaitObj = Expect<Equal<Awaited<ReturnType<typeof cAwaitObj>>, string>>;
const cAwaitObj = () => {
  const saved = signal<{ id: string }>();
  return verify({ signals: { saved } })
    .step(() => "dropped")
    .awaiting(saved)
    .step(record => record.id);
};

// verify.signal is the same helper, and a type still flows from it through the chain
type _awaitNs = Expect<Equal<Awaited<ReturnType<typeof cAwaitNs>>, number>>;
const cAwaitNs = () => {
  const ticked = verify.signal<{ n: number }>();
  return verify({ signals: { ticked } })
    .awaiting(ticked)
    .step(value => value.n);
};

// a mismatched step is a compile error
const cMismatch = () =>
  verify()
    .step(() => 2)
    // @ts-expect-error - the previous step produced a number, not a string
    .step((value: string) => value.toUpperCase());
void cMismatch;

// an unknown signal name is a compile error
const cBadSignal = () => {
  const saved = signal<number>();
  return (
    verify({ signals: { saved } })
      // @ts-expect-error - "nope" is not a key of config.signals
      .awaiting("nope")
  );
};
void cBadSignal;

// ---------------------------------------------------------------------------
// runtime
// ---------------------------------------------------------------------------
describe("verify chain", () => {
  it("threads values through one step primitive", async () => {
    expect(await cThreads()).toBe(7);
  });

  it("keeps the input when a step should not consume it", async () => {
    const result = await verify()
      .step(() => ({ id: "a" }))
      .keep.step(record => assert.equal(record.id, "a"))
      .step(record => record.id);
    expect(result).toBe("a");
  });

  it("forwards undefined from a plain step that returns nothing", async () => {
    const result = await verify()
      .step(() => ({ id: "a" }))
      .step(record => {
        assert.equal(record.id, "a");
      })
      .step(value => value);
    expect(result).toBeUndefined();
  });

  it("takes an error-first callback with callbackStep", async () => {
    expect(await cCb()).toBe(42);
  });

  it("resolves an async keep step only after it settles", async () => {
    const order: string[] = [];
    const result = await verify()
      .step(() => "value")
      .keep.step(async v => {
        await Promise.resolve();
        order.push(`checked ${v}`);
      })
      .step(v => {
        order.push(`after ${v}`);
        return v;
      });
    expect(result).toBe("value");
    expect(order).toEqual(["checked value", "after value"]);
  });

  it("flows an expected error onward", async () => {
    const boom = new Error("invalid record");
    const result = await verify({ timeout: 500 })
      .expectError.step(() => {
        throw boom;
      })
      .step(err => {
        assert.equal(err, boom);
        return "recovered";
      });
    expect(result).toBe("recovered");
  });

  it.each([
    ["throw", () => { throw new Error("boom"); }],
    ["reject", () => Promise.reject(new Error("boom"))]
  ])("satisfies expectError from a %s", async (_label, op) => {
    const result = await verify({ timeout: 500 })
      .expectError.step(op)
      .step(err => (err as Error).message);
    expect(result).toBe("boom");
  });

  it("satisfies expectError from a callback error, composing modifiers", async () => {
    const boom = new Error("cb failed");
    const result = await verify({ timeout: 500 })
      .step(() => 1)
      .expectError.callbackStep(next => next(boom))
      .step(err => err);
    expect(result).toBe(boom);
  });

  it("fails when a step required to fail succeeds", async () => {
    let reached = false;
    await expect(
      verify({ timeout: 500 })
        .expectError.step(() => "no throw")
        .step(() => {
          reached = true;
        })
    ).rejects.toThrow("expecting error");
    expect(reached).toBe(false);
  });

  it("treats a returned Error as success, so it fails an error expectation", async () => {
    await expect(
      verify({ timeout: 500 }).expectError.step(() => new Error("returned, not thrown"))
    ).rejects.toThrow("expecting error");
  });

  it("rejects with the original error and keeps its identity", async () => {
    const boom = new Error("assertion failed");
    await expect(
      verify()
        .step(() => 1)
        .step(() => {
          throw boom;
        })
    ).rejects.toBe(boom);
  });

  it("supports catch like a promise", async () => {
    const boom = new Error("nope");
    const caught = await verify()
      .step(() => {
        throw boom;
      })
      .catch(err => err);
    expect(caught).toBe(boom);
  });

  it("does not leak a modifier to the following step", async () => {
    const result = await verify()
      .step(() => 1)
      .keep.step(() => "discarded")
      .step(value => value + 1);
    expect(result).toBe(2);
  });

  it("runs config cleanup on the success path", async () => {
    const order: string[] = [];
    await verify({ cleanup: () => order.push("cleanup") }).step(() => order.push("step"));
    expect(order).toEqual(["step", "cleanup"]);
  });

  it("runs config cleanup on the failure path", async () => {
    const order: string[] = [];
    await expect(
      verify({ cleanup: [() => order.push("a"), () => order.push("b")] }).step(() => {
        throw new Error("nope");
      })
    ).rejects.toThrow("nope");
    expect(order.sort()).toEqual(["a", "b"]);
  });

  it("fails under the configured deadline when a callback never fires", async () => {
    await expect(
      verify({ timeout: 40 })
        .step(() => 1)
        .callbackStep(() => {
          /* never calls next */
        })
    ).rejects.toThrow(/timeout after 40ms/);
  });

  it("resolves an empty chain", async () => {
    expect(await verify()).toBeUndefined();
  });

  it("runs once even when awaited twice", async () => {
    let runs = 0;
    const chain = verify().step(() => {
      runs++;
      return "once";
    });
    expect(await chain).toBe("once");
    expect(await chain).toBe("once");
    expect(runs).toBe(1);
  });

  it("is immutable, so a prefix can be reused and branched", async () => {
    const base = verify({ timeout: 500 }).step(() => 10);
    const [a, b] = [await base.step(v => v + 1), await base.step(v => v * 2)];
    expect([a, b]).toEqual([11, 20]);
  });

  it("accepts a zero-parameter `function` step, which the positional API cannot", async () => {
    const result = await verify().step(function () {
      return "ok";
    });
    expect(result).toBe("ok");
  });

  it("accepts a callback step whose parameter is not a recognized name", async () => {
    const result = await verify()
      .step(() => 1)
      .callbackStep<string>((_v: number, n: StepCallback<string>) => n(null, "named-n"));
    expect(result).toBe("named-n");
  });
});

describe("verify signals", () => {
  const store = new (class extends EventEmitter {
    async save(id: string) {
      const record = { id };
      setImmediate(() => this.emit("saved", record));
      return record;
    }
  })();

  it("arranges, triggers, then waits", async () => {
    const saved = signal<{ id: string }>();
    const onSaved = (r: { id: string }) => saved.resolve(r);
    const result = await verify({
      timeout: 500,
      signals: { saved },
      cleanup: () => store.off("saved", onSaved)
    })
      .step(() => {
        store.once("saved", onSaved);
        return store.save("a");
      })
      .awaiting("saved")
      .step(record => record.id);
    expect(result).toBe("a");
    expect(store.listenerCount("saved")).toBe(0);
  });

  it("a registered signal is an obligation: the run waits for it", async () => {
    const late = signal<string>();
    setTimeout(() => late.resolve("arrived"), 20);
    const order: string[] = [];
    await verify({ timeout: 500, signals: { late } }).step(() => order.push("step"));
    expect(late.pending()).toBe(false);
    expect(order).toEqual(["step"]);
  });

  it("fails the run when a registered signal rejects", async () => {
    const bad = signal<string>();
    setTimeout(() => bad.reject(new Error("signal failed")), 10);
    await expect(
      verify({ timeout: 500, signals: { bad } }).step(() => "step")
    ).rejects.toThrow("signal failed");
  });

  it("fails under the deadline when a registered signal never settles", async () => {
    const never = signal<string>();
    await expect(
      verify({ timeout: 40, signals: { never } }).step(() => "step")
    ).rejects.toThrow(/timeout after 40ms/);
  });

  it("throws a clear error for an unknown signal name", () => {
    const saved = signal<string>();
    const chain = verify({ signals: { saved } });
    expect(() => (chain as any).awaiting("nope")).toThrow(/no such signal/);
  });

  it("waits for a signal passed by value, not by name", async () => {
    const saved = signal<{ id: string }>();
    const onSaved = (r: { id: string }) => saved.resolve(r);
    const result = await verify({
      timeout: 500,
      signals: { saved },
      cleanup: () => store.off("saved", onSaved)
    })
      .step(() => {
        store.once("saved", onSaved);
        return store.save("b");
      })
      .awaiting(saved)
      .step(record => record.id);
    expect(result).toBe("b");
  });

  it("accepts a per-wait deadline in the value form", async () => {
    const slow = signal<string>();
    await expect(
      verify({ timeout: 500, signals: { slow } }).awaiting(slow, 30)
    ).rejects.toThrow(/timeout after 30ms/);
  });

  it("rejects a signal that was never declared, since declaring is the obligation", () => {
    const declared = signal<string>();
    const stray = signal<string>();
    const chain = verify({ signals: { declared } });
    expect(() => chain.awaiting(stray)).toThrow(/not in config.signals/);
  });

  it("guards a repeat wait in the value form, and names the declared key", () => {
    const once = signal<string>();
    expect(() => verify({ signals: { once } }).awaiting(once).awaiting(once)).toThrow(
      /awaiting\("once"\) more than once/
    );
  });

  it("guards a repeat across the two forms, which are one wait", () => {
    const once = signal<string>();
    expect(() => verify({ signals: { once } }).awaiting("once").awaiting(once)).toThrow(
      /more than once/
    );
  });

  it("exposes signal under verify as the same function", async () => {
    expect(verify.signal).toBe(signal);
    const ticked = verify.signal<string>();
    setTimeout(() => ticked.resolve("tick"), 10);
    expect(await verify({ timeout: 500, signals: { ticked } }).awaiting(ticked)).toBe("tick");
  });

  it("interoperates with the positional API through signal.defer", async () => {
    const saved = signal<string>();
    const result = await asyncVerify(
      saved.defer,
      () => saved.resolve("from-positional"),
      saved.defer.wait(),
      (value: string) => value
    );
    expect(result).toBe("from-positional");
  });
});

// a value step's type threads like any other
type _value = Expect<Equal<Awaited<ReturnType<typeof cValue>>, number>>;
const cValue = () =>
  verify()
    .step(Promise.resolve("seeded"))
    .step(value => value.length);

// a plain value works too
type _plain = Expect<Equal<Awaited<ReturnType<typeof cPlain>>, number>>;
const cPlain = () => verify().step(41).step(value => value + 1);

describe("verify expected error messages", () => {
  it("expectErrorToBe requires the whole message to match", async () => {
    const result = await verify({ timeout: 500 })
      .expectErrorToBe("exact message")
      .step(() => {
        throw new Error("exact message");
      })
      .step(err => (err as Error).message);
    expect(result).toBe("exact message");
  });

  it("expectErrorToBe fails when the message differs", async () => {
    await expect(
      verify({ timeout: 500 })
        .expectErrorToBe("expected")
        .step(() => {
          throw new Error("something else");
        })
    ).rejects.toThrow(/message to be 'expected'/);
  });

  it("expectErrorHas requires the message to contain the text", async () => {
    const result = await verify({ timeout: 500 })
      .expectErrorHas("middle")
      .step(() => {
        throw new Error("start middle end");
      })
      .step(err => (err as Error).message);
    expect(result).toBe("start middle end");
  });

  it("expectErrorHas fails when the text is absent", async () => {
    await expect(
      verify({ timeout: 500 })
        .expectErrorHas("absent")
        .step(() => {
          throw new Error("nothing like it");
        })
    ).rejects.toThrow(/message has 'absent'/);
  });

  it("message modifiers can also require an error code", async () => {
    const error = Object.assign(new Error("start middle end"), { code: "E_TEST" });
    const result = await verify({ timeout: 500 })
      .expectErrorHas("middle", "E_TEST")
      .step(() => Promise.reject(error))
      .step(err => err);
    expect(result).toBe(error);

    await verify({ timeout: 500 })
      .expectErrorToBe("missing", 404)
      .step(() => Promise.reject(Object.assign(new Error("missing"), { code: 404 })));
  });

  it("message modifiers fail when the error code differs", async () => {
    await expect(
      verify({ timeout: 500 })
        .expectErrorHas("middle", "E_EXPECTED")
        .step(() => {
          throw Object.assign(new Error("start middle end"), { code: "E_ACTUAL" });
        })
    ).rejects.toThrow(/code to be 'E_EXPECTED'.*got 'E_ACTUAL'/);
  });

  it("still fails when the step succeeds", async () => {
    await expect(
      verify({ timeout: 500 })
        .expectErrorToBe("anything")
        .step(() => "no failure")
    ).rejects.toThrow("expecting error");
  });

  it("composes with a callback step, as a one-line test does", async () => {
    const boom = new Error("cb message");
    const result = await verify({ timeout: 500 })
      .expectErrorToBe("cb message")
      .callbackStep(next => next(boom))
      .step(err => err);
    expect(result).toBe(boom);
  });
});

// asyncStep resolves an array element-wise, keeping tuple types
type _all = Expect<Equal<Awaited<ReturnType<typeof cAll>>, [string, number]>>;
const cAll = () => verify().asyncStep([Promise.resolve("a"), Promise.resolve(1)] as const);

// and keeps them through a function that returns the array
type _allFn = Expect<Equal<Awaited<ReturnType<typeof cAllFn>>, [string, number]>>;
const cAllFn = () => verify().asyncStep(() => [Promise.resolve("a"), Promise.resolve(1)] as const);

describe("verify asyncStep", () => {
  it("resolves an array of promises element-wise", async () => {
    const result = await verify({ timeout: 500 })
      .asyncStep([Promise.resolve(1), Promise.resolve(2), Promise.resolve(3)])
      .step(values => values.reduce((a, b) => a + b, 0));
    expect(result).toBe(6);
  });

  it("leaves a plain array alone", async () => {
    const result = await verify()
      .asyncStep([1, 2, 3])
      .step(values => values.length);
    expect(result).toBe(3);
  });

  it("resolves a mixed array", async () => {
    const result = await verify({ timeout: 500 }).asyncStep([1, Promise.resolve(2), "three"]);
    expect(result).toEqual([1, 2, "three"]);
  });

  it("preserves a nested array rather than flattening it", async () => {
    const result = await verify().asyncStep([[1, 2], [3]]);
    expect(result).toEqual([[1, 2], [3]]);
  });

  it("resolves a single promise too", async () => {
    expect(await verify().asyncStep(Promise.resolve("one"))).toBe("one");
  });

  it("takes the first rejection under expectError", async () => {
    const boom = new Error("second failed");
    const result = await verify({ timeout: 500 })
      .expectError.asyncStep([Promise.resolve(1), Promise.reject(boom)])
      .step(err => err);
    expect(result).toBe(boom);
  });

  it("keeps the input when combined with keep", async () => {
    const result = await verify()
      .step(() => "INPUT")
      .keep.asyncStep([Promise.resolve("ignored")])
      .step(value => value);
    expect(result).toBe("INPUT");
  });

  it("calls a function and resolves the array it returns", async () => {
    const result = await verify({ timeout: 500 })
      .asyncStep(() => [Promise.resolve(1), Promise.resolve(2)])
      .step(values => values.reduce((a, b) => a + b, 0));
    expect(result).toBe(3);
  });

  it("awaits a promise a function returns", async () => {
    expect(await verify({ timeout: 500 }).asyncStep(() => Promise.resolve("one"))).toBe("one");
  });

  it("gives the function the previous value", async () => {
    const result = await verify({ timeout: 500 })
      .step(() => 2)
      .asyncStep(input => [Promise.resolve(input * 3)]);
    expect(result).toEqual([6]);
  });

  it("does not start a function's work until the step is reached", async () => {
    let started = 0;
    const chain = verify({ timeout: 500 })
      .step(() => "first")
      .asyncStep(() => [Promise.resolve(++started)]);
    expect(started).toBe(0);
    expect(await chain).toEqual([1]);
  });

  it("takes the first rejection from a function's array under expectError", async () => {
    const boom = new Error("from a function");
    const result = await verify({ timeout: 500 })
      .expectError.asyncStep(() => [Promise.resolve(1), Promise.reject(boom)])
      .step(err => err);
    expect(result).toBe(boom);
  });
});

describe("step does not guess an array's intention", () => {
  it("passes an array of promises through unresolved", async () => {
    // the array might be meant as a value, so .step() must not Promise.all it
    const promises = [Promise.resolve(1), Promise.resolve(2)];
    const result = await verify()
      .step(promises)
      .step(values => values.map(v => typeof (v as any).then));
    expect(result).toEqual(["function", "function"]);
  });

  it("so a race over them is still possible", async () => {
    const result = await verify({ timeout: 500 })
      .step([new Promise(r => setTimeout(() => r("slow"), 50)), Promise.resolve("fast")])
      .step(values => Promise.race(values));
    expect(result).toBe("fast");
  });

  it("passes an array a function returns through unresolved as well", async () => {
    // the intention is no clearer for a returned array, so .asyncStep() owns it
    const result = await verify()
      .step(() => [Promise.resolve(1), Promise.resolve(2)])
      .step(values => values.map(v => typeof v.then));
    expect(result).toEqual(["function", "function"]);
  });
});

describe("verify steps that are values, not functions", () => {
  it("adopts a promise as the step", async () => {
    const result = await verify({ timeout: 500 })
      .step(Promise.resolve("from a promise"))
      .step(value => value.toUpperCase());
    expect(result).toBe("FROM A PROMISE");
  });

  it("adopts a plain value as the step", async () => {
    expect(await verify().step(41).step(value => value + 1)).toBe(42);
  });

  it("takes a rejected promise under expectError", async () => {
    const boom = new Error("rejected directly");
    const result = await verify({ timeout: 500 })
      .expectError.step(Promise.reject(boom))
      .step(err => err);
    expect(result).toBe(boom);
  });

  it("fails an error expectation when the adopted value does not reject", async () => {
    await expect(
      verify({ timeout: 500 }).expectError.step(Promise.resolve("no failure"))
    ).rejects.toThrow("expecting error");
  });

  it("still calls a function step rather than adopting it", async () => {
    let called = false;
    const result = await verify()
      .step(() => {
        called = true;
        return "called";
      })
      .step(value => value);
    expect(called).toBe(true);
    expect(result).toBe("called");
  });

  it("forwards the input when keep is combined with an adopted value", async () => {
    const result = await verify()
      .step(() => "INPUT")
      .keep.step(Promise.resolve("ignored"))
      .step(value => value);
    expect(result).toBe("INPUT");
  });

  it("explains a value given to callbackStep", () => {
    // .step() adopts a value, but a callback step has to be a function, since
    // there must be something to receive the callback
    expect(() => verify().callbackStep(Promise.resolve(1) as any)).toThrow(
      /callbackStep\(\) needs a function/
    );
  });
});

describe("verify diagnostics and misuse", () => {
  it("points a library-generated error at the test, not at the chain internals", async () => {
    let stack = "";
    try {
      await verify({ timeout: 40 })
        .step(() => 1)
        .callbackStep(() => {
          /* never calls next, so the deadline fires */
        });
    } catch (err) {
      stack = String((err as Error).stack);
    }
    // the whole value of the runner's call-site capture is that the frames name
    // the test; a facade must not swallow that
    expect(stack).toMatch(/chain\.spec\.ts/);
  });

  it("callbackStep takes a function that declares only the callback", async () => {
    // the positional API's `next => ...` form, which is how essentially every
    // existing callback step is written. It must not receive the input instead.
    const result = await verify({ timeout: 200 })
      .step(() => "INPUT")
      .callbackStep<string>(next => next(null, "ok"));
    expect(result).toBe("ok");
  });

  it("callbackStep passes the input when two parameters are declared", async () => {
    const result = await verify({ timeout: 200 })
      .step(() => "INPUT")
      .callbackStep<string>((input: string, next: StepCallback<string>) => next(null, input + "/ok"));
    expect(result).toBe("INPUT/ok");
  });

  it("forwards the input when callbackStep and keep are combined", async () => {
    const result = await verify()
      .step(() => "INPUT")
      .keep.callbackStep((_value: string, next: StepCallback<string>) => next(null, "CALLBACK VALUE"));
    expect(result).toBe("INPUT");
  });

  it("rejects with a clear message when a prefix carrying signals is branched", async () => {
    const saved = signal<string>();
    const base = verify({ timeout: 200, signals: { saved } }).step(() => {
      saved.resolve("x");
      return 1;
    });

    expect(await base.awaiting("saved").step(v => v)).toBe("x");

    // the second run would reuse a one-shot defer. It must say so in the
    // chain's own vocabulary rather than leaking the positional API's.
    await expect(base.awaiting("saved").step(v => v)).rejects.toThrow(
      /signals.*already used|cannot be branched/i
    );
  });

  it("explains an awaiting() repeated on the same signal", () => {
    const saved = signal<string>();
    const chain = verify({ signals: { saved } }).step(() => 1);
    expect(() => chain.awaiting("saved").awaiting("saved")).toThrow(/awaiting/);
  });

  it("does not leak positional-API vocabulary in its misuse errors", () => {
    const saved = signal<string>();
    const chain = verify({ signals: { saved } }).step(() => 1);
    let message = "";
    try {
      chain.awaiting("saved").awaiting("saved");
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).not.toMatch(/waitAgain|runDefer|defer already waited/);
  });
});

export type { _threads, _keep, _err, _cb, _await, _cbArity };
