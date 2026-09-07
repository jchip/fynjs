import fs from "fs";
import xrun from "../../lib/index.js";
import { expect } from "vitest";

describe("index", function() {
  it("should export a default instance", () => {
    expect(xrun).toEqual(expect.anything());
  });

  describe("concurrent", function() {
    it("should create concurrent array from variadic params", () => {
      const t1 = xrun.concurrent("a", "b");
      expect(t1[0].toString()).toBe("Symbol(concurrent)");
      expect(t1.slice(1)).toStrictEqual(["a", "b"]);
    });

    it("should create concurrent array with alias parallel from array", () => {
      const t1 = xrun.parallel(["a", "b"]);
      expect(t1[0].toString()).toBe("Symbol(concurrent)");
      expect(t1.slice(1)).toStrictEqual(["a", "b"]);
    });

    it("should not change single task", () => {
      const t1 = xrun.concurrent("a");
      expect(t1).toBe("a");
    });

    it("should create concurrent array from array of single element", () => {
      const t1 = xrun.concurrent(["a"]);
      expect(t1[0].toString()).toBe("Symbol(concurrent)");
      expect(t1.slice(1)).toStrictEqual(["a"]);
    });
  });

  describe("serial", function() {
    it("should create serial array from variadic params", () => {
      const t1 = xrun.serial("a", "b");
      expect(t1[0].toString()).toBe("Symbol(serial)");
      expect(t1.slice(1)).toStrictEqual(["a", "b"]);
    });

    it("should create serial array from array", () => {
      const t1 = xrun.serial(["a", "b"]);
      expect(t1[0].toString()).toBe("Symbol(serial)");
      expect(t1.slice(1)).toStrictEqual(["a", "b"]);
    });

    it("should not change single task", () => {
      const t1 = xrun.serial("a");
      expect(t1).toBe("a");
    });

    it("should create serial array from array of single element", () => {
      const t1 = xrun.serial(["a"]);
      expect(t1[0].toString()).toBe("Symbol(serial)");
      expect(t1.slice(1)).toStrictEqual(["a"]);
    });
  });

  it("should have exec to make XTaskSpec for shell exec", () => {
    expect(xrun.exec("hello", "tty").toString()).toBe(`exec(tty) 'hello'`);
    expect(xrun.exec("hello", ["tty", "noenv"]).toString()).toBe(`exec(tty,noenv) 'hello'`);
    expect(xrun.exec("echo hello").toString()).toBe(`exec 'echo hello'`);

    expect(xrun.exec(["echo", "hello", "world"], "tty").toString()).toBe(
      `exec(tty) 'echo hello world'`
    );
    expect(xrun.exec({ cmd: "hello", flags: { tty: true } }).toString()).toBe(
      `exec(tty) 'hello'`
    );
    expect(xrun.exec({ command: "hello", flags: { tty: true } }).toString()).toBe(
      `exec(tty) 'hello'`
    );
    expect(() => xrun.exec(1).toString()).toThrow("unknown spec type number");
  });

  it("should have prepare and prepublishOnly scripts to ensure dist is built before publish (FJM-190)", async () => {
    const pkg = JSON.parse(
      await fs.promises.readFile(new URL("../../package.json", import.meta.url), "utf8")
    );
    expect(pkg.scripts.prepare).toBe("npm run build");
    expect(pkg.scripts.prepublishOnly).toBe("npm run build");
  });
});
