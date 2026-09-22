import { afterEach, describe, expect, it, vi } from "vitest";
import Fs from "fs";
import Path from "path";
import FynCli from "../../cli/fyn-cli";
import fyntil from "../../lib/util/fyntil";

vi.mock("check-pkg-new-version-engine", () => ({ checkPkgNewVersionEngine: vi.fn() }));

describe("local package refresh during install", () => {
  let root: string;

  afterEach(() => {
    vi.restoreAllMocks();
    if (root) Fs.rmSync(root, { recursive: true, force: true });
  });

  it("updates replaced local output on ordinary install and then skips an unchanged install", async () => {
    const temp = Path.resolve(".temp");
    Fs.mkdirSync(temp, { recursive: true });
    root = Fs.mkdtempSync(Path.join(temp, "local-refresh-install-"));
    Fs.mkdirSync(Path.join(root, ".git"));
    const producer = Path.join(root, "producer");
    const consumer = Path.join(root, "consumer");
    Fs.mkdirSync(Path.join(producer, "dist"), { recursive: true });
    Fs.mkdirSync(consumer);
    Fs.writeFileSync(Path.join(producer, "package.json"), JSON.stringify({
      name: "refresh-producer", version: "1.0.0", files: ["dist"], main: "dist/index.js"
    }));
    Fs.writeFileSync(Path.join(producer, ".gitignore"), "dist/\n");
    const output = Path.join(producer, "dist/index.js");
    Fs.writeFileSync(output, "module.exports = 'old';\n");
    Fs.writeFileSync(Path.join(consumer, "package.json"), JSON.stringify({
      name: "refresh-consumer", version: "1.0.0",
      dependencies: { "refresh-producer": "file:../producer" }
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
    const first = makeCli();
    await first.install({ opts: { audit: false } });
    expect(exit).toHaveBeenLastCalledWith(0);
    const installed = Path.join(consumer, "node_modules/refresh-producer/dist/index.js");
    expect(Fs.readFileSync(installed, "utf8")).toContain("'old'");
    expect(Fs.statSync(installed).ino).toBe(Fs.statSync(output).ino);

    const replacement = Path.join(producer, "dist/replacement.js");
    Fs.writeFileSync(replacement, "module.exports = 'new';\n");
    Fs.renameSync(replacement, output);
    expect(Fs.readFileSync(installed, "utf8")).toContain("'old'");

    const second = makeCli();
    const installAgain = vi.spyOn(second.fyn, "_startInstall");
    const inspectLocal = vi.spyOn(second.fyn, "checkLocalPkgFromInstallConfigNeedInstall");
    await second.install({ opts: { audit: false } });
    expect(exit).toHaveBeenLastCalledWith(0);
    expect(inspectLocal).toHaveBeenCalled();
    expect(installAgain).toHaveBeenCalled();
    expect((await second.fyn.getLocalPkgInstall(producer)).changed).toBe(false);
    expect(Fs.readFileSync(installed, "utf8")).toContain("'new'");
    expect(Fs.statSync(installed).ino).toBe(Fs.statSync(output).ino);

    const third = makeCli();
    const unchangedInstall = vi.spyOn(third.fyn, "_startInstall");
    await third.install({ opts: { audit: false } });
    expect(exit).toHaveBeenLastCalledWith(0);
    expect(unchangedInstall).not.toHaveBeenCalled();
  });
});
