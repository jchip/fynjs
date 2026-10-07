import { describe, it, expect, vi, afterEach } from "vitest";
import Path from "path";
import which from "which";
import { verify } from "run-verify";
import { unwrapNpmCmd, resolveNpmCmd, quote, unquote, relative } from "../src/index.js";

const fixture = (name: string) => Path.join(import.meta.dirname, "fixtures", name);

afterEach(() => {
  vi.restoreAllMocks();
});

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

    it("should return a cross-drive absolute path as is", async () => {
      // emulate win32 path semantics, where relative() across drives stays absolute
      await verify({ timeout: 1000 })
        .step(() => vi.spyOn(Path, "relative").mockImplementation(Path.win32.relative))
        .step(() => vi.spyOn(Path, "isAbsolute").mockImplementation(Path.win32.isAbsolute))
        .step(() => relative(`D:\\tools\\cli.js`, `C:\\work`))
        .step((r) => expect(r).toBe(`D:\\tools\\cli.js`));
    });
  });
});

describe("resolveNpmCmd", () => {
  it("should fall back to the cmd path when the launch line has no script", async () => {
    const cmdFile = fixture("short-launch.cmd");
    await verify({ timeout: 1000 })
      .step(() => vi.spyOn(which, "sync").mockReturnValue(cmdFile))
      .step(() => resolveNpmCmd("short-launch"))
      .step((r) => expect(r).toBe(quote(cmdFile)));
  });
});

describe("unwrap-npm-cmd cache", () => {
  const withWin32 = () => {
    const desc = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { ...desc, value: "win32" });
    return () => Object.defineProperty(process, "platform", desc);
  };

  it("should apply relative and jsOnly per call on a cached resolve", async () => {
    let restore = () => {};
    const cmdFile = fixture("hello-js.cmd");
    const dir = Path.dirname(cmdFile);
    // on posix the batch's backslashes stay in the last path segment
    const jsFile = `${dir}\\node_modules\\hello\\bin\\hello.js`;
    const cwd = Path.dirname(dir);
    const relJs = `.${Path.sep}${Path.basename(dir)}\\node_modules\\hello\\bin\\hello.js`;
    const opts = { path: "cache-test-path" };
    await verify({ timeout: 1000, cleanup: () => restore() })
      .step(() => (restore = withWin32()))
      .step(() => vi.spyOn(which, "sync").mockReturnValue(cmdFile))
      .step(() => unwrapNpmCmd("hello-js a", opts))
      .keep.step((r) => expect(r).toBe(`${quote(process.execPath)} ${quote(jsFile)} a`))
      .step(() => unwrapNpmCmd("hello-js b", { ...opts, jsOnly: true, relative: true, cwd }))
      .keep.step((r) => expect(r).toBe(`${quote(relJs)} b`))
      .step(() => expect(which.sync).toHaveBeenCalledTimes(1));
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
