import { describe, it, expect } from "vitest";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { verify, signal } from "../../src/index.js";

// Every chain example in the README's `verify` section, run verbatim, so the
// documentation cannot drift away from the code without a test failing.
describe("README chain examples", () => {
  it("core example resolves count=6", async () => {
    const count = await verify({ timeout: 500 })
      .step(() => 2)
      .step(value => value * 3)
      .keep.step(value => assert.equal(value, 6))
      .step(value => `count=${value}`);
    expect(count).toBe("count=6");
  });

  it("reusable prefix example", async () => {
    const closed: string[] = [];
    const closeStore = () => closed.push("closed");
    const makeStore = () => ({ save: (id: string) => ({ id }) });

    const withStore = verify({ timeout: 500, cleanup: closeStore }).step(() => makeStore());

    const a = await withStore.step(s => s.save("a")).keep.step(r => assert.ok(r.id));
    const b = await withStore.step(s => s.save("b")).keep.step(r => assert.ok(r.id));
    expect([a.id, b.id]).toEqual(["a", "b"]);
    expect(closed).toHaveLength(2); // one per branch, as documented
  });

  it("the two callback modifier examples", async () => {
    const loadRecord = (id: string, next: (e: Error | null, v?: any) => void) =>
      setImmediate(() => next(null, { id }));

    const fromCb = await verify({ timeout: 500 })
      .callbackStep(next => loadRecord("record-1", next))
      .step(r => (r as any).id);
    expect(fromCb).toBe("record-1");

    const withCb = await verify({ timeout: 500 })
      .step(() => "record-2")
      .callbackStep((id: string, next: any) => loadRecord(id, next))
      .step(r => (r as any).id);
    expect(withCb).toBe("record-2");
  });

  it("modifier composition example", async () => {
    const result = await verify({ timeout: 500 })
      .step(() => 1)
      .expectError.callbackStep(next => next(new Error("failed")))
      .step(err => {
        assert.equal((err as Error).message, "failed");
        return "ok";
      });
    expect(result).toBe("ok");
  });

  it("value step examples", async () => {
    class ValidationError extends Error {}
    const save = (_bad: string) => Promise.reject(new ValidationError("bad"));

    await verify({ timeout: 500 })
      .expectError.step(save("bad"))
      .step(err => assert.ok(err instanceof ValidationError));

    const seeded = await verify()
      .step(41)
      .step(value => value + 1);
    expect(seeded).toBe(42);
  });

  it("asyncStep array example resolves element-wise", async () => {
    const save = (id: string) => Promise.resolve({ id });

    const [a, b] = await verify({ timeout: 500 }).asyncStep([save("a"), save("b")]);
    expect([a.id, b.id]).toEqual(["a", "b"]);
  });

  it("asyncStep function form defers the work, the value form does not", async () => {
    const started: string[] = [];
    const save = (id: string) => {
      started.push(id);
      return Promise.resolve({ id });
    };

    // a value is already running when you pass it
    const eager = verify({ timeout: 500 }).asyncStep([save("a"), save("b")]);
    expect(started).toEqual(["a", "b"]);
    await eager;

    started.length = 0;

    // a function is not called until the sequence reaches it
    const deferred = verify({ timeout: 500 }).asyncStep(() => [save("c"), save("d")]);
    expect(started).toEqual([]);
    const [c, d] = await deferred;
    expect(started).toEqual(["c", "d"]);
    expect([c.id, d.id]).toEqual(["c", "d"]);
  });

  it("step passes an array through, so a later step can race it", async () => {
    const slow = new Promise<string>(resolve => setTimeout(() => resolve("slow"), 50));
    const fast = Promise.resolve("fast");

    const winner = await verify()
      .step([slow, fast])
      .step(promises => Promise.race(promises));
    expect(winner).toBe("fast");
  });

  it("the expectErrorToBe one-liner", async () => {
    const run = (name: string, next: (e?: Error | null) => void) =>
      setImmediate(() => next(new Error(`Task ${name} not found`)));

    await verify()
      .expectErrorToBe("Task foo not found")
      .callbackStep(next => run("foo", next));
  });

  it("the expectErrorHas one-liner", async () => {
    const loadTask = () =>
      Promise.reject(Object.assign(new Error("Task foo not found"), { code: "TASK_NOT_FOUND" }));

    await verify()
      .expectErrorHas("not found", "TASK_NOT_FOUND")
      .step(() => loadTask());
  });

  it("message modifiers still forward the error", async () => {
    const loadTask = () =>
      Promise.reject(
        Object.assign(new Error("Task foo not found"), { code: "TASK_NOT_FOUND", task: "foo" })
      );

    await verify()
      .expectErrorHas("not found", "TASK_NOT_FOUND")
      .step(() => loadTask())
      .step((error: any) => expect(error.task).toBe("foo"));
  });

  it("resource lifecycle migration example", async () => {
    const events: string[] = [];
    let active: any;
    const open = (name: string, { onOpen }: any) =>
      setImmediate(() => {
        events.push(`open:${name}`);
        onOpen({ name });
      });
    const openResource = (handlers: any) => open("first", handlers);
    const openReplacement = (handlers: any) => open("second", handlers);
    const use = (resource: any) => events.push(`use:${resource.name}`);
    const close = async (resource: any) => events.push(`close:${resource.name}`);
    const removeFixture = async () => events.push("remove");

    await verify({
      timeout: 1000,
      cleanup: async () => {
        try {
          if (active) await close(active);
        } finally {
          await removeFixture();
        }
      }
    })
      .callbackStep(next => {
        openResource({
          onError: error => next(error),
          onOpen: resource => next(null, resource)
        });
      })
      .step(resource => {
        active = resource;
        return use(resource);
      })
      .step(async () => {
        const old = active;
        await close(old);
        active = undefined;
      })
      .callbackStep(next => {
        openReplacement({
          onError: error => next(error),
          onOpen: resource => next(null, resource)
        });
      })
      .step(resource => {
        active = resource;
      });

    expect(events).toEqual([
      "open:first",
      "use:first",
      "close:first",
      "open:second",
      "close:second",
      "remove"
    ]);
  });

  it("signals example", async () => {
    const store = new (class extends EventEmitter {
      async save(id: string) {
        const record = { id };
        setImmediate(() => this.emit("saved", record));
        return record;
      }
    })();
    const saved = signal<{ id: string }>();
    const onSaved = (record: { id: string }) => saved.resolve(record);

    const id = await verify({
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

    assert.equal(id, "a");
    expect(store.listenerCount("saved")).toBe(0);
  });
});
