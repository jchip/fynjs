import { describe, it, expect } from "vitest";
import { ItemQueue } from "../../src/index.ts";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("item-queue", () => {
  const testConcurrency = async (concurrency: number | undefined, expected: number) => {
    let save: Array<() => void> = [];
    const process = () => {
      return new Promise<void>((resolve) => {
        save.push(resolve);
      });
    };

    return new Promise<void>((done) => {
      const pq = new ItemQueue({
        concurrency,
        processItem: (x) => process(),
        handlers: {
          done: () => done(),
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
      setTimeout(() => {
        expect(save.length).toBe(1);
        save[0]();
      }, 10);
    });
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

  it("should stop on error", async () => {
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
    try {
      await pq.wait();
    } catch (err) {
      expect(err).toBeTruthy();
    }
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
    const pq = new ItemQueue({
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

  it("should reject in wait if Q failed", async () => {
    let error: Error | undefined;
    try {
      await new ItemQueue({
        stopOnError: true,
        processItem: () => {
          throw new Error("test");
        },
      })
        .setItemQ([1])
        .wait();
    } catch (err) {
      error = err as Error;
    }
    expect(error).toBeTruthy();
  });

  it("should reject in subsequent wait if Q failed", async () => {
    let error: Error | undefined;
    const q = new ItemQueue({
      stopOnError: true,
      processItem: () => {
        throw new Error("test");
      },
    }).setItemQ([1, 2, 3]);

    try {
      await q.wait();
    } catch (err) {
      error = err as Error;
    }
    expect(error).toBeTruthy();

    error = undefined;
    try {
      await q.wait();
    } catch (err) {
      error = err as Error;
    }
    expect(error).toBeTruthy();
  });

  it("should addItems as an array", async () => {
    let sum = 0;
    const items = [1, 2, 3, 4, 5];
    const pq = new ItemQueue({
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

  it("should emit done after start even if Q is empty", async () => {
    return new Promise<void>((done) => {
      const pq = new ItemQueue({
        concurrency: 2,
        processItem: () => undefined,
      });
      pq.on("done", () => done());
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
});
