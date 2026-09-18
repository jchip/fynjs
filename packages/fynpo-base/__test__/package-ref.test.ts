import { describe, it, expect } from "vitest";
import { PackageRef } from "../src/fynpo-dep-graph.js";

describe("PackageRef", () => {
  it.each([
    [" foo ", "name", "foo"],
    ["@scope/foo", "name", "@scope/foo"],
    ["foo@1.2.3", "id", "foo@1.2.3"],
    ["@scope/foo@1.2.3", "id", "@scope/foo@1.2.3"],
    [" name: foo ", "name", "foo"],
    ["id:foo@1.2.3", "id", "foo@1.2.3"],
    ["path: packages/* ", "path", "packages/*"],
  ])("parses %s as %s", (input, type, value) => {
    const ref = new PackageRef(input);
    expect(ref.type).toBe(type);
    expect(ref.value).toBe(value);
  });

  const matching = { name: "@scope/foo", version: "1.2.3", path: "packages/foo" };
  const other = { name: "@scope/bar", version: "4.5.6", path: "tools/bar" };

  it.each([
    "@scope/foo",
    "id:@scope/foo@1.2.3",
    "path:packages/foo",
    "path:packages/*",
    "name:/FOO$/i",
    "id:/@1\\.2\\.3$/",
    "path:/^packages\\//",
  ])("matches the intended package for %s", (input) => {
    const ref = new PackageRef(input);
    expect(ref.match(matching)).toBe(true);
    expect(ref.match(other)).toBe(false);
  });

  it("keeps a name without a closing regexp delimiter literal", () => {
    const ref = new PackageRef("/foo");
    expect(ref.regex).toBeUndefined();
    expect(ref.match({ ...matching, name: "/foo" })).toBe(true);
    expect(ref.match(matching)).toBe(false);
  });

  it("rejects an unknown reference type", () => {
    expect(() => new PackageRef("version:1.2.3")).toThrow(
      "unknown type 'version' - must be 'id', 'path', or 'name'"
    );
  });
});
