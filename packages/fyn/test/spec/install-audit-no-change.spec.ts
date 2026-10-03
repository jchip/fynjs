import { afterEach, describe, expect, it, vi } from "vitest";
import Fs from "fs";
import Path from "path";
import FynCli from "../../cli/fyn-cli";
import fyntil from "../../lib/util/fyntil";

vi.mock("check-pkg-new-version-engine", () => ({ checkPkgNewVersionEngine: vi.fn() }));

describe("audit after an unchanged install", () => {
  let root: string;

  afterEach(() => {
    vi.restoreAllMocks();
    if (root) Fs.rmSync(root, { recursive: true, force: true });
  });

  it("writes the audit report even when install finds no change", async () => {
    const temp = Path.resolve(".temp");
    Fs.mkdirSync(temp, { recursive: true });
    root = Fs.mkdtempSync(Path.join(temp, "audit-no-change-"));
    Fs.mkdirSync(Path.join(root, ".git"));
    const producer = Path.join(root, "producer");
    const consumer = Path.join(root, "consumer");
    Fs.mkdirSync(producer);
    Fs.mkdirSync(consumer);
    Fs.writeFileSync(Path.join(producer, "package.json"), JSON.stringify({
      name: "audit-producer", version: "1.0.0", main: "index.js"
    }));
    Fs.writeFileSync(Path.join(producer, "index.js"), "module.exports = 1;\n");
    Fs.writeFileSync(Path.join(consumer, "package.json"), JSON.stringify({
      name: "audit-consumer", version: "1.0.0",
      dependencies: { "audit-producer": "file:../producer" }
    }));
    const exit = vi.spyOn(fyntil, "exit").mockImplementation(() => undefined as never);
    const makeCli = () => new FynCli({
      noStartupInfo: true,
      _fynpo: {},
      opts: {
        cwd: consumer, fynDir: Path.join(root, "cache"), centralStore: false,
        sourceMaps: false, buildLocal: false, autoRun: false, progress: "none",
        targetDir: "node_modules", layout: "normal", flattenTop: true,
        concurrency: 15, fynlocal: true
      }
    });
    const auditFile = Path.join(root, "audit.json");

    await makeCli().install({ opts: { audit: false } });
    expect(exit).toHaveBeenLastCalledWith(0);
    expect(Fs.existsSync(auditFile)).toBe(false);

    const unchanged = makeCli();
    // only a real install takes the install lock; the audit may still resolve and init fetching
    const installLock = vi.spyOn(unchanged.fyn, "createInstallLock");
    await unchanged.install({ opts: { audit: true, auditFile } });
    expect(exit).toHaveBeenLastCalledWith(0);
    expect(installLock).not.toHaveBeenCalled();
    expect(JSON.parse(Fs.readFileSync(auditFile, "utf8")).vulnerabilities).toStrictEqual([]);

    Fs.rmSync(auditFile);
    const skipped = makeCli();
    await skipped.install({ opts: { audit: false, auditFile } });
    expect(exit).toHaveBeenLastCalledWith(0);
    expect(Fs.existsSync(auditFile)).toBe(false);
  });
});
