import { describe, it, expect } from "vitest";
import { Munchy } from "../../src/index.ts";
import fs from "node:fs";
import Path from "node:path";
import { PassThrough, Readable } from "node:stream";

describe("munchy", function () {
  const drainIt = (munchy: Munchy) => {
    const data: any[] = [];
    const drain = new PassThrough();
    drain.on("data", x => {
      data.push(x);
    });
    munchy.pipe(drain);
    return { data, drain };
  };

  it("should not setup read trigger if no sources", () => {
    const munchy = new Munchy();
    munchy._started = true;
    munchy._triggerRead();
    expect(munchy._triggered).to.equal(false);
  });

  it("should drain fs read stream, string, and buffer", async () => {
    const fooPath = Path.resolve(__dirname, "../fixtures/foo.txt");
    const barPath = Path.resolve(__dirname, "../fixtures/bar.txt");

    const munchy = new Munchy(
      {},
      "hello world\n",
      fs.createReadStream(fooPath),
      Buffer.from("blah"),
      fs.createReadStream(barPath),
      null
    );

    const { data } = drainIt(munchy);
    let end = false;
    let drained = 0;

    munchy.on("end", () => {
      end = true;
    });

    munchy.on("drained", () => {
      drained++;
    });

    await new Promise<void>(resolve => {
      munchy.on("close", resolve);
    });

    expect(end).to.be.true;
    const output = data.map(x => x.toString());
    expect(output).to.deep.equal(["hello world\n", "foo\n", "blah", "bar\n"]);
    expect(drained).to.equal(2);
  });

  it("should stop pushing if push returns false (backpressure)", async () => {
    const munchy = new Munchy({ highWaterMark: 64 });
    munchy._started = true;
    const bufSize = 10 * 1024;
    munchy.munch(
      Buffer.alloc(bufSize),
      Buffer.alloc(bufSize),
      Buffer.alloc(bufSize),
      Buffer.alloc(bufSize)
    );

    await new Promise(r => setTimeout(r, 20));
    expect(munchy._moreSources()).to.equal(true);
  });

  it("should stop pushing draining data if push returns false", async () => {
    const munchy = new Munchy({ highWaterMark: 64 });
    munchy._started = true;
    const munchy2 = new Munchy();
    const bufSize = 10 * 1024;
    munchy2.munch(
      Buffer.alloc(bufSize),
      Buffer.alloc(bufSize),
      Buffer.alloc(bufSize),
      Buffer.alloc(bufSize)
    );
    munchy.munch(munchy2, "a", "b");

    await new Promise(r => setTimeout(r, 20));
    expect(munchy._canPush).to.equal(false);
  });

  it("should handle _read being called multiple times", () => {
    const munchy = new Munchy();
    munchy._started = true;
    let push = false;
    munchy.push = (() => {
      expect(push).to.equal(false);
      push = true;
      munchy._read();
      push = false;
      return true;
    }) as any;
    munchy.munch("a", "b", "c");
  });

  it("should initialize sources to []", () => {
    const munchy = new Munchy();
    expect(munchy._sources).to.deep.equal([]);
  });

  it("should only reset non empty sources from destroy", () => {
    const munchy = new Munchy();
    let reset = false;
    munchy._resetSources = () => {
      reset = true;
    };
    munchy.destroy();
    expect(reset).to.equal(false);
  });

  it("should reset sources if they are all drained", async () => {
    const fooPath = Path.resolve(__dirname, "../fixtures/foo.txt");
    const barPath = Path.resolve(__dirname, "../fixtures/bar.txt");

    const foo = fs.createReadStream(fooPath);
    const bar = fs.createReadStream(barPath);
    const munchy = new Munchy({}, "hello", "world", foo);

    let munched = false;
    munchy.once("munched", () => {
      munched = true;
    });
    const { data } = drainIt(munchy);

    await new Promise<void>(resolve => foo.on("end", resolve));
    munchy.munch(fs.createReadStream(fooPath), bar);
    await new Promise<void>(resolve => bar.on("end", resolve));

    await new Promise(r => setTimeout(r, 25));
    expect(munched).to.equal(true);

    munchy.munch(null);
    await new Promise<void>(resolve => munchy.on("end", resolve));

    expect(data.map(x => x.toString().trim()).join("")).to.equal("helloworldfoofoobar");
  });

  it("should handle munch a bunch of non-streams and then null", async () => {
    const munchy = new Munchy();

    let munched = false;
    munchy.once("munched", () => {
      munched = true;
    });

    const { data } = drainIt(munchy);
    munchy.munch("a", "b");
    await new Promise(r => setTimeout(r, 20));

    munchy.munch(null);
    await new Promise<void>(resolve => munchy.on("end", resolve));

    expect(munched).to.equal(true);
    expect(data.map(x => x.toString()).join("")).to.equal("ab");
  });

  it("should throw if trying to read after destroy", async () => {
    const munchy = new Munchy({}, "hello", "world", null);
    drainIt(munchy);

    await new Promise<void>(resolve => munchy.on("end", resolve));

    const err = await new Promise<Error>(resolve => {
      munchy.on("error", resolve);
      setTimeout(() => munchy.munch("test"), 10);
    });

    expect(err.message).toContain("_read called after destroy");
  });

  it("should error if a source stream error", async () => {
    const munchy = new Munchy();
    const p = new PassThrough();
    drainIt(munchy);
    munchy.munch(p);

    const err = await new Promise<Error>(resolve => {
      munchy.on("error", resolve);
      munchy.on("draining", () => {
        process.nextTick(() => p.emit("error", new Error("test")));
      });
    });

    expect(err.message).to.equal("test");
  });

  it("should use handle stream error if a source stream error", async () => {
    const munchy = new Munchy({
      handleStreamError: err => {
        return { result: err.message, remit: false };
      }
    });

    const p = new PassThrough();
    const output = drainIt(munchy);
    munchy.munch(p, null);

    await new Promise<void>(resolve => {
      munchy.on("end", resolve);
      munchy.on("draining", () => {
        process.nextTick(() => {
          p.push("oops");
          p.emit("error", new Error("test"));
        });
      });
    });

    expect(output.data.map(x => x.toString()).join("-")).to.equal("oops-test");
  });

  it("should error if a source stream emit error w/o Error object", async () => {
    const munchy = new Munchy();
    const p = new PassThrough();
    drainIt(munchy);
    munchy.munch(p);

    const err = await new Promise<Error>(resolve => {
      munchy.on("error", resolve);
      munchy.on("draining", () => {
        process.nextTick(() => p.emit("error"));
      });
    });

    expect(err.message).toContain("source stream emitted error");
  });

  it("should clear sources when destroy", () => {
    const munchy = new Munchy("a", "b", "c");
    munchy.destroy();
    expect(munchy._sources.length).to.equal(0);
  });

  it("should handle Promise and async generator sources", async () => {
    async function* asyncGen() {
      yield "gen1";
      yield "gen2";
    }

    const promiseSource = Promise.resolve("prom1");

    const munchy = new Munchy({}, "start", promiseSource, asyncGen(), null);
    const { data } = drainIt(munchy);

    await new Promise<void>(resolve => munchy.on("end", resolve));
    expect(data.map(x => x.toString()).join("-")).to.equal("start-prom1-gen1-gen2");
  });

  it("should handle sync Iterable sources", async () => {
    const set = new Set(["item1", "item2"]);
    const munchy = new Munchy({}, set, null);
    const { data } = drainIt(munchy);

    await new Promise<void>(resolve => munchy.on("end", resolve));
    expect(data.map(x => x.toString()).join("-")).to.equal("item1-item2");
  });

  it("should handle Web Streams (ReadableStream)", async () => {
    const webStream = new ReadableStream({
      start(controller) {
        controller.enqueue("web1");
        controller.enqueue("web2");
        controller.close();
      }
    });

    const munchy = new Munchy({}, "prefix", webStream, null);
    const { data } = drainIt(munchy);

    await new Promise<void>(resolve => munchy.on("end", resolve));
    expect(data.map(x => x.toString()).join("-")).to.equal("prefix-web1-web2");
  });

  it("should remit error when handleStreamError does not set remit to false", async () => {
    const munchy = new Munchy({
      handleStreamError: err => ({ result: "failed", remit: true })
    });
    const p = new PassThrough();
    drainIt(munchy);
    munchy.munch(p);

    const err = await new Promise<Error>(resolve => {
      munchy.on("error", resolve);
      munchy.on("draining", () => {
        process.nextTick(() => p.emit("error", new Error("fatal stream error")));
      });
    });

    expect(err.message).to.equal("fatal stream error");
  });

  it("should handle sync iterable backpressure", async () => {
    const bigArray = [Buffer.alloc(1024), Buffer.alloc(1024), Buffer.alloc(1024)];
    const munchy = new Munchy({ highWaterMark: 64 }, bigArray, null);
    const { data } = drainIt(munchy);

    await new Promise<void>(resolve => munchy.on("end", resolve));
    expect(data.length).to.equal(3);
  });

  it("should handle objectMode and arbitrary object fallback", async () => {
    const obj1 = { hello: "world" };
    const obj2 = { foo: "bar" };
    const munchy = new Munchy({ objectMode: true }, obj1, obj2, null);
    const received: any[] = [];
    munchy.on("data", x => received.push(x));

    await new Promise<void>(resolve => munchy.on("end", resolve));
    expect(received).to.deep.equal([obj1, obj2]);
  });

  it("should handle promise rejection in sources", async () => {
    const rejectedPromise = Promise.reject(new Error("promise rejected"));
    const munchy = new Munchy({}, rejectedPromise, null);
    drainIt(munchy);

    const err = await new Promise<Error>(resolve => {
      munchy.on("error", resolve);
    });
    expect(err.message).to.equal("promise rejected");
  });

  it("should cleanly destroy when an active stream is currently draining", async () => {
    const p = new PassThrough();
    const munchy = new Munchy({}, p);
    drainIt(munchy);

    await new Promise<void>(resolve => {
      munchy.on("draining", () => {
        munchy.destroy();
        resolve();
      });
    });

    expect(munchy.destroyed).to.be.true;
  });

  it("should cleanup _resumePush when destroy is called during backpressure", async () => {
    const munchy = new Munchy({ highWaterMark: 64 }, Buffer.alloc(1024), Buffer.alloc(1024));
    munchy._read();
    await new Promise(r => setTimeout(r, 10));
    munchy.destroy();
    expect(munchy.destroyed).to.be.true;
  });

  it("should catch unexpected error from _run and emit error", async () => {
    const munchy = new Munchy();
    (munchy as any)._run = async () => {
      throw new Error("unexpected run failure");
    };
    const err = await new Promise<Error>(resolve => {
      munchy.on("error", resolve);
      munchy._read();
    });
    expect(err.message).to.equal("unexpected run failure");
  });

  it("should handle backpressure from a resolved Promise", async () => {
    const p = Promise.resolve(Buffer.alloc(1024));
    const munchy = new Munchy({ highWaterMark: 64 }, p, "tail", null);
    const { data } = drainIt(munchy);
    await new Promise<void>(resolve => munchy.on("end", resolve));
    expect(data.length).toBeGreaterThan(0);
  });

  it("should handle backpressure for arbitrary object in objectMode", async () => {
    const munchy = new Munchy({ objectMode: true, highWaterMark: 1 });
    munchy.munch({ item: 1 }, { item: 2 }, { item: 3 }, null);
    const received: any[] = [];
    munchy.on("data", chunk => {
      received.push(chunk);
    });
    await new Promise<void>(resolve => munchy.on("end", resolve));
    expect(received).to.deep.equal([{ item: 1 }, { item: 2 }, { item: 3 }]);
  });

  it("should handle backpressure when pushing handleStreamError result", () => {
    const munchy = new Munchy({
      highWaterMark: 64,
      handleStreamError: () => ({ result: Buffer.alloc(1024), remit: false })
    });
    munchy._started = true;
    (munchy as any)._handleStreamErr(new Error("err with big result"));
    expect(munchy._canPush).to.equal(false);
  });

  it("should remit error when handleStreamError returns falsy value", async () => {
    const munchy = new Munchy({
      handleStreamError: () => undefined
    });
    const p = new PassThrough();
    drainIt(munchy);
    munchy.munch(p);

    const err = await new Promise<Error>(resolve => {
      munchy.on("error", resolve);
      munchy.on("draining", () => {
        process.nextTick(() => p.emit("error", new Error("falsy return error")));
      });
    });

    expect(err.message).to.equal("falsy return error");
  });

  it("should drain an empty stream that ends asynchronously", async () => {
    const p = new PassThrough();
    const munchy = new Munchy({}, p, "after", null);
    const { data } = drainIt(munchy);
    setTimeout(() => p.end(), 10);
    await new Promise<void>(resolve => munchy.on("end", resolve));
    expect(data.map(x => x.toString()).join("")).to.equal("after");
  });

  it("should break when destroyed while a sub-stream is paused on backpressure", async () => {
    const p = new PassThrough();
    const munchy = new Munchy({ highWaterMark: 64 }, p);
    munchy._read();
    p.write(Buffer.alloc(1024));
    await new Promise(r => setTimeout(r, 10));
    munchy.destroy();
    expect(munchy.destroyed).to.be.true;
  });

  it("should fallback to default error when _handleStreamErr is called without error object", () => {
    const munchy = new Munchy();
    let emittedErr: any;
    munchy.on("error", err => {
      emittedErr = err;
    });
    (munchy as any)._handleStreamErr();
    expect(emittedErr.message).toContain("source stream emitted error");
  });
});

