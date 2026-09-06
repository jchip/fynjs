import { describe, it, expect } from "vitest";
import { InflightStore, Inflight } from "../../src/index.js";

//
// jchip/xflight#1.
//
// The backing store used to be a plain object (`_inflights: Record<string, ...> = {}`), so a
// key naming an Object.prototype member resolved to the inherited member rather than to a
// tracked item. `promise("toString", factory)` found Object.prototype.toString, took it for a
// live record, and returned its `.value` - undefined - without ever calling the factory. The
// caller got `undefined` where it awaited a promise, and the work never ran.
//
// 54f3c1bc replaced the object with a Map, which fixed it. Nothing tested it, so nothing kept
// it fixed - these do.
//
const PROTO_KEYS = [
  "__proto__",
  "toString",
  "valueOf",
  "constructor",
  "hasOwnProperty",
  "isPrototypeOf"
];

describe("keys that collide with Object.prototype (jchip/xflight#1)", () => {
  it("reports nothing tracked under them before anything is added", () => {
    const store = new InflightStore<string>();

    for (const key of PROTO_KEYS) {
      expect(store.get(key)).toBe(undefined);
      expect(store.getStartTime(key)).toBe(undefined);
      expect(store.getCheckTime(key)).toBe(undefined);
      expect(store.time(key)).toBe(-1);
    }

    expect(store.isEmpty).toBe(true);
    expect(store.count).toBe(0);
  });

  it("tracks, reads back and removes each one independently", () => {
    const store = new InflightStore<string>();

    for (const key of PROTO_KEYS) {
      store.add(key, `value:${key}`);
    }

    expect(store.count).toBe(PROTO_KEYS.length);
    for (const key of PROTO_KEYS) {
      expect(store.get(key)).toBe(`value:${key}`);
    }
    expect([...store.entries()].map(([key]) => key)).toStrictEqual(PROTO_KEYS);

    for (const key of PROTO_KEYS) {
      store.remove(key);
    }
    expect(store.isEmpty).toBe(true);
  });

  it("still rejects a duplicate add under such a key", () => {
    const store = new InflightStore<string>();

    store.add("toString", "first");
    expect(() => store.add("toString", "second")).toThrow(/already exist/);
  });

  it("still rejects removing one that was never added", () => {
    const store = new InflightStore<string>();

    expect(() => store.remove("valueOf")).toThrow(/removing non-existing item/);
  });

  it("does not reach Object.prototype through a __proto__ key", () => {
    const store = new InflightStore<Record<string, string>>();

    store.add("__proto__", { polluted: "yes" });

    expect(({} as Record<string, unknown>).polluted).toBe(undefined);
    expect(store.get("__proto__")).toStrictEqual({ polluted: "yes" });
  });

  it("dedupes inflight work under such a key instead of handing back the inherited member", async () => {
    const inflight = new Inflight<string>();
    let calls = 0;
    const factory = async () => {
      calls++;
      return "real value";
    };

    const first = inflight.promise("toString", factory);
    const second = inflight.promise("toString", factory);

    // the pre-Map implementation returned undefined here, with calls still at 0
    expect(first).toBeInstanceOf(Promise);
    expect(second).toBe(first);
    expect(calls).toBe(1);

    expect(await first).toBe("real value");
    expect(inflight.isEmpty).toBe(true);
  });
});
