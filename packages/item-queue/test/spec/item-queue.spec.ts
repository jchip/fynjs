import { describe, it, expect } from "vitest";
import { verify, signal } from "run-verify";
import { ItemQueue, type ItemQueueResult } from "../../src/index.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("item-queue", () => {
  const testConcurrency = (concurrency: number | undefined, expected: number) => {
    let save: Array<() => void> = [];
    const process = () => {
      return new Promise<void>((resolve) => {
        save.push(resolve);
      });
    };

    const done = signal();
    const pq = new ItemQueue({
      concurrency,
      processItem: (x) => process(),
      handlers: {
        done: () => done.resolve(undefined),
      },
    });
    for (let x = 0; x <= expected; x++) {
      pq.addItem(x, true);
    }
    expect(pq.count).toBe(expected + 1);
    (pq as any)._process();
    expect(save.length).toBe(expected);
    const tmpSave = save;
    save = [];
    for (let x = 0; x < expected; x++) {
      tmpSave[x]();
    }

    return verify({ timeout: 500, signals: { done } })
      .step(() => new Promise((r) => setTimeout(r, 10)))
      .step(() => {
        expect(save.length).toBe(1);
        save[0]();
      })
      .awaiting(done);
  };

  it("should handle optional concurrency", () => testConcurrency(3, 3));

  it("should handle default concurrency", () => testConcurrency(undefined, 15));

  it("should handle fail item", async () => {
    let n = 0;
    const process = () => {
      return new Promise<void>((resolve, reject) => {
        n++;
        if (n === 3) {
          reject(new Error("test"));
        } else {
          resolve();
        }
      });
    };
    let failed: Error | undefined;
    const pq = new ItemQueue({
      concurrency: 5,
      processItem: (x) => process(),
      handlers: {
        failItem: (data) => {
          failed = data.error;
        },
      },
    });
    for (let x = 0; x < 15; x++) {
      pq.addItem(x);
    }
    pq.on("failItem", (data) => {
      failed = data.error;
    });
    await pq.wait();
    expect(failed).toBeTruthy();
  });

  it("should stop on error", () => {
    let n = 0;
    const process = () => {
      return new Promise<void>((resolve, reject) => {
        n++;
        if (n === 10) {
          reject(new Error("test"));
        } else {
          resolve();
        }
      });
    };
    const pq = new ItemQueue({
      concurrency: 5,
      stopOnError: true,
      processItem: (x) => process(),
    });
    for (let x = 0; x < 15; x++) {
      pq.addItem(x);
    }
    let failed: Error | undefined;
    pq.on("done", () => {
      throw new Error("not expecting done event");
    });
    pq.on("fail", () => {
      expect(failed).toBeTruthy();
    });
    pq.on("failItem", (data) => {
      failed = data.error;
    });

    return verify({ timeout: 500 })
      .expectError.step(() => pq.wait())
      .step((err) => {
        expect(err).toBeTruthy();
      });
  });

  it("should emit doneItem event", async () => {
    const process = () => Promise.resolve();
    const pq = new ItemQueue({
      concurrency: 5,
      processItem: (x) => process(),
    });
    let n = 0;
    pq.on("doneItem", () => {
      n++;
    });
    for (let x = 0; x < 15; x++) {
      pq.addItem(x);
    }
    await pq.wait();
    expect(n).toBe(15);
  });

  it("should take initial item Q", async () => {
    let sum = 0;
    const items = [1, 2, 3, 4, 5];
    const pq = new ItemQueue<number>({
      concurrency: 2,
      processItem: (x) => Promise.resolve((sum += x)),
    });
    expect(pq.isPending).toBe(false);
    expect(() => (pq as any).setItemQ()).toThrow("Must pass array");
    pq.setItemQ(items, true);
    expect((pq as any)._deferred).toBe(false);
    expect(pq.isPending).toBe(true);
    pq.setItemQ(items);
    await pq.wait();
    expect(sum).toBe(15);
  });

  it("should not wait if Q is empty", async () => {
    const result = await new ItemQueue({ processItem: () => undefined }).wait();
    expect(result).toBe(undefined);
  });

  it("should reject in wait if Q failed", () => {
    const q = new ItemQueue({
      stopOnError: true,
      processItem: () => {
        throw new Error("test");
      },
    }).setItemQ([1]);

    return verify({ timeout: 500 })
      .expectError.step(() => q.wait())
      .step((error) => {
        expect(error).toBeTruthy();
      });
  });

  it("should reject in subsequent wait if Q failed", () => {
    const q = new ItemQueue({
      stopOnError: true,
      processItem: () => {
        throw new Error("test");
      },
    }).setItemQ([1, 2, 3]);

    return verify({ timeout: 500 })
      .expectError.step(() => q.wait())
      .step((error) => {
        expect(error).toBeTruthy();
      })
      .expectError.step(() => q.wait())
      .step((error) => {
        expect(error).toBeTruthy();
      });
  });

  it("should addItems as an array", async () => {
    let sum = 0;
    const items = [1, 2, 3, 4, 5];
    const pq = new ItemQueue<number>({
      concurrency: 2,
      processItem: (x) => Promise.resolve((sum += x)),
    });
    expect(() => (pq as any).addItems()).toThrow("Must pass array");
    pq.addItems(items, true);
    pq.addItems(items);
    await pq.wait();
    expect(sum).toBe(30);
  });

  it("should add itemQ from options as an array", async () => {
    let sum = 0;
    const items = [1, 2, 3, 4, 5];
    const pq = new ItemQueue({
      itemQ: items,
      concurrency: 2,
      processItem: (x) => Promise.resolve((sum += x)),
    });
    pq.addItems(items);
    await pq.wait();
    expect(sum).toBe(30);
  });

  it("should emit done after start even if Q is empty", () => {
    const pq = new ItemQueue({
      concurrency: 2,
      processItem: () => undefined,
    });

    return verify({ timeout: 500 }).callbackStep((next) => {
      pq.on("done", () => next(null));
      pq.start();
    });
  });

  it("should pause on pause item", async () => {
    let sum = 0;
    const pq = new ItemQueue<number | symbol>({
      concurrency: 2,
      processItem: (x) => {
        if (typeof x === "number") sum += x;
      },
    });
    const items = [1, 2, 3, 4, 5, ItemQueue.pauseItem, 1, 2, 3, 4, 5];
    let paused: number | undefined;
    pq.on("pause", () => {
      paused = sum;
      expect(pq.isPause).toBe(true);
      pq.resume();
    });
    pq.addItems(items);
    await pq.wait();
    expect(paused).toBe(15);
    expect(sum).toBe(30);
  });

  it("should emit pause even if Q is empty", async () => {
    let sum = 0;
    const pq = new ItemQueue<number>({
      concurrency: 2,
      processItem: (x) => {
        sum += x;
      },
    });
    const items = [1, 2, 3, 4, 5];
    let paused: number | undefined;
    pq.on("pause", () => {
      paused = sum;
      expect(pq.isPause).toBe(true);
      pq.resume();
    });
    pq.addItems(items, true);
    pq.pause();
    pq.start();
    await pq.wait();
    expect(paused).toBe(0);
    expect(sum).toBe(15);
  });

  it("should not process if Q is empty", () => {
    const pq = new ItemQueue({
      processItem: () => undefined,
    });
    expect((pq as any)._process()).toBe(0);
  });

  it("should setup a watcher for long pending items", async () => {
    const watches: any[] = [];
    const pq = new ItemQueue({
      concurrency: 2,
      processItem: (x) => delay(x as number),
      watchPeriod: 10,
      watchTime: 40,
      handlers: {
        watch: (x) => {
          watches.push(x);
        },
      },
    });

    pq.addItems([1, 100, 20, 30, 40]);
    await pq.wait();
    await delay(20);

    expect(watches.length).toBeGreaterThan(0);
    const w1 = watches[0];
    expect(w1.total).toBe(1);
    expect(w1.watched[0].item).toBe(100);
    const w2 = watches[1];
    expect(w2.total).toBe(1);
    expect(w2.watched.length).toBe(0);
    expect(w2.still[0].item).toBe(100);
    const wl = watches[watches.length - 1];
    expect(wl.total).toBe(0);
  });

  it("should skip falsy handlers", () => {
    const pq = new ItemQueue({
      concurrency: 1,
      processItem: (x) => Promise.resolve(x),
      handlers: {
        done: undefined,
        failItem: () => undefined,
      },
    } as any);

    expect(pq.listenerCount("done")).toBe(0);
    expect(pq.listenerCount("failItem")).toBe(1);
  });

  it("should resume after pause() then resume() on an idle queue", () => {
    const seen: number[] = [];
    const done = signal<unknown>();
    const pq = new ItemQueue<number>({
      processItem: (x) => {
        seen.push(x);
      },
    });
    pq.once("done", (data) => done.resolve(data));

    return verify({ timeout: 500, signals: { done } })
      .step(() => pq.pause())
      .step(() => pq.resume())
      .awaiting(done)
      .step(() => expect(pq.isPause).toBe(false))
      .step(() => pq.addItem(1).wait())
      .step(() => expect(seen).toEqual([1]));
  });

  it("should stay paused after resume() then pause() on an idle queue", () => {
    const seen: number[] = [];
    const paused = signal<void>();
    const pq = new ItemQueue<number>({
      processItem: (x) => {
        seen.push(x);
      },
    });
    pq.once("pause", () => paused.resolve());

    return verify({ timeout: 500, signals: { paused } })
      .step(() => pq.addItems([1, 2], true))
      .step(() => pq.resume())
      .step(() => pq.pause())
      .awaiting(paused)
      // let resume()'s tick run
      .step(() => new Promise((resolve) => setImmediate(resolve)))
      .step(() => expect(pq.isPause).toBe(true))
      .step(() => expect(seen).toEqual([]));
  });

  it("should pause before the next item when pause() is called while processing", () => {
    const seen: number[] = [];
    const paused = signal<void>();
    const pq = new ItemQueue<number>({
      concurrency: 3,
      processItem: (x) => {
        seen.push(x);
        if (x === 1) pq.pause();
      },
    });
    pq.once("pause", () => paused.resolve());

    return verify({ timeout: 500, signals: { paused } })
      .step(() => pq.addItems([1, 2, 3]))
      .awaiting(paused)
      .step(() => expect(seen).toEqual([1]))
      .step(() => pq.resume().wait())
      .step(() => expect(seen).toEqual([1, 2, 3]));
  });

  it("should let an in-flight item finish when pause() is called", () => {
    const seen: number[] = [];
    let release: () => void = () => undefined;
    const started = signal<void>();
    const paused = signal<void>();
    const pq = new ItemQueue<number>({
      concurrency: 1,
      processItem: (x) => {
        seen.push(x);
        if (x === 1) started.resolve();
        return new Promise<void>((resolve) => (release = resolve));
      },
    });
    pq.once("pause", () => paused.resolve());

    return verify({ timeout: 500, signals: { started, paused } })
      .step(() => pq.addItems([1, 2]))
      .awaiting(started)
      .step(() => pq.pause())
      .step(() => release())
      .awaiting(paused)
      .step(() => expect(seen).toEqual([1]));
  });

  it("should resume after pause() then resume() with an item in flight", () => {
    const seen: number[] = [];
    let release: () => void = () => undefined;
    const started = signal<void>();
    const done = signal<unknown>();
    const pq = new ItemQueue<number>({
      concurrency: 1,
      processItem: (x) => {
        seen.push(x);
        if (x !== 1) return undefined;
        started.resolve();
        return new Promise<void>((resolve) => (release = resolve));
      },
    });
    pq.once("done", (data) => done.resolve(data));

    return verify({ timeout: 500, signals: { started, done } })
      .step(() => pq.addItems([1, 2, 3]))
      .awaiting(started)
      .step(() => pq.pause())
      .step(() => pq.resume())
      // let resume()'s tick run while item 1 is still in flight
      .step(() => new Promise((resolve) => setImmediate(resolve)))
      .step(() => release())
      .awaiting(done)
      .step(() => expect(seen).toEqual([1, 2, 3]));
  });

  it("should keep a queued pauseItem when start() is called", () => {
    const seen: number[] = [];
    const paused = signal<void>();
    const pq = new ItemQueue<number | symbol>({
      concurrency: 1,
      processItem: (x) => {
        seen.push(x as number);
      },
    });
    pq.once("pause", () => paused.resolve());

    return verify({ timeout: 500, signals: { paused } })
      .step(() => pq.addItems([1, ItemQueue.pauseItem, 2], true))
      .step(() => pq.start())
      .awaiting(paused)
      .step(() => expect(seen).toEqual([1]));
  });

  it("should count a falsy rejection as a failed item", () => {
    const failItem = signal<ItemQueueResult>();
    const pq = new ItemQueue({
      processItem: () => Promise.reject(undefined),
      handlers: {
        failItem: (data) => failItem.resolve(data),
        doneItem: () => failItem.reject(new Error("falsy rejection counted as doneItem")),
      },
    });

    return verify({ timeout: 500, signals: { failItem } })
      .step(() => pq.addItem(1))
      .awaiting(failItem)
      .step((data) => expect(data.item).toBe(1));
  });

  it("should fail a stopOnError queue on a falsy rejection", () => {
    const pq = new ItemQueue({
      stopOnError: true,
      processItem: () => Promise.reject(0),
    });

    return verify({ timeout: 500 })
      .expectError.step(() => pq.addItem(1).wait())
      .step((error) => expect(error).toBe(0))
      .expectError.step(() => pq.wait())
      .step((error) => expect(error).toBe(0));
  });

  it("should report items added after a stopOnError failure as failed items", () => {
    const ran: number[] = [];
    const failed: Array<ItemQueueResult<number | symbol>> = [];
    const lateFail = signal<void>();
    const boom = new Error("boom");
    const pq = new ItemQueue<number | symbol>({
      stopOnError: true,
      processItem: (x) => {
        ran.push(x as number);
        if (x === 1) throw boom;
      },
    });
    pq.on("failItem", (data) => {
      failed.push(data);
      if (data.item === 2) lateFail.resolve();
    });

    return verify({ timeout: 500, signals: { lateFail } })
      .expectError.step(() => pq.addItem(1).wait())
      .step((error) => expect(error).toBe(boom))
      .step(() => pq.addItems([ItemQueue.pauseItem, 2]))
      .awaiting(lateFail)
      .step(() => expect(failed.map((d) => d.item)).toEqual([1, 2]))
      .step(() => expect(failed[1].error).toBe(boom))
      .step(() => expect(ran).toEqual([1]))
      .step(() => expect(pq.count).toBe(0));
  });

  it("should pass a user symbol item to processItem", () => {
    const sym = Symbol("user");
    const seen: symbol[] = [];
    const doneItem = signal<ItemQueueResult<symbol>>();
    const pq = new ItemQueue<symbol>({
      processItem: (x) => {
        seen.push(x);
      },
      handlers: {
        doneItem: (data) => doneItem.resolve(data),
      },
    });

    return verify({ timeout: 500, signals: { doneItem } })
      .step(() => pq.addItem(sym))
      .awaiting(doneItem)
      .keep.step((data) => expect(data.item).toBe(sym))
      .step(() => expect(seen).toEqual([sym]));
  });

  describe("timeout", () => {
    it("should fail a timed out item, abort its signal and free its slot", () => {
      const signals: AbortSignal[] = [];
      const ran: number[] = [];
      const failed: ItemQueueResult<number>[] = [];
      const done = signal<void>();
      const pq = new ItemQueue<number>({
        concurrency: 1,
        timeout: 20,
        processItem: (x, _id, sig) => {
          ran.push(x);
          signals.push(sig);
          // item 1 hangs, item 2 resolves right away
          return x === 1 ? new Promise(() => undefined) : undefined;
        },
        handlers: {
          failItem: (data) => failed.push(data),
          done: () => done.resolve(),
        },
      });

      return verify({ timeout: 500, signals: { done } })
        .step(() => pq.addItems([1, 2]))
        .awaiting(done)
        .step(() => expect(ran).toEqual([1, 2]))
        .step(() => expect(failed.map((d) => d.item)).toEqual([1]))
        .step(() => expect((failed[0].error as any).code).toBe("ETIMEDOUT"))
        .step(() => expect(signals[0].aborted).toBe(true))
        .step(() => expect(signals[0].reason).toBe(failed[0].error))
        .step(() => expect(signals[1].aborted).toBe(false));
    });

    it("should ignore a result that arrives after the timeout", () => {
      const doneItems: number[] = [];
      const failed: number[] = [];
      const pq = new ItemQueue<number>({
        timeout: 10,
        processItem: () => delay(40),
        handlers: {
          doneItem: (data) => doneItems.push(data.item),
          failItem: (data) => failed.push(data.item),
        },
      });

      return verify({ timeout: 500 })
        .step(() => pq.addItem(1).wait())
        .step(() => delay(60))
        .step(() => expect(failed).toEqual([1]))
        .step(() => expect(doneItems).toEqual([]));
    });

    it("should pass results and errors through when items finish in time", () => {
      const boom = new Error("boom");
      const doneItems: unknown[] = [];
      const failed: unknown[] = [];
      const pq = new ItemQueue<number>({
        timeout: 200,
        processItem: async (x) => {
          if (x === 2) throw boom;
          return x * 10;
        },
        handlers: {
          doneItem: (data) => doneItems.push(data.res),
          failItem: (data) => failed.push(data.error),
        },
      });
      const start = Date.now();

      return verify({ timeout: 500 })
        .step(() => pq.addItems([1, 2]).wait())
        .step(() => expect(doneItems).toEqual([10]))
        .step(() => expect(failed).toEqual([boom]))
        // timers were cleared, so done did not wait for the timeout
        .step(() => expect(Date.now() - start).toBeLessThan(150));
    });

    it("should fail a stopOnError queue with the timeout error", () => {
      const pq = new ItemQueue({
        stopOnError: true,
        timeout: 10,
        processItem: () => new Promise(() => undefined),
      });

      return verify({ timeout: 500 })
        .expectError.step(() => pq.addItem(1).wait())
        .step((error: any) => expect(error.code).toBe("ETIMEDOUT"));
    });

    it("should not pass a signal without a timeout", () => {
      const args: unknown[][] = [];
      const pq = new ItemQueue({
        processItem: (...a) => {
          args.push(a);
        },
      });

      return verify({ timeout: 500 })
        .step(() => pq.addItem(1).wait())
        .step(() => expect(args).toEqual([[1, 1, undefined]]));
    });
  });
});
