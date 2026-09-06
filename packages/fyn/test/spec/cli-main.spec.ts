import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { getRunExitCode, pickEnvOptions, setLockfile } from "../../cli/main";

describe("cli/main", function() {
  describe("getRunExitCode", function() {
    it("prefers the child exit code over errno", () => {
      expect(getRunExitCode({ code: 5, errno: -2 })).toBe(5);
    });
  });

  describe("setLockfile", function() {
    it("updates the nested option consumed by Fyn and returns its previous value", () => {
      const config = { opts: { lockfile: true } };

      expect(setLockfile(config, false)).toBe(true);
      expect(config.opts.lockfile).toBe(false);
      expect(config).not.toHaveProperty("lockfile");
    });
  });

  describe("pickEnvOptions", function() {
    let saved;

    beforeEach(() => {
      saved = process.env.NODE_ENV;
    });

    afterEach(() => {
      if (saved === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = saved;
      }
    });

    it("sets production true when NODE_ENV=production", () => {
      process.env.NODE_ENV = "production";
      expect(pickEnvOptions()).toStrictEqual({ production: true });
    });

    it("sets production false when NODE_ENV is another value", () => {
      process.env.NODE_ENV = "development";
      expect(pickEnvOptions()).toStrictEqual({ production: false });
    });

    it("returns empty object when NODE_ENV is not set", () => {
      delete process.env.NODE_ENV;
      expect(pickEnvOptions()).toStrictEqual({});
    });
  });
});
