import { describe, it, expect } from "vitest";
import { InflightStore, Inflight } from "../../src/index.js";

describe("InflightStore", () => {
  it("stores arbitrary values, not just promises", () => {
    const store = new InflightStore<{ item: string }>();
    const value = { item: "hello" };

    expect(store.add("a", value)).toBe(value);
    expect(store.get("a")).toBe(value);
    expect(store.get("missing")).toBe(undefined);
  });

  it("accepts number and symbol keys", () => {
    // item-queue keys by an incrementing number, which the string-only signature rejected
    const store = new InflightStore<string>();
    const sym = Symbol("s");

    store.add(1, "one");
    store.add(sym, "sym");

    expect(store.get(1)).toBe("one");
    expect(store.get(sym)).toBe("sym");
    expect(store.count).toBe(2);

    store.remove(1);
    expect(store.get(1)).toBe(undefined);
    expect(store.count).toBe(1);
  });

  it("names a symbol key in its error messages instead of throwing on it", () => {
    // `${symbol}` is a TypeError - the messages must String() the key
    const store = new InflightStore<string>();
    const sym = Symbol("boom");

    store.add(sym, "x");
    expect(() => store.add(sym, "y")).toThrow(/Symbol\(boom\) already exist/);
    expect(() => store.remove(Symbol("gone"))).toThrow(/removing non-existing item Symbol\(gone\)/);
  });

  it("exposes entries() for sweeping every tracked item", () => {
    const store = new InflightStore<string>();
    store.add("a", "1");
    store.add(2, "2");

    expect([...store.entries()].map(([k, v]) => [k, v.value])).toEqual([
      ["a", "1"],
      [2, "2"],
    ]);
  });

  it("resetCheckTime with no key resets every item", () => {
    const store = new InflightStore<string>();
    const now = Date.now();
    store.add("a", "1", now - 500);
    store.add("b", "2", now - 500);

    expect(store.lastCheckTime("a", now)).toBe(500);
    expect(store.lastCheckTime("b", now)).toBe(500);

    store.resetCheckTime(undefined, now);

    expect(store.lastCheckTime("a", now)).toBe(0);
    expect(store.lastCheckTime("b", now)).toBe(0);
    // start time is untouched by a check-time reset
    expect(store.time("a", now)).toBe(500);
  });

  it("tracks time and reports -1 for unknown keys", () => {
    const store = new InflightStore<string>();
    const now = Date.now();
    store.add("a", "1", now - 30);

    expect(store.getStartTime("a")).toBe(now - 30);
    expect(store.getCheckTime("a")).toBe(now - 30);
    expect(store.time("a", now)).toBe(30);
    expect(store.elapseTime("a", now)).toBe(30);
    expect(store.elapseCheckTime("a", now)).toBe(30);

    expect(store.time("nope")).toBe(-1);
    expect(store.lastCheckTime("nope")).toBe(-1);
    expect(store.getStartTime("nope")).toBe(undefined);
    expect(store.getCheckTime("nope")).toBe(undefined);
  });

  it("Inflight is an InflightStore that adds promise dedup", () => {
    const ifl = new Inflight<string>();
    expect(ifl).toBeInstanceOf(InflightStore);

    let calls = 0;
    const factory = () => {
      calls++;
      return Promise.resolve("v");
    };
    const a = ifl.promise("k", factory);
    const b = ifl.promise("k", factory);

    expect(a).toBe(b);
    expect(calls).toBe(1);
  });
});
