import { describe, it, expect, afterEach } from "vitest";
import Confippet from "../../src/index.js";
import { composedResult } from "../composed-result.js";

const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
  delete process.env.TEST_N;
});

describe("store", () => {
  it("should create a config store", () => {
    const store = Confippet.store();
    store._$.use({
      foo: {
        x: {
          val: ["bar", "blah", "hello"]
        }
      }
    });

    store._$.defaults({
      d: {
        val: [
          {
            foo: {
              x: 10
            }
          },
          {
            hello: "world"
          }
        ]
      },
      foo: {
        x: "oops",
        bar: "hello"
      }
    });

    expect(store.$("foo.x.val.0")).toBe("bar");
    expect(store.$("foo.x.val.1")).toBe("blah");
    expect(store.$("foo.x.val.2")).toBe("hello");
    expect(store.$([])).toBeUndefined();
    expect(store.$("")).toBeUndefined();
    expect(store.$(true)).toBeUndefined();
    expect(store.$(5)).toBeUndefined();

    expect(store.d.val[0].foo.x).toBe(10);
    expect(store.$("d.val.0.foo.x")).toBe(10);
    expect(store.$("foo.bar")).toBe("hello");

    store._$.use({
      foo: {
        x: {
          val: "500"
        }
      },
      p: {
        y: [
          "{{config.foo.x.val}}",
          {
            k: "{{config.foo.bar}}"
          },
          {
            n: "{{env.TEST_N}}"
          }
        ]
      }
    });

    expect(store.$("foo.x.val")).toBe("500");
    process.env.TEST_N = "nn1";
    store._$.process();
    delete process.env.TEST_N;
    expect(store.$("p.y.0")).toBe("500");
    expect(store.$("p.y.1.k")).toBe("hello");
    expect(store.$("p.y.2.n")).toBe("nn1");

    store._$.reset();
    expect(store).toEqual({});
  });

  it("should compose into the store", () => {
    const store = Confippet.store();

    store._$.compose({
      dir: "test/config"
    });

    const result: any = composedResult();
    delete result.instance0;

    expect({ ...store }).toEqual(result);
    expect(store.$("arr[0]")).toBe("js");
    expect(store.$("arr[1]")).toBe(1);
    expect(store.$("arr[2].b")).toBe(50);
  });

  it("keeps $ and _$ off the store's own enumerable keys", () => {
    const store = Confippet.store();
    expect(Object.keys(store)).toEqual([]);
    expect(typeof store.$).toBe("function");
    expect(typeof store._$.use).toBe("function");
  });

  it("reset keeps the same store object identity", () => {
    const store = Confippet.store();
    store._$.use({ a: 1 });
    const same = store;
    store._$.reset();
    expect(store).toBe(same);
    expect(typeof store.$).toBe("function");
  });
});
