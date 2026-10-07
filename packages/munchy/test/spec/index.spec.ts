import { describe, it, expect } from "vitest";
import { Munchy } from "../../src/index.ts";
import fs from "node:fs";
import Path from "node:path";
import { PassThrough, Readable, Writable } from "node:stream";
import { EventEmitter, once } from "node:events";
import { verify, signal } from "run-verify";

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

  it("should drain fs read stream, string, and buffer", () => {
    const fooPath = Path.resolve(import.meta.dirname, "../fixtures/foo.txt");
    const barPath = Path.resolve(import.meta.dirname, "../fixtures/bar.txt");

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

    return verify({ timeout: 500 })
      .step(() => once(munchy, "close"))
      .step(() => {
        expect(end).to.be.true;
        const output = data.map(x => x.toString());
        expect(output).to.deep.equal(["hello world\n", "foo\n", "blah", "bar\n"]);
        expect(drained).to.equal(2);
      });
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

  it("should reset sources if they are all drained", () => {
    const fooPath = Path.resolve(import.meta.dirname, "../fixtures/foo.txt");
    const barPath = Path.resolve(import.meta.dirname, "../fixtures/bar.txt");

    const foo = fs.createReadStream(fooPath);
    const bar = fs.createReadStream(barPath);
    const munchy = new Munchy({}, "hello", "world", foo);

    let munched = false;
    munchy.once("munched", () => {
      munched = true;
    });
    const { data } = drainIt(munchy);

    return verify({ timeout: 500 })
      .step(() => once(foo, "end"))
      .step(() => {
        munchy.munch(fs.createReadStream(fooPath), bar);
        return once(bar, "end");
      })
      .step(() => new Promise(r => setTimeout(r, 25)))
      .step(() => {
        expect(munched).to.equal(true);
        munchy.munch(null);
        return once(munchy, "end");
      })
      .step(() => {
        expect(data.map(x => x.toString().trim()).join("")).to.equal("helloworldfoofoobar");
      });
  });

  it("should handle munch a bunch of non-streams and then null", () => {
    const munchy = new Munchy();

    let munched = false;
    munchy.once("munched", () => {
      munched = true;
    });

    const { data } = drainIt(munchy);
    munchy.munch("a", "b");

    return verify({ timeout: 500 })
      .step(() => new Promise(r => setTimeout(r, 20)))
      .step(() => {
        munchy.munch(null);
        return once(munchy, "end");
      })
      .step(() => {
        expect(munched).to.equal(true);
        expect(data.map(x => x.toString()).join("")).to.equal("ab");
      });
  });

  it("should throw if trying to read after destroy", () => {
    const munchy = new Munchy({}, "hello", "world", null);
    drainIt(munchy);

    return verify({ timeout: 500 })
      .step(() => once(munchy, "end"))
      .step(() => {
        setTimeout(() => munchy.munch("test"), 10);
        return once(munchy, "error");
      })
      .step(([err]: [Error]) => {
        expect(err.message).toContain("_read called after destroy");
      });
  });

  it("should error if a source stream error", () => {
    const munchy = new Munchy();
    const p = new PassThrough();
    drainIt(munchy);
    munchy.munch(p);

    return verify({ timeout: 500 })
      .step(() => {
        munchy.on("draining", () => {
          process.nextTick(() => p.emit("error", new Error("test")));
        });
        return once(munchy, "error");
      })
      .step(([err]: [Error]) => {
        expect(err.message).to.equal("test");
      });
  });

  it("should use handle stream error if a source stream error", () => {
    const munchy = new Munchy({
      handleStreamError: err => {
        return { result: err.message, remit: false };
      }
    });

    const p = new PassThrough();
    const output = drainIt(munchy);
    munchy.munch(p, null);

    return verify({ timeout: 500 })
      .step(() => {
        munchy.on("draining", () => {
          process.nextTick(() => {
            p.push("oops");
            p.emit("error", new Error("test"));
          });
        });
        return once(munchy, "end");
      })
      .step(() => {
        expect(output.data.map(x => x.toString()).join("-")).to.equal("oops-test");
      });
  });

  it("should error if a source stream emit error w/o Error object", () => {
    const munchy = new Munchy();
    const p = new PassThrough();
    drainIt(munchy);
    munchy.munch(p);

    return verify({ timeout: 500 })
      .step(() => {
        munchy.on("draining", () => {
          process.nextTick(() => p.emit("error"));
        });
        return once(munchy, "error");
      })
      .step(([err]: [Error]) => {
        expect(err.message).toContain("source stream emitted error");
      });
  });

  it("should clear sources when destroy", () => {
    const munchy = new Munchy("a", "b", "c");
    munchy.destroy();
    expect(munchy._sources.length).to.equal(0);
  });

  it("should handle Promise and async generator sources", () => {
    async function* asyncGen() {
      yield "gen1";
      yield "gen2";
    }

    const promiseSource = Promise.resolve("prom1");

    const munchy = new Munchy({}, "start", promiseSource, asyncGen(), null);
    const { data } = drainIt(munchy);

    return verify({ timeout: 500 })
      .step(() => once(munchy, "end"))
      .step(() => {
        expect(data.map(x => x.toString()).join("-")).to.equal("start-prom1-gen1-gen2");
      });
  });

  it("should handle sync Iterable sources", () => {
    const set = new Set(["item1", "item2"]);
    const munchy = new Munchy({}, set, null);
    const { data } = drainIt(munchy);

    return verify({ timeout: 500 })
      .step(() => once(munchy, "end"))
      .step(() => {
        expect(data.map(x => x.toString()).join("-")).to.equal("item1-item2");
      });
  });

  it("should handle Web Streams (ReadableStream)", () => {
    const webStream = new ReadableStream({
      start(controller) {
        controller.enqueue("web1");
        controller.enqueue("web2");
        controller.close();
      }
    });

    const munchy = new Munchy({}, "prefix", webStream, null);
    const { data } = drainIt(munchy);

    return verify({ timeout: 500 })
      .step(() => once(munchy, "end"))
      .step(() => {
        expect(data.map(x => x.toString()).join("-")).to.equal("prefix-web1-web2");
      });
  });

  it("should remit error when handleStreamError does not set remit to false", () => {
    const munchy = new Munchy({
      handleStreamError: err => ({ result: "failed", remit: true })
    });
    const p = new PassThrough();
    drainIt(munchy);
    munchy.munch(p);

    return verify({ timeout: 500 })
      .step(() => {
        munchy.on("draining", () => {
          process.nextTick(() => p.emit("error", new Error("fatal stream error")));
        });
        return once(munchy, "error");
      })
      .step(([err]: [Error]) => {
        expect(err.message).to.equal("fatal stream error");
      });
  });

  it("should handle sync iterable backpressure", () => {
    const bigArray = [Buffer.alloc(1024), Buffer.alloc(1024), Buffer.alloc(1024)];
    const munchy = new Munchy({ highWaterMark: 64 }, bigArray, null);
    const { data } = drainIt(munchy);

    return verify({ timeout: 500 })
      .step(() => once(munchy, "end"))
      .step(() => {
        expect(data.length).to.equal(3);
      });
  });

  it("should handle objectMode and arbitrary object fallback", () => {
    const obj1 = { hello: "world" };
    const obj2 = { foo: "bar" };
    const munchy = new Munchy({ objectMode: true }, obj1, obj2, null);
    const received: any[] = [];
    munchy.on("data", x => received.push(x));

    return verify({ timeout: 500 })
      .step(() => once(munchy, "end"))
      .step(() => {
        expect(received).to.deep.equal([obj1, obj2]);
      });
  });

  it("should handle promise rejection in sources", () => {
    const rejectedPromise = Promise.reject(new Error("promise rejected"));
    const munchy = new Munchy({}, rejectedPromise, null);
    drainIt(munchy);

    return verify({ timeout: 500 })
      .step(() => once(munchy, "error"))
      .step(([err]: [Error]) => {
        expect(err.message).to.equal("promise rejected");
      });
  });

  it("should cleanly destroy when an active stream is currently draining", () => {
    const p = new PassThrough();
    const munchy = new Munchy({}, p);
    drainIt(munchy);

    return verify({ timeout: 500 })
      .step(() => once(munchy, "draining"))
      .step(() => {
        munchy.destroy();
        expect(munchy.destroyed).to.be.true;
      });
  });

  it("should cleanup _resumePush when destroy is called during backpressure", async () => {
    const munchy = new Munchy({ highWaterMark: 64 }, Buffer.alloc(1024), Buffer.alloc(1024));
    munchy._read();
    await new Promise(r => setTimeout(r, 10));
    munchy.destroy();
    expect(munchy.destroyed).to.be.true;
  });

  it("should catch unexpected error from _run and emit error", () => {
    const munchy = new Munchy();
    (munchy as any)._run = async () => {
      throw new Error("unexpected run failure");
    };

    return verify({ timeout: 500 })
      .step(() => {
        munchy._read();
        return once(munchy, "error");
      })
      .step(([err]: [Error]) => {
        expect(err.message).to.equal("unexpected run failure");
      });
  });

  it("should handle backpressure from a resolved Promise", () => {
    const p = Promise.resolve(Buffer.alloc(1024));
    const munchy = new Munchy({ highWaterMark: 64 }, p, "tail", null);
    const { data } = drainIt(munchy);

    return verify({ timeout: 500 })
      .step(() => once(munchy, "end"))
      .step(() => {
        expect(data.length).toBeGreaterThan(0);
      });
  });

  it("should handle backpressure for arbitrary object in objectMode", () => {
    const munchy = new Munchy({ objectMode: true, highWaterMark: 1 });
    munchy.munch({ item: 1 }, { item: 2 }, { item: 3 }, null);
    const received: any[] = [];
    munchy.on("data", chunk => {
      received.push(chunk);
    });

    return verify({ timeout: 500 })
      .step(() => once(munchy, "end"))
      .step(() => {
        expect(received).to.deep.equal([{ item: 1 }, { item: 2 }, { item: 3 }]);
      });
  });

  it("should handle backpressure when pushing handleStreamError result", async () => {
    const munchy = new Munchy({
      highWaterMark: 64,
      handleStreamError: () => ({ result: Buffer.alloc(1024), remit: false })
    });
    munchy._started = true;
    const pending = (munchy as any)._handleStreamErr(new Error("err with big result"));
    expect(munchy._canPush).to.equal(false);
    munchy.destroy();
    expect(await pending).to.equal(false);
  });

  it("should remit error when handleStreamError returns falsy value", () => {
    const munchy = new Munchy({
      handleStreamError: () => undefined
    });
    const p = new PassThrough();
    drainIt(munchy);
    munchy.munch(p);

    return verify({ timeout: 500 })
      .step(() => {
        munchy.on("draining", () => {
          process.nextTick(() => p.emit("error", new Error("falsy return error")));
        });
        return once(munchy, "error");
      })
      .step(([err]: [Error]) => {
        expect(err.message).to.equal("falsy return error");
      });
  });

  it("should drain an empty stream that ends asynchronously", () => {
    const p = new PassThrough();
    const munchy = new Munchy({}, p, "after", null);
    const { data } = drainIt(munchy);
    setTimeout(() => p.end(), 10);

    return verify({ timeout: 500 })
      .step(() => once(munchy, "end"))
      .step(() => {
        expect(data.map(x => x.toString()).join("")).to.equal("after");
      });
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

  describe("regressions", function () {
    it("should emit end and finish the destination when the consumer is slow", () => {
      const parts = ["a", "b", "c", "d"].map(c => Buffer.from(c.repeat(64)));
      const munchy = new Munchy({ highWaterMark: 16 });
      munchy.munch(...parts, null);

      let ended = false;
      munchy.on("end", () => {
        ended = true;
      });

      const received: Buffer[] = [];
      const slow = new Writable({
        highWaterMark: 16,
        write(chunk, _enc, cb) {
          received.push(chunk);
          setTimeout(cb, 5);
        }
      });

      return verify({ timeout: 500 })
        .step(() => {
          munchy.pipe(slow);
          return once(slow, "finish");
        })
        .step(() => {
          expect(ended).to.equal(true);
          expect(Buffer.concat(received).toString()).to.equal(Buffer.concat(parts).toString());
        });
    });

    it("should unwind the read loop and release the source when destroyed while backpressured", async () => {
      const p = new PassThrough();
      const munchy = new Munchy({ highWaterMark: 64 }, p);
      munchy._read();
      p.write(Buffer.alloc(1024));

      await new Promise(r => setTimeout(r, 10));
      munchy.destroy();
      await new Promise(r => setTimeout(r, 20));

      expect(munchy.destroyed).to.equal(true);
      expect(munchy._reading).to.equal(false);
      expect((munchy as any)._running).to.equal(false);
      expect(p.listenerCount("data")).to.equal(0);
      expect(p.listenerCount("end")).to.equal(0);
      expect(p.listenerCount("error")).to.equal(0);
    });

    it("should pick up sources munched from within a munched handler", () => {
      const munchy = new Munchy();
      const { data } = drainIt(munchy);

      munchy.once("munched", () => {
        munchy.munch("second", null);
      });
      munchy.munch("first");

      return verify({ timeout: 500 })
        .step(() => once(munchy, "end"))
        .step(() => {
          expect(data.map(x => x.toString()).join("")).to.equal("firstsecond");
        });
    });

    it("should treat null opts as absent options, not an end source", () => {
      const munchy = new Munchy(null, "a", "b", null);
      const { data } = drainIt(munchy);

      return verify({ timeout: 500 })
        .step(() => once(munchy, "end"))
        .step(() => {
          expect(data.map(x => x.toString()).join("")).to.equal("ab");
        });
    });

    it("should emit drained after recovering from a source stream error", () => {
      const munchy = new Munchy({
        handleStreamError: err => ({ result: err.message, remit: false })
      });
      const p = new PassThrough();
      const { data } = drainIt(munchy);

      const drained: any[] = [];
      munchy.on("drained", x => drained.push(x));
      munchy.munch(p, null);

      return verify({ timeout: 500 })
        .step(() => {
          munchy.on("draining", () => {
            process.nextTick(() => {
              p.push("oops");
              p.emit("error", new Error("test"));
            });
          });
          return once(munchy, "end");
        })
        .step(() => {
          expect(drained).to.deep.equal([{ stream: p }]);
          expect(data.map(x => x.toString()).join("-")).to.equal("oops-test");
        });
    });

    it("should not consume more sources while backpressured on a handleStreamError result", () => {
      const big = () => Buffer.alloc(4096);
      const p = new PassThrough();
      const munchy = new Munchy(
        {
          highWaterMark: 16,
          handleStreamError: () => ({ result: big(), remit: false })
        },
        p,
        big(),
        big(),
        big(),
        null
      );

      munchy.on("draining", () => {
        process.nextTick(() => p.emit("error", new Error("boom")));
      });
      munchy._read(); // start the loop with nothing consuming

      return verify({
        timeout: 500,
        cleanup: () => {
          munchy.destroy();
          p.destroy();
        }
      })
        .step(() => new Promise(r => setTimeout(r, 30)))
        .step(() => {
          expect(munchy._canPush).to.equal(false);
          expect(munchy._moreSources()).to.equal(true);
          expect(munchy.readableLength).to.equal(4096);
        });
    });

    it("should continue after backpressure on a recovered error result", async () => {
      const source = new PassThrough();
      const munchy = new Munchy(
        {
          highWaterMark: 1,
          handleStreamError: err => ({ result: `[${err.message}]`, remit: false })
        },
        source,
        "tail",
        null
      );
      const chunks: Buffer[] = [];
      const readable = once(munchy, "readable");
      const ended = once(munchy, "end");
      munchy.once("draining", () => {
        process.nextTick(() => source.emit("error", new Error("recover")));
      });

      munchy.read(0);
      await readable;
      munchy.on("data", chunk => chunks.push(chunk));
      await ended;

      expect(Buffer.concat(chunks).toString()).to.equal("[recover]tail");
    });

    it("should stop before pulling a source when destroyed by a draining listener", async () => {
      let pulls = 0;
      const source = {
        async *[Symbol.asyncIterator]() {
          pulls++;
          yield "unused";
        }
      };
      const munchy = new Munchy({}, source);
      const closed = once(munchy, "close");
      munchy.once("draining", () => munchy.destroy());

      munchy.resume();
      await closed;

      expect(munchy.destroyed).to.equal(true);
      expect(pulls).to.equal(0);
    });

    it("should stop a backpressured sync iterable when destroyed", async () => {
      let pulls = 0;
      const source = (function* () {
        pulls++;
        yield { item: 1 };
        pulls++;
        yield { item: 2 };
      })();
      const munchy = new Munchy({ objectMode: true, highWaterMark: 1 }, source);
      const closed = once(munchy, "close");

      munchy.read(0);
      await new Promise(resolve => setImmediate(resolve));
      munchy.destroy();
      await closed;

      expect(pulls).to.equal(1);
    });

    it("should stop a backpressured fallback item when destroyed", async () => {
      const munchy = new Munchy(
        { objectMode: true, highWaterMark: 1 },
        { item: 1 },
        { item: 2 }
      );
      const closed = once(munchy, "close");

      munchy.read(0);
      await new Promise(resolve => setImmediate(resolve));
      expect(munchy.readableLength).to.equal(1);
      munchy.destroy();
      await closed;
    });

    it("should unwind when push destroys the stream", async () => {
      const munchy = new Munchy({}, "item");
      const closed = once(munchy, "close");
      munchy.push = (() => {
        munchy.destroy();
        return false;
      }) as any;

      munchy.read(0);
      await closed;

      expect(munchy.destroyed).to.equal(true);
    });

    it("should pause a Readable source while backpressured", () => {
      let emitted = 0;
      const src = new Readable({
        highWaterMark: 1024,
        read() {
          if (emitted >= 20) {
            this.push(null);
          } else {
            emitted++;
            this.push(Buffer.alloc(1024));
          }
        }
      });

      const munchy = new Munchy({ highWaterMark: 64 }, src);
      munchy._read(); // start the loop with nothing consuming

      return verify({
        timeout: 500,
        cleanup: () => {
          munchy.destroy();
          src.destroy();
        }
      })
        .step(() => new Promise(r => setTimeout(r, 30)))
        .step(() => {
          expect(emitted).to.be.lessThan(20);
        });
    });

    it("should not error on a no-op munch after the stream ended", () => {
      const munchy = new Munchy({}, "hello", null);
      drainIt(munchy);
      const errors: any[] = [];

      return verify({ timeout: 500 })
        .step(() => once(munchy, "end"))
        .step(() => {
          munchy.on("error", err => errors.push(err));
          munchy.munch();
          return new Promise(r => setTimeout(r, 10));
        })
        .step(() => {
          expect(errors).to.deep.equal([]);
        });
    });

    it("should continue after recovering from a rejected promise source", () => {
      const munchy = new Munchy(
        { handleStreamError: err => ({ result: `[${err.message}]`, remit: false }) },
        Promise.reject(new Error("nope")),
        "after",
        null
      );
      const { data } = drainIt(munchy);

      return verify({ timeout: 500 })
        .step(() => once(munchy, "end"))
        .step(() => {
          expect(data.map(x => x.toString()).join("")).to.equal("[nope]after");
        });
    });

    it("should drain a legacy stream with no pause/resume", () => {
      const legacy: any = new EventEmitter();
      legacy.pipe = () => {};
      const munchy = new Munchy({}, legacy, "tail", null);
      const { data } = drainIt(munchy);

      setTimeout(() => {
        legacy.emit("data", "L1");
        legacy.emit("data", "L2");
        legacy.emit("end");
      }, 5);

      return verify({ timeout: 500 })
        .step(() => once(munchy, "end"))
        .step(() => {
          expect(data.map(x => x.toString()).join("-")).to.equal("L1-L2-tail");
        });
    });

    it("should error on a legacy stream that emits error w/o an Error object", () => {
      const legacy: any = new EventEmitter();
      legacy.pipe = () => {};
      const munchy = new Munchy({}, legacy);
      drainIt(munchy);

      return verify({ timeout: 500 })
        .step(() => {
          setTimeout(() => legacy.emit("error"), 5);
          return once(munchy, "error");
        })
        .step(([err]: [Error]) => {
          expect(err.message).toContain("source stream emitted error");
        });
    });

    describe("finished, ending, and failing sources", function () {
      const text = (data: any[]) => data.map(x => x.toString()).join("");
      const recover = { handleStreamError: (err: any) => ({ result: `[${err.message}]`, remit: false }) };

      it("should move past a source stream that already ended", () => {
        const src = new Readable({ read() {}, autoDestroy: false });
        const ended = signal<void>();
        let output: { data: any[] };

        return verify({ timeout: 500, signals: { ended } })
          .step(() => {
            src.push(null);
            src.resume();
            return once(src, "end");
          })
          .step(() => {
            const munchy = new Munchy({}, src, "after", null);
            output = drainIt(munchy);
            munchy.once("end", () => ended.resolve());
          })
          .awaiting(ended)
          .step(() => expect(text(output.data)).to.equal("after"));
      });

      it("should treat a source stream destroyed without error as ended", () => {
        const src = new PassThrough();
        const ended = signal<void>();
        let output: { data: any[] };

        return verify({ timeout: 500, signals: { ended } })
          .step(() => {
            src.destroy();
            return once(src, "close");
          })
          .step(() => {
            const munchy = new Munchy({}, src, "after", null);
            output = drainIt(munchy);
            munchy.once("end", () => ended.resolve());
          })
          .awaiting(ended)
          .step(() => expect(text(output.data)).to.equal("after"));
      });

      it("should emit the error of a source stream destroyed with error", () => {
        const src = new PassThrough();
        src.on("error", () => {});

        return verify({ timeout: 500 })
          .step(() => {
            src.destroy(new Error("gone"));
            return new Promise(r => src.once("close", r));
          })
          .expectErrorToBe("gone")
          .step(() => {
            const munchy = new Munchy({}, src, "after", null);
            drainIt(munchy);
            return once(munchy, "end");
          });
      });

      it("should hand a source stream destroyed with error to handleStreamError", () => {
        const src = new PassThrough();
        src.on("error", () => {});
        const ended = signal<void>();
        let output: { data: any[] };

        return verify({ timeout: 500, signals: { ended } })
          .step(() => {
            src.destroy(new Error("gone"));
            return new Promise(r => src.once("close", r));
          })
          .step(() => {
            const munchy = new Munchy(recover, src, "after", null);
            output = drainIt(munchy);
            munchy.once("end", () => ended.resolve());
          })
          .awaiting(ended)
          .step(() => expect(text(output.data)).to.equal("[gone]after"));
      });

      const endingSources = {
        "a promise that resolves null": () => Promise.resolve(null),
        "a sync iterable that yields null": () => ["b", null, "c"],
        "an async iterable that yields null": () =>
          (async function* () {
            yield "b";
            yield null;
            yield "c";
          })()
      };

      for (const [name, make] of Object.entries(endingSources)) {
        it(`should stop the read loop when ${name} ends the stream`, () => {
          const ended = signal<void>();
          let munchy: Munchy;
          let output: { data: any[] };

          return verify({ timeout: 500, signals: { ended }, cleanup: () => munchy?.destroy() })
            .step(() => {
              munchy = new Munchy({ autoDestroy: false }, "a", make(), "d");
              output = drainIt(munchy);
              munchy.once("end", () => ended.resolve());
            })
            .awaiting(ended)
            .step(() => new Promise(r => setImmediate(r)))
            .step(() => expect((munchy as any)._running).to.equal(false))
            .step(() => expect(text(output.data)).to.match(/^ab?$/));
        });
      }

      it("should close an async iterable that ends the stream with null", () => {
        let closed = false;
        const source = (async function* () {
          try {
            yield null;
            yield "unused";
          } finally {
            closed = true;
          }
        })();
        const ended = signal<void>();
        let munchy: Munchy;

        return verify({ timeout: 500, signals: { ended }, cleanup: () => munchy?.destroy() })
          .step(() => {
            munchy = new Munchy({ autoDestroy: false }, source);
            drainIt(munchy);
            munchy.once("end", () => ended.resolve());
          })
          .awaiting(ended)
          .step(() => new Promise(r => setImmediate(r)))
          .step(() => expect(closed).to.equal(true));
      });

      it("should not raise unhandledRejection for a queued promise that rejects early", () => {
        const rejections: any[] = [];
        const onRejection = (reason: any) => rejections.push(reason);
        let rejectLate!: (err: Error) => void;
        const late = new Promise((_resolve, reject) => {
          rejectLate = reject;
        });
        const gate = new PassThrough();
        const ended = signal<void>();
        let output: { data: any[] };

        return verify({
          timeout: 500,
          signals: { ended },
          cleanup: () => {
            process.off("unhandledRejection", onRejection);
          }
        })
          .step(() => {
            process.on("unhandledRejection", onRejection);
            const munchy = new Munchy(recover, gate, late, "after", null);
            output = drainIt(munchy);
            munchy.once("end", () => ended.resolve());
          })
          .step(() => {
            rejectLate(new Error("late"));
            return new Promise(r => setTimeout(r, 20));
          })
          .step(() => expect(rejections).to.deep.equal([]))
          .step(() => {
            gate.end();
          })
          .awaiting(ended)
          .step(() => expect(text(output.data)).to.equal("[late]after"));
      });

      const failingSources = {
        "a sync iterable that throws": {
          make: () =>
            (function* () {
              yield "b";
              throw new Error("iter boom");
            })(),
          message: "iter boom"
        },
        "a locked web stream": {
          make: () => {
            const web = new ReadableStream({
              start(controller) {
                controller.enqueue("w");
                controller.close();
              }
            });
            web.getReader();
            return web;
          },
          message: "locked"
        }
      };

      for (const [name, { make, message }] of Object.entries(failingSources)) {
        it(`should emit error and not end for ${name}`, () => {
          const closed = signal<void>();
          let ended = false;
          let output: { data: any[] };

          return verify({ timeout: 500, signals: { closed } })
            .expectErrorHas(message)
            .step(() => {
              const munchy = new Munchy({}, "a", make(), "tail", null);
              output = drainIt(munchy);
              munchy.on("end", () => {
                ended = true;
              });
              munchy.once("close", () => closed.resolve());
              return once(munchy, "end");
            })
            .awaiting(closed)
            .step(() => expect(ended).to.equal(false))
            .step(() => expect(text(output.data)).not.to.contain("tail"));
        });
      }
    });
  });
});
