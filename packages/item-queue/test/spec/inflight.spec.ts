import { describe, it, expect } from "vitest";
import { Inflight } from "../../src/index.ts";

describe("inflight", () => {
  it("should add item with start and check time from NOW", () => {
    const now = Date.now();
    const ifl = new Inflight();

    ifl.add("test", "hello");
    expect(ifl.get("test")).toBe("hello");

    expect(ifl.getStartTime("test")).toBeGreaterThanOrEqual(now);
    expect(ifl.getCheckTime("test")).toBeGreaterThanOrEqual(now);
    expect(ifl.getStartTime("foo")).toBe(undefined);
    expect(ifl.getCheckTime("foo")).toBe(undefined);
  });

  it("should handle start and elapse time", async () => {
    const ifl = new Inflight();

    expect(ifl.elapseTime("missing")).toBe(-1);
    // with now
    const now = Date.now();
    ifl.add("test", "hello", now - 5);
    expect(ifl.get("test")).toBe("hello");
    expect(ifl.elapseTime("test", now)).toBe(5);
    // without now
    ifl.add("foo", "bar");
    await new Promise((resolve) => setTimeout(resolve, 15));
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

    expect(ifl.get("test")).toBe(undefined);
    ifl.remove("foo");
    expect(ifl.get("foo")).toBe(undefined);

    expect(ifl.count).toBe(0);
    expect(ifl.isEmpty).toBe(true);
  });

  it("should handle last check time", async () => {
    const ifl = new Inflight();
    ifl.add("test", "hello");
    await new Promise((resolve) => setTimeout(resolve, 15));

    expect(ifl.lastCheckTime("test")).toBeGreaterThanOrEqual(10);
    expect(ifl.elapseCheckTime("test")).toBeGreaterThanOrEqual(10);
    // bad item
    expect(ifl.lastCheckTime("foo")).toBe(-1);

    // with now provided
    const now = Date.now();
    ifl.resetCheckTime("test", now - 5);
    expect(ifl.elapseCheckTime("test", now)).toBe(5);
    // without now
    ifl.resetCheckTime("test");
    expect(ifl.elapseCheckTime("test")).toBeLessThanOrEqual(5);
  });
});
