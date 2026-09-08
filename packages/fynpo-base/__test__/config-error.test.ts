import { describe, it, expect } from "vitest";
import {
  FynpoConfigError,
  isFynpoConfigError,
  formatFynpoConfigError,
} from "../src/config-error.js";

describe("FynpoConfigError", () => {
  it("should keep the file and reason apart from the composed message", () => {
    const err = new FynpoConfigError("/repo/fynpo.json", "Unexpected token } in JSON");

    expect(err.filePath).toBe("/repo/fynpo.json");
    expect(err.reason).toBe("Unexpected token } in JSON");
    expect(err.message).toBe(
      "Failed to read JSON file /repo/fynpo.json - Unexpected token } in JSON"
    );
    expect(err.name).toBe("FynpoConfigError");
    expect(err).toBeInstanceOf(Error);
  });

  it("should frame a config that ran and threw as a load failure, keeping the cause", () => {
    const cause = new Error("boom in config");
    const err = new FynpoConfigError("/repo/fynpo.config.js", cause.message, cause);

    expect(err.cause).toBe(cause);
    expect(err.message).toBe("Failed to load /repo/fynpo.config.js - boom in config");
  });

  describe("isFynpoConfigError", () => {
    it("should identify the error by code, not instanceof", () => {
      // fyn and fynpo each bundle their own copy of this module, so an error crossing between
      // them fails instanceof while still being the same failure
      expect(isFynpoConfigError({ code: "FYNPO_BAD_CONFIG" })).toBe(true);
      expect(isFynpoConfigError(new FynpoConfigError("/a/fynpo.json", "bad"))).toBe(true);
    });

    it("should reject anything else", () => {
      expect(isFynpoConfigError(new Error("boom"))).toBe(false);
      expect(isFynpoConfigError(Object.assign(new Error("gone"), { code: "ENOENT" }))).toBe(false);
      expect(isFynpoConfigError(undefined)).toBe(false);
      expect(isFynpoConfigError(null)).toBe(false);
    });
  });

  describe("formatFynpoConfigError", () => {
    const err = new FynpoConfigError("/repo/lerna.json", "Unexpected token } in JSON");

    it("should show the file, the reason, and the CLI that stopped", () => {
      const msg = formatFynpoConfigError(err, "fyn");

      expect(msg).toContain("INVALID CONFIG FILE");
      expect(msg).toContain("/repo/lerna.json");
      expect(msg).toContain("Unexpected token } in JSON");
      expect(msg).toContain("fyn found this file");
    });

    it("should name the calling CLI so fynpo does not claim to be fyn", () => {
      expect(formatFynpoConfigError(err, "fynpo")).toContain("fynpo found this file");
    });

    it("should carry no stack trace", () => {
      expect(formatFynpoConfigError(err, "fyn")).not.toContain("at ");
    });

    //
    // A JSON file has no code to blame, so its stack would only point into fyn. A config that
    // ran and threw does - the user needs it to find the throw in their own file. - FJM-198
    //
    describe("when the config ran and threw", () => {
      const cause = new Error("boom in config");
      const loadErr = new FynpoConfigError("/repo/fynpo.config.js", cause.message, cause);

      it("should show the cause's stack under a load-failure heading", () => {
        const msg = formatFynpoConfigError(loadErr, "fyn");

        expect(msg).toContain("CONFIG FILE FAILED TO LOAD");
        expect(msg).not.toContain("INVALID CONFIG FILE");
        expect(msg).toContain("/repo/fynpo.config.js");
        expect(msg).toContain("boom in config");
        expect(msg).toContain("config-error.test.ts");
        expect(msg).toContain("The stack below points into the config itself");
      });

      it("should not tell the user to fix JSON", () => {
        expect(formatFynpoConfigError(loadErr, "fyn")).not.toContain("not valid JSON");
      });

      it("should fall back to the cause's text when it has no stack", () => {
        const bare = new FynpoConfigError("/repo/fynpo.config.js", "nope", {
          message: "nope",
          toString: () => "Error: nope",
        } as Error);

        expect(formatFynpoConfigError(bare, "fyn")).toContain("Error: nope");
      });
    });
  });
});
