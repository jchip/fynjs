import { describe, it, expect } from "vitest";
import Path from "path";
import { unwrapNpmCmd, quote, unquote, relative } from "../src/index.ts";

describe("utils", () => {
  describe("quote", () => {
    it("should quote string", () => {
      expect(quote("abc")).toBe(`"abc"`);
      expect(quote(`"abc"`)).toBe(`"abc"`);
    });
  });

  describe("unquote", () => {
    it("should unquote string", () => {
      expect(unquote(`"abc"`)).toBe(`abc`);
      expect(unquote(`abc`)).toBe(`abc`);
    });
  });

  describe("relative", () => {
    it("should make relative path from cwd", () => {
      if (process.platform === "win32") {
        const r = relative(`C:\\Users`, `C:\\Temp`);
        expect(r).toBe(`..\\Users`);
      } else {
        const r = relative(`/Users/test`, `/tmp`);
        expect(r).toBe(`../Users/test`);
      }
    });
  });
});

describe("unwrap-npm-cmd", () => {
  it("should return command unchanged on non-Windows platforms", () => {
    if (process.platform !== "win32") {
      const cmd = unwrapNpmCmd("npm test");
      expect(cmd).toBe("npm test");
    }
  });

  it("should handle commands with multiple parts", () => {
    if (process.platform !== "win32") {
      const cmd = unwrapNpmCmd("npm run build --flag");
      expect(cmd).toBe("npm run build --flag");
    }
  });

  // Windows-specific tests only run on Windows
  if (process.platform === "win32") {
    it("should unwrap mocha", () => {
      const mochaExe = unwrapNpmCmd("mocha test");
      expect(mochaExe).toContain(process.execPath);
    });

    it("should unwrap mocha as relative path", () => {
      const mochaExe = unwrapNpmCmd("mocha test", { relative: true });
      expect(mochaExe).toContain(process.execPath);
      expect(mochaExe).toContain(`.\\node_modules\\mocha`);
    });

    it("should unwrap npm", () => {
      const npmExe = unwrapNpmCmd("npm test");
      expect(npmExe).toContain(process.execPath);
    });

    it("should unwrap npm without node exe if jsOnly is set", () => {
      const npmExe = unwrapNpmCmd("npm test", { jsOnly: true });
      expect(npmExe).not.toContain(process.execPath);
      expect(npmExe).toContain("npm-cli.js");
    });

    it("should handle jsOnly and relative in later calls", () => {
      let npmExe = unwrapNpmCmd("npm test");
      expect(npmExe).toContain(process.execPath);
      expect(npmExe).toContain("npm-cli.js");
      npmExe = unwrapNpmCmd("npm", { jsOnly: true, relative: true });
      expect(npmExe.split(" ").length).toBe(1);
      expect(Path.isAbsolute(unquote(npmExe))).toBe(false);
    });

    it("should unwrap npx", () => {
      const npxExe = unwrapNpmCmd("npx test");
      expect(npxExe).toContain(process.execPath);
    });

    it("should not translate non-cmd files", () => {
      const e = unwrapNpmCmd("find this");
      expect(e.toLowerCase()).toBe(`"c:\\windows\\system32\\find.exe" this`);
    });

    it("should do nothing for unknown command", () => {
      const e = unwrapNpmCmd("blah blah blah");
      expect(e).toBe("blah blah blah");
    });
  }
});
