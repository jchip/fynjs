import { describe, it, expect } from "vitest";
import Inflight from "../../src/index.js";

describe("Inflight", () => {
  it("should use native Promise by default", () => {
    const ifl = new Inflight();
    expect(ifl.Promise).toBe(globalThis.Promise);
  });

  it("should accept custom Promise implementation", () => {
    const CustomPromise = Promise;
    const ifl = new Inflight(CustomPromise);
    expect(ifl.Promise).toBe(CustomPromise);
  });

  it("should add item with start and check time", () => {
    const now = Date.now();
    const ifl = new Inflight<string>();
    const p = Promise.resolve("hello");

    ifl.add("test", p);
    expect(ifl.get("test")).toBe(p);

    expect(ifl.getStartTime("test")).toBeGreaterThanOrEqual(now);
    expect(ifl.getCheckTime("test")).toBeGreaterThanOrEqual(now);
    expect(ifl.getStartTime("foo")).toBeUndefined();
    expect(ifl.getCheckTime("foo")).toBeUndefined();
  });

  it("should handle start and elapse time", async () => {
    const ifl = new Inflight<string>();

    expect(ifl.elapseTime("nonexistent")).toBe(-1);
    expect(ifl.time("nonexistent")).toBe(-1);

    const now = Date.now();
    ifl.add("test", Promise.resolve("hello"), now - 5);
    expect(ifl.elapseTime("test", now)).toBe(5);
    expect(ifl.time("test", now)).toBe(5);

    ifl.add("foo", Promise.resolve("bar"));
    await new Promise((res) => setTimeout(res, 10));
    expect(ifl.elapseTime("foo")).toBeGreaterThanOrEqual(10);
  });

  it("should track isEmpty and count", () => {
    const ifl = new Inflight<string>();
    expect(ifl.isEmpty).toBe(true);
    expect(ifl.count).toBe(0);

    ifl.add("foo", Promise.resolve("bar"));
    expect(ifl.isEmpty).toBe(false);
    expect(ifl.count).toBe(1);

    ifl.add("test", Promise.resolve("hello"));
    expect(ifl.count).toBe(2);
  });

  it("should remove items correctly", () => {
    const ifl = new Inflight<string>();

    ifl.add("foo", Promise.resolve("bar"));
    ifl.add("test", Promise.resolve("hello"));
    expect(ifl.count).toBe(2);

    ifl.remove("test");
    expect(ifl.count).toBe(1);
    expect(ifl.get("test")).toBeUndefined();

    ifl.remove("foo");
    expect(ifl.count).toBe(0);
    expect(ifl.isEmpty).toBe(true);
  });

  it("should throw when adding duplicate key", () => {
    const ifl = new Inflight<string>();
    ifl.add("test", Promise.resolve("hello"));

    expect(() => ifl.add("test", Promise.resolve("world"))).toThrow(
      "xflight: item test already exist"
    );
  });

  it("should throw when removing non-existing item", () => {
    const ifl = new Inflight<string>();

    expect(() => ifl.remove("nonexistent")).toThrow(
      "xflight: removing non-existing item nonexistent"
    );
  });

  it("should handle last check time", async () => {
    const ifl = new Inflight<string>();
    ifl.add("test", Promise.resolve("hello"));

    await new Promise((res) => setTimeout(res, 10));
    expect(ifl.lastCheckTime("test")).toBeGreaterThanOrEqual(10);
    expect(ifl.elapseCheckTime("test")).toBeGreaterThanOrEqual(10);

    expect(ifl.lastCheckTime("nonexistent")).toBe(-1);

    const now = Date.now();
    ifl.resetCheckTime("test", now - 5);
    expect(ifl.elapseCheckTime("test", now)).toBe(5);

    ifl.resetCheckTime("test");
    expect(ifl.elapseCheckTime("test")).toBeLessThanOrEqual(1);
  });

  it("should reset check time for all items", async () => {
    const ifl = new Inflight<string>();
    ifl.add("a", Promise.resolve("1"));
    ifl.add("b", Promise.resolve("2"));

    await new Promise((res) => setTimeout(res, 10));
    expect(ifl.elapseCheckTime("a")).toBeGreaterThanOrEqual(10);
    expect(ifl.elapseCheckTime("b")).toBeGreaterThanOrEqual(10);

    ifl.resetCheckTime();
    expect(ifl.elapseCheckTime("a")).toBeLessThanOrEqual(1);
    expect(ifl.elapseCheckTime("b")).toBeLessThanOrEqual(1);
  });

  it("should silently ignore resetCheckTime for non-existent key", () => {
    const ifl = new Inflight<string>();
    // Should not throw
    expect(() => ifl.resetCheckTime("nonexistent")).not.toThrow();
    // Chaining should still work
    expect(ifl.resetCheckTime("nonexistent")).toBe(ifl);
  });

  it("should deduplicate concurrent promise calls", async () => {
    let callCount = 0;
    const delay = () => {
      callCount++;
      return new Promise<number>((resolve) => {
        setTimeout(() => resolve(Date.now()), 30);
      });
    };

    const ifl = new Inflight<number>();
    const a = ifl.promise("test", delay);
    const b = ifl.promise("test", delay);

    expect(a).toBe(b);
    const [r1, r2] = await Promise.all([a, b]);
    expect(callCount).toBe(1);
    expect(r1).toBe(r2);
    expect(ifl.get("test")).toBeUndefined();
  });

  it("should cleanup after promise resolves", async () => {
    const ifl = new Inflight<string>();
    const p = ifl.promise("test", () => Promise.resolve("done"));

    expect(ifl.get("test")).toBeDefined();
    await p;
    await new Promise((res) => setTimeout(res, 0));
    expect(ifl.get("test")).toBeUndefined();
  });

  it("should cleanup after promise rejects", async () => {
    const ifl = new Inflight<string>();
    const p = ifl.promise("test", () => Promise.reject(new Error("fail")));

    expect(ifl.get("test")).toBeDefined();
    await p.catch(() => {});
    await new Promise((res) => setTimeout(res, 0));
    expect(ifl.get("test")).toBeUndefined();
  });

  it("should reject when factory doesn't return promise", async () => {
    const ifl = new Inflight<string>();
    const p = ifl.promise("test", (() => "not a promise") as any);

    await expect(p).rejects.toThrow("didn't return a promise");
  });

  it("should reject when factory throws", async () => {
    const ifl = new Inflight<string>();
    const p = ifl.promise("test", () => {
      throw new Error("factory error");
    });

    await expect(p).rejects.toThrow("factory error");
  });
});
