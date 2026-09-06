import { describe, it, expect } from "vitest";
import pathUpEach from "../../../lib/util/path-up-each";

describe("path-up-each", function() {
  it("should return empty if path immediately triggers stop", () => {
    const found = pathUpEach("/test/foo", ["foo"]);
    expect(found).toStrictEqual([]);
  });

  it("should find one if stopping triggers on first up", () => {
    const found = pathUpEach("/test/foo/blah", ["foo"]);
    expect(found).toStrictEqual(["/test/foo/blah"]);
  });

  it("should take callback for stopping", () => {
    const found = pathUpEach("/test/foo/bar", x => x === "/test");
    expect(found).toStrictEqual(["/test/foo/bar", "/test/foo"]);
  });

  it("should stop if can't cd .. further", () => {
    let found = pathUpEach("", ["foo"]);
    expect(found).toStrictEqual([]);
    found = pathUpEach("/foo/test", []);
    expect(found).toStrictEqual(["/foo/test", "/foo", "/"]);
    found = pathUpEach("foo/test", []);
    expect(found).toStrictEqual(["foo/test", "foo"]);
  });
});
