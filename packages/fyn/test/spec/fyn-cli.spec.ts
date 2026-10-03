import { afterEach, describe, it, expect, vi } from "vitest";
import FynCli from "../../cli/fyn-cli";
import fyntil from "../../lib/util/fyntil";
import logger from "../../lib/logger";
import showOutdated from "../../cli/show-outdated";

vi.mock("../../cli/show-outdated", () => ({ default: vi.fn() }));

describe("FynCli", function () {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("install cleanup", function () {
    it("waits for pending local package builds after an install failure", async () => {
      const installError = new Error("resolution failed");
      const waitForDone = vi.fn().mockResolvedValue(undefined);
      const cli: any = Object.create(FynCli.prototype);
      cli._opts = {};
      cli._fyn = {
        _options: { forceInstall: true },
        _localPkgBuilder: { waitForDone },
        _initializePkg: vi.fn().mockResolvedValue(undefined),
        createInstallLock: vi.fn().mockResolvedValue(false),
        readLockFiles: vi.fn().mockResolvedValue(undefined),
        _startInstall: vi.fn().mockRejectedValue(installError)
      };
      cli.fail = vi.fn().mockResolvedValue(undefined);

      await cli.install({ opts: { audit: false } });
      expect(waitForDone).toHaveBeenCalledOnce();
    });
  });

  describe("fail", function () {
    const runFail = async (err: Error) => {
      const cli: any = Object.create(FynCli.prototype);
      cli._opts = { cwd: "/tmp", saveLogs: "/dev/null" };
      cli._fyn = { cwd: "/tmp" };
      cli.saveLogs = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(fyntil, "exit").mockImplementation(() => undefined as never);
      vi.spyOn(logger, "freezeItems").mockImplementation(() => undefined);
      const error = vi.spyOn(logger, "error").mockImplementation(() => logger);
      const debug = vi.spyOn(logger, "debug").mockImplementation(() => logger);
      await cli.fail("install failed:", err);
      const text = (spy: typeof error) => spy.mock.calls.map(c => c.join(" ")).join("\n");
      return { errors: text(error), debugs: text(debug) };
    };
    const expected = (message: string) => Object.assign(new Error(message), { expected: true });

    it("prints an expected failure's message, with the stack only at debug", async () => {
      const { errors, debugs } = await runFail(expected("Unable to find a version that satisfies x@^9"));
      expect(errors).toContain("Unable to find a version that satisfies x@^9");
      expect(errors).not.toContain("    at ");
      expect(errors).not.toContain("process.argv");
      expect(debugs).toContain("    at ");
      expect(debugs).toContain("process.argv");
    });

    it("prints each cause of an expected AggregateError", async () => {
      const inner = Object.assign(new AggregateError([expected("404 Not Found - GET /nope")], "pacote failed"), {
        expected: true
      });
      const { errors } = await runFail(new AggregateError([inner], "Unable to retrieve meta for package nope"));
      expect(errors).toContain("Unable to retrieve meta for package nope");
      expect(errors).toContain("  pacote failed");
      expect(errors).toContain("    404 Not Found - GET /nope");
      expect(errors).not.toContain("    at ");
    });

    it("keeps the stack for an unexpected error, even inside an AggregateError", async () => {
      expect((await runFail(new TypeError("x is undefined"))).errors).toContain("    at ");
      const wrapped = new AggregateError([new TypeError("x is undefined")], "Unable to retrieve meta");
      expect((await runFail(wrapped)).errors).toContain("    at ");
    });
  });

  describe("run --if-present", function () {
    const makeCli = (scripts = {}) => {
      const cli: any = Object.create(FynCli.prototype);
      cli._config = { _fynpo: {} };
      cli._fyn = {
        _pkg: { scripts },
        loadPkg: async () => undefined
      };
      cli.runScripts = vi.fn();
      return cli;
    };

    it("exits successfully without output when the script is missing", async () => {
      const cli = makeCli();
      const exit = vi.spyOn(fyntil, "exit").mockImplementation(() => undefined as never);
      const error = vi.spyOn(logger, "error").mockImplementation(() => logger);

      await cli.run({ opts: { ifPresent: true }, args: { script: "missing" } });

      expect(exit).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(cli.runScripts).not.toHaveBeenCalled();
    });

    it("preserves the missing-script failure without the option", async () => {
      const cli = makeCli();
      const exitError = new Error("exit");
      const exit = vi.spyOn(fyntil, "exit").mockImplementation(() => {
        throw exitError;
      });
      const error = vi.spyOn(logger, "error").mockImplementation(() => logger);

      await expect(cli.run({ opts: {}, args: { script: "missing" } })).rejects.toBe(exitError);

      expect(exit).toHaveBeenCalledWith(1);
      expect(error).toHaveBeenCalledWith(
        'Error: missing script: "missing" - not found in package.json scripts'
      );
      expect(cli.runScripts).not.toHaveBeenCalled();
    });

    it("runs an existing script normally", async () => {
      const cli = makeCli({ test: "vitest run" });

      await cli.run({ opts: { ifPresent: true }, args: { script: "test" } });

      expect(cli.runScripts).toHaveBeenCalledWith(["test"], { scriptArgs: [] });
    });

    it("preserves an existing script failure", async () => {
      const cli = makeCli({ test: "vitest run" });
      const error = new Error("script failed");
      cli.runScripts.mockRejectedValue(error);

      await expect(
        cli.run({ opts: { ifPresent: true }, args: { script: "test" } })
      ).rejects.toBe(error);
    });
  });

  describe("run --list", function () {
    it("does not exit successfully when loading the package fails", async () => {
      const error = new Error("load failed");
      const cli: any = Object.create(FynCli.prototype);
      cli._config = { _fynpo: {} };
      cli._fyn = {
        loadPkg: async () => {
          throw error;
        }
      };

      const savedExit = fyntil.exit;
      const exits: any[] = [];
      (fyntil as any).exit = (code: any) => exits.push(code);

      try {
        let caught;
        try {
          await cli.run({ opts: { list: true }, args: {} });
        } catch (err) {
          caught = err;
        }

        expect(caught).toBe(error);
        expect(exits).toStrictEqual([]);
      } finally {
        (fyntil as any).exit = savedExit;
      }
    });
  });

  describe("outdated", function () {
    const makeCli = () => {
      const cli: any = Object.create(FynCli.prototype);
      cli._fyn = { _options: { colors: false } };
      cli._opts = {};
      return cli;
    };

    it("exits 1 when dependencies are outdated", async () => {
      const record = {
        name: "alpha",
        type: "prod" as const,
        requested: "^1.0.0",
        current: "1.0.0",
        wanted: "1.1.0",
        latest: "2.0.0"
      };
      vi.mocked(showOutdated).mockResolvedValue({ records: [record], skipped: [] });
      const exit = vi.spyOn(fyntil, "exit").mockImplementation(() => undefined as never);

      expect(await makeCli().outdated({ args: {}, opts: {} })).toStrictEqual([record]);
      expect(exit).toHaveBeenCalledWith(1);
    });

    it("does not exit when dependencies are current", async () => {
      vi.mocked(showOutdated).mockResolvedValue({ records: [], skipped: [] });
      const exit = vi.spyOn(fyntil, "exit").mockImplementation(() => undefined as never);

      expect(await makeCli().outdated({ args: {}, opts: {} })).toStrictEqual([]);
      expect(exit).not.toHaveBeenCalled();
    });
  });
});
