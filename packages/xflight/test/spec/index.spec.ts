import { describe, it, expect } from "vitest";
import Inflight from "../../src/index.js";

describe("inflight", () => {
  it("should add item with start and check time from NOW", () => {
    const now = Date.now();
    const ifl = new Inflight();

    ifl.add("test", "hello");
    expect(ifl.get("test")).toBe("hello");

    expect(ifl.getStartTime("test")).toBeGreaterThanOrEqual(now);
    expect(ifl.getCheckTime("test")).toBeGreaterThanOrEqual(now);
    expect(ifl.getStartTime("foo")).toBeUndefined();
    expect(ifl.getCheckTime("foo")).toBeUndefined();
  });

  it("should handle start and elapse time", async () => {
    const ifl = new Inflight();

    expect(ifl.elapseTime()).toBe(-1);
    // with now
    const now = Date.now();
    ifl.add("test", "hello", now - 5);
    expect(ifl.get("test")).toBe("hello");
    expect(ifl.elapseTime("test", now)).toBe(5);
    // without now
    ifl.add("foo", "bar");
    await new Promise((res) => setTimeout(res, 10));
    expect(ifl.elapseTime("foo")).toBeGreaterThanOrEqual(10);
  });

  it("should remove item", () => {
    const ifl = new Inflight();
    expect(ifl.isEmpty).toBe(true);

    ifl.add("foo", "bar");
    expect(ifl.isEmpty).toBe(false);
    ifl.add("test", "hello");
    expect(ifl.count).toBe(2);
    expect(ifl.get("foo")).toBe("bar");
    expect(ifl.get("test")).toBe("hello");

    ifl.remove("test");
    expect(ifl.count).toBe(1);

    expect(ifl.get("test")).toBeUndefined();
    ifl.remove("foo");
    expect(ifl.get("foo")).toBeUndefined();

    expect(ifl.count).toBe(0);
    expect(ifl.isEmpty).toBe(true);
  });

  it("should handle last check time", async () => {
    const ifl = new Inflight();
    ifl.add("test", "hello");
    await new Promise((res) => setTimeout(res, 10));
    expect(ifl.lastCheckTime("test")).toBeGreaterThanOrEqual(10);
    expect(ifl.elapseCheckTime("test")).toBeGreaterThanOrEqual(10);
    // bad item
    expect(ifl.lastCheckTime("foo")).toBe(-1);

    // with now provided
    const now = Date.now();
    ifl.resetCheckTime().resetCheckTime("test", now - 5);
    expect(ifl.elapseCheckTime("test", now)).toBe(5);
    // without now
    ifl.resetCheckTime("test");
    expect(ifl.elapseCheckTime("test")).toBe(0);
  });

  it("should run a promise returning function", async () => {
    let n = 0;
    const delay = () => {
      n++;
      return new Promise((resolve) => {
        setTimeout(() => resolve(Date.now()), 30);
      });
    };

    const ifl = new Inflight();
    const a = ifl.promise("test", delay);
    const b = ifl.promise("test", delay);
    const r = await Promise.all([a, b]);
    expect(n).toBe(1);
    expect(r[0]).toBe(r[1]);
    expect(ifl.get("test")).toBeUndefined();
  });

  it("should handle a function not returning promise", async () => {
    let err;
    const ifl = new Inflight();
    await ifl.promise("test", () => "foo").catch((e) => (err = e));
    expect(err).toBeTruthy();
    expect(err.message).toContain("test didn't return a promise");
  });

  it("should handle a function throwing", async () => {
    let err;
    const ifl = new Inflight();
    await ifl
      .promise("test", () => {
        throw new Error("foo");
      })
      .catch((e) => (err = e));
    expect(err).toBeTruthy();
    expect(err.message).toBe("foo");
  });
});
