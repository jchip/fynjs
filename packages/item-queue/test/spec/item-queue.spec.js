"use strict";

const ItemQueue = require("../../lib/item-queue");
const Promise = require("bluebird");

describe("item-queue", function() {
  const testConcurrency = (done, concurrency, expected) => {
    let save = [];
    const process = () => {
      return new Promise(resolve => {
        save.push(resolve);
      });
    };
    const pq = new ItemQueue({
      concurrency,
      processItem: x => process(x),
      handlers: {
        done: () => done()
      }
    });
    for (let x = 0; x <= expected; x++) {
      pq.addItem(x, true);
    }
    expect(pq.count).to.equal(expected + 1);
    pq._process();
    expect(save.length, "should queue up expected number of concurrent items").to.equal(expected);
    const tmpSave = save;
    save = [];
    for (let x = 0; x < expected; x++) {
      tmpSave[x]();
    }
    setTimeout(() => {
      expect(save.length === 1);
      save[0]();
    }, 10);
  };

  it("should handle optional conncurrency", done => testConcurrency(done, 3, 3));

  it("should handle default conncurrency", done => testConcurrency(done, undefined, 15));

  it("should handle fail item", done => {
    let n = 0;
    const process = () => {
      return new Promise((resolve, reject) => {
        n++;
        if (n === 3) {
          reject("test");
        } else {
          resolve();
        }
      });
    };
    let failed;
    const pq = new ItemQueue({
      concurrency: 5,
      processItem: x => process(x),
      handlers: {
        failItem: data => (failed = data.error)
      }
    });
    for (let x = 0; x < 15; x++) {
      pq.addItem(x);
    }
    pq.on("done", () => {
      expect(failed).to.be.ok;
      done();
    });
    pq.on("failItem", data => (failed = data.error));
  });

  it("should stop on error", done => {
    let n = 0;
    const process = () => {
      return new Promise((resolve, reject) => {
        n++;
        if (n === 10) {
          reject("test");
        } else {
          resolve();
        }
      });
    };
    const pq = new ItemQueue({
      concurrency: 5,
      stopOnError: true,
      processItem: x => process(x)
    });
    for (let x = 0; x < 15; x++) {
      pq.addItem(x);
    }
    let failed;
    pq.on("done", () => {
      throw new Error("not expecting done event");
    });
    pq.on("fail", () => {
      expect(failed).to.be.ok;
      done();
    });
    pq.on("failItem", data => (failed = data.error));
  });

  it("should emit doneItem event", done => {
    const process = () => Promise.resolve();
    const pq = new ItemQueue({
      concurrency: 5,
      processItem: x => process(x)
    });
    let n = 0;
    pq.on("doneItem", () => {
      n++;
    });
    pq.on("done", () => {
      expect(n).to.equal(15);
      done();
    });
    for (let x = 0; x < 15; x++) {
      pq.addItem(x);
    }
  });

  it("should take initial item Q", done => {
    let sum = 0;
    const items = [1, 2, 3, 4, 5];
    const pq = new ItemQueue({
      concurrency: 2,
      processItem: x => Promise.resolve((sum += x))
    });
    pq.on("done", () => {
      expect(sum).to.equal(15);
      done();
    });
    expect(pq.isPending).to.equal(false);
    expect(() => pq.setItemQ()).to.throw("Must pass array");
    pq.setItemQ(items, true);
    expect(pq._deferred, "should not setup defer start").to.equal(false);
    expect(pq.isPending).to.equal(true);
    pq.setItemQ(items);
  });

  it("should not wait if Q is empty", () => {
    return new ItemQueue({ processItem: () => undefined }).wait().then(x => {
      expect(x).to.equal(undefined);
    });
  });

  it("should reject in wait if Q failed", () => {
    let error;
    return new ItemQueue({
      stopOnError: true,
      processItem: () => {
        throw new Error("test");
      }
    })
      .setItemQ([1])
      .wait()
      .catch(err => (error = err))
      .then(() => {
        expect(error).to.exist;
      });
  });

  it("should reject in subsequent wait if Q failed", () => {
    let error;
    const q = new ItemQueue({
      stopOnError: true,
      processItem: () => {
        throw new Error("test");
      }
    }).setItemQ([1, 2, 3]);
    return q
      .wait()
      .catch(err => (error = err))
      .then(() => {
        expect(error).to.exist;
        return q.wait();
      })
      .catch(err => (error = err))
      .then(() => {
        expect(error).to.exist;
      });
  });

  it("should addItems as an array", () => {
    let sum = 0;
    const items = [1, 2, 3, 4, 5];
    const pq = new ItemQueue({
      concurrency: 2,
      processItem: x => Promise.resolve((sum += x))
    });
    pq.on("done", () => {
      expect(sum).to.equal(30);
    });
    expect(() => pq.addItems()).to.throw("Must pass array");
    pq.addItems(items, true);
    pq.addItems(items);
    return pq.wait();
  });

  it("should emit done after start even if Q is empty", done => {
    const pq = new ItemQueue({
      concurrency: 2,
      processItem: () => undefined
    });
    pq.on("done", () => done());
    pq.start();
  });

  it("should pause on pause item", () => {
    let sum = 0;
    const pq = new ItemQueue({
      concurrency: 2,
      processItem: x => (sum += x)
    });
    const items = [1, 2, 3, 4, 5, ItemQueue.pauseItem, 1, 2, 3, 4, 5];
    let paused;
    pq.on("pause", () => {
      paused = sum;
      expect(pq.isPause).to.equal(true);
      pq.resume();
    });
    pq.addItems(items);
    return pq.wait().then(() => {
      expect(paused).to.equal(15);
      expect(sum).to.equal(30);
    });
  });

  it("should emit pause even if Q is empty", () => {
    let sum = 0;
    const pq = new ItemQueue({
      concurrency: 2,
      processItem: x => (sum += x)
    });
    const items = [1, 2, 3, 4, 5];
    let paused;
    pq.on("pause", () => {
      paused = sum;
      expect(pq.isPause).to.equal(true);
      pq.resume();
    });
    pq.addItems(items, true);
    pq.pause();
    pq.start();
    return pq.wait().then(() => {
      expect(paused).to.equal(0);
      expect(sum).to.equal(15);
    });
  });

  it("should not process if Q is empty", () => {
    const pq = new ItemQueue({
      processItem: () => undefined
    });
    expect(pq._process()).to.equal(0);
  });

  it("should setup a watcher for long pending items", () => {
    const watches = [];
    const pq = new ItemQueue({
      concurrency: 2,
      processItem: x => Promise.delay(x),
      watchPeriod: 10,
      watchTime: 50,
      handlers: {
        watch: x => {
          watches.push(x);
        }
      }
    });

    return pq
      .addItems([1, 100, 20, 30, 40])
      .wait()
      .then(() => Promise.delay(20))
      .then(() => {
        expect(watches.length > 0, "Should have emit watch events");
        const w1 = watches[0];
        expect(w1.total).to.equal(1);
        expect(w1.watched[0].item).to.equal(100);
        const w2 = watches[1];
        expect(w2.total).to.equal(1);
        expect(w2.watched.length).to.equal(0);
        expect(w2.still[0].item).to.equal(100);
        const wl = watches[watches.length - 1];
        expect(wl.total).to.equal(0);
      });
  });
});
