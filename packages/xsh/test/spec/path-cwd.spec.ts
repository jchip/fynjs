import { describe, it, expect } from "vitest";
import Path from "node:path";
import xsh from "../../src/index.ts";

describe("path-cwd", function () {
  it("should leave path w/o cwd as is", () => {
    expect(xsh.pathCwd.remove("/test/foo/blah")).to.equal("/test/foo/blah");
  });

  it("remove cwd from path", () => {
    expect(xsh.pathCwd.remove(Path.resolve("foo", "bar"))).to.equal(Path.normalize("/foo/bar"));
  });

  it("remove all cwd from path with g flag", () => {
    const x = Path.resolve("foo", "bar");
    const e = Path.normalize("/foo/bar");

    expect(xsh.pathCwd.remove(`${x} ${x}`, "g")).to.equal(`${e} ${e}`);
  });

  it("replace cwd from path", () => {
    expect(xsh.pathCwd.replace(Path.resolve("foo", "bar"))).to.equal(Path.normalize("CWD/foo/bar"));
    expect(xsh.pathCwd.replace(Path.resolve("foo", "bar"), "$")).to.equal(
      Path.normalize("$/foo/bar")
    );
  });

  it("replace all cwd from path with g flag", () => {
    const x = Path.resolve("foo", "bar");
    const e1 = Path.normalize("CWD/foo/bar");
    const e2 = Path.normalize("$/foo/bar");

    expect(xsh.pathCwd.replace(`${x} ${x}`, false, "g")).to.equal(`${e1} ${e1}`);
    expect(xsh.pathCwd.replace(`${x} ${x}`, "$", "g")).to.equal(`${e2} ${e2}`);
  });

  it("remove should strip leading /", () => {
    expect(xsh.pathCwd.remove(Path.resolve("foo"), "", true)).to.equal("foo");
  });

  describe("cwd with regex metacharacters", function () {
    const withCwd = (cwd: string, fn: () => void) => {
      const orig = process.cwd;
      process.cwd = () => cwd;
      try {
        fn();
      } finally {
        process.cwd = orig;
      }
    };

    it("removes a cwd containing parens", () => {
      const cwd = Path.normalize("/tmp/my (project)");
      withCwd(cwd, () => {
        expect(xsh.pathCwd.remove(Path.join(cwd, "lib", "a.js"))).to.equal(
          Path.normalize("/lib/a.js")
        );
      });
    });

    it("removes a cwd containing a plus", () => {
      const cwd = Path.normalize("/tmp/a+b");
      withCwd(cwd, () => {
        expect(xsh.pathCwd.remove(Path.join(cwd, "x"))).to.equal(Path.normalize("/x"));
      });
    });

    it("removes a cwd containing brackets", () => {
      const cwd = Path.normalize("/tmp/a[1]");
      withCwd(cwd, () => {
        expect(xsh.pathCwd.remove(Path.join(cwd, "x"))).to.equal(Path.normalize("/x"));
      });
    });

    it("does not let a dot in cwd match any character", () => {
      const cwd = Path.normalize("/tmp/fyn.js");
      withCwd(cwd, () => {
        const other = Path.join(Path.normalize("/tmp/fynXjs"), "lib", "a.js");
        expect(xsh.pathCwd.replace(other)).to.equal(other);
        expect(xsh.pathCwd.replace(Path.join(cwd, "lib", "a.js"))).to.equal(
          Path.normalize("CWD/lib/a.js")
        );
      });
    });
  });
});
