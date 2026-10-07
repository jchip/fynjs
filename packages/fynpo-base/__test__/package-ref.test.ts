import { describe, it, expect } from "vitest";
import { verify } from "run-verify";
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

describe("PackageRef values with colons and stateful regexps", () => {
  const pkg = { name: "foo", version: "1.0.0", path: "a:b/foo" };

  it("keeps everything after the first colon as the value", () => {
    return verify({ timeout: 1000 })
      .step(() => new PackageRef("path:a:b/*"))
      .keep.step((ref) => expect(ref.value).toBe("a:b/*"))
      .step((ref) => expect(ref.match(pkg)).toBe(true));
  });

  it("parses a regexp that contains a colon", () => {
    return verify({ timeout: 1000 })
      .step(() => new PackageRef("name:/^(?:foo|bar)$/"))
      .keep.step((ref) => expect(ref.regex?.source).toBe("^(?:foo|bar)$"))
      .step((ref) => expect(ref.match(pkg)).toBe(true));
  });

  it("matches the same package every time with a g-flag regexp", () => {
    return verify({ timeout: 1000 })
      .step(() => new PackageRef("name:/foo/g"))
      .keep.step((ref) => expect(ref.match(pkg)).toBe(true))
      .step((ref) => expect(ref.match(pkg)).toBe(true));
  });
});
