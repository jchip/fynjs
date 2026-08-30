import { describe, it, expect } from "vitest";
import { env } from "../../src/index.ts";

describe("env", function () {
  describe("get", function () {
    it("should return undefined when not exist", () => {
      expect(env.get("BLAH")).to.equal(undefined);
    });

    it("should return valWhenUndef when not exist", () => {
      expect(env.get("BLAH", "foo")).to.equal("foo");
    });

    it("should return value when exist", () => {
      const k = `K${Date.now()}`;
      process.env[k] = "hello";
      expect(env.get(k, "foo")).to.equal("hello");
      delete process.env[k];
    });
  });

  describe("getAsBool", function () {
    it("should return false when not exist", () => {
      expect(env.getAsBool("BLAH")).to.equal(false);
    });

    it("should return valWhenUndef when not exist", () => {
      expect(env.getAsBool("BLAH", true)).to.equal(true);
    });

    it("should return false when not exist and valWhenUndef is not boolean", () => {
      expect(env.getAsBool("BLAH", 111)).to.equal(false);
    });

    it("should return true when exist as a recognized value", () => {
      let now = Date.now();
      ["true", "TrUe", "1", "yes", "Yes", "YES", "on", "On", "ON"].forEach(x => {
        const k = `K${now}`;
        process.env[k] = x;
        now++;
        expect(env.getAsBool(k, false)).to.equal(true);
        delete process.env[k];
      });
    });

    it("should return false when exist but not a recognized value", () => {
      let now = Date.now();
      ["false", "no", "No", "False", "Off", "off"].forEach(x => {
        const k = `K${now}`;
        process.env[k] = x;
        now++;
        expect(env.getAsBool(k, true)).to.equal(false);
        delete process.env[k];
      });
    });
  });

  describe("getAsInt", function () {
    it("should return NaN when not exist", () => {
      expect(env.getAsInt("BLAH")).is.NaN;
    });

    it("should return valWhenUndef when not exist", () => {
      expect(env.getAsInt("BLAH", 115)).to.equal(115);
    });

    it("should return NaN when not exist and valWhenUndef is not number", () => {
      expect(env.getAsInt("BLAH", "115")).is.NaN;
    });

    it("should return value as number", () => {
      const k = `K${Date.now()}`;
      process.env[k] = "999";
      expect(env.getAsInt(k, 5555)).to.equal(999);
      delete process.env[k];
    });

    it("should return NaN when valWhenUndef is not number and value can't be parsed", () => {
      const k = `K${Date.now()}`;
      process.env[k] = "blah";
      expect(env.getAsInt(k, "5555")).is.NaN;
      delete process.env[k];
    });
  });
});
