import NSOrder from "../../lib/ns-order.js";
import { expect } from "vitest";

describe("ns-order", function() {
  it("should order namespaces according to overrides specs", () => {
    const nsOrder = new NSOrder();
    const a = nsOrder.add("hello");
    expect(a).toStrictEqual(["hello"]);
    const b = nsOrder.add("world");
    expect(b).toStrictEqual(["hello", "world"]);
    const c = nsOrder.add("foo", "hello");
    expect(c).toStrictEqual(["foo", "hello", "world"]);
    nsOrder.add("bar", ["hello", "world"]);
    const d = nsOrder.add("bar", "blah");
    expect(d).toStrictEqual(["foo", "bar", "hello", "world"]);
    const e = nsOrder.add("blah", "foo");
    expect(e).toStrictEqual(["bar", "blah", "foo", "hello", "world"]);
  });

  it("should detect first level circular override", () => {
    const nsOrder = new NSOrder();
    nsOrder.add("hello", "world");
    expect(() => nsOrder.add("world", "hello")).toThrow(
      "circular namespace override between 'world' and 'hello'"
    );
  });

  it("should detect non first level circular override", () => {
    const nsOrder = new NSOrder();
    nsOrder.add("hello", "world");
    nsOrder.add("world", "blah");
    expect(() => nsOrder.add("blah", "hello")).toThrow("there may be circular overrides");
  });
});
