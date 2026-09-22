import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Fs from "fs";
import Path from "path";
import FynCli from "../../cli/fyn-cli";
import fyntil from "../../lib/util/fyntil";
import mockNpm from "../fixtures/mock-npm";

vi.mock("check-pkg-new-version-engine", () => ({ checkPkgNewVersionEngine: vi.fn() }));

describe("local resolution mode during install", () => {
  let root: string;
  let consumer: string;
  let server;

  beforeAll(async () => {
    server = await mockNpm({ port: 0, logLevel: "warn" });
  });

  afterAll(() => server.stop());

  beforeEach(() => {
    const temp = Path.resolve(".temp");
    Fs.mkdirSync(temp, { recursive: true });
    root = Fs.mkdtempSync(Path.join(temp, "local-resolution-mode-"));
    consumer = Path.join(root, "consumer");
    const producer = Path.join(root, "producer");
    Fs.mkdirSync(Path.join(root, ".git"));
    Fs.mkdirSync(consumer);
    Fs.mkdirSync(producer);
    Fs.writeFileSync(Path.join(producer, "package.json"), JSON.stringify({
      name: "mod-a", version: "1.0.0", main: "index.js"
    }));
    Fs.writeFileSync(Path.join(producer, "index.js"), "module.exports = 'local';\n");
    vi.spyOn(fyntil, "exit").mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Fs.rmSync(root, { recursive: true, force: true });
  });

  const writeManifest = (section = "dependencies") => {
    Fs.writeFileSync(Path.join(consumer, "package.json"), JSON.stringify({
      name: "mode-consumer", version: "1.0.0",
      [section]: { "mod-a": "1.0.0" },
      fyn: { [section]: { "mod-a": "../producer" } }
    }));
  };

  const makeCli = (fynlocal: boolean) => new FynCli({
    noStartupInfo: true,
    _fynpo: {},
    opts: {
      cwd: consumer, fynDir: Path.join(root, "cache"), centralStore: false,
      sourceMaps: false, buildLocal: false, autoRun: false, progress: "none",
      targetDir: "node_modules", layout: "normal", flattenTop: true,
      concurrency: 15, registry: `http://localhost:${server.info.port}`, fynlocal
    }
  });

  it.each(["dependencies", "devDependencies"])(
    "switches %s between registry and local without manifest edits or forced installs",
    async section => {
      writeManifest(section);
      const manifest = Path.join(consumer, "package.json");
      const original = Fs.readFileSync(manifest, "utf8");
      const modifiedAt = Fs.statSync(manifest).mtimeMs;
      const installed = Path.join(consumer, "node_modules/mod-a");
      let previous: boolean | undefined;

      for (const fynlocal of [false, true, true, false, false]) {
        const cli = makeCli(fynlocal);
        const start = vi.spyOn(cli.fyn, "_startInstall");
        await cli.install({ opts: { audit: false } });

        if (previous === fynlocal) expect(start).not.toHaveBeenCalled();
        else expect(start).toHaveBeenCalled();
        const pkg = JSON.parse(Fs.readFileSync(Path.join(installed, "package.json"), "utf8"));
        expect(pkg._id).toBe(fynlocal ? "mod-a@1.0.0-fynlocal_h" : "mod-a@1.0.0");
        if (fynlocal) {
          expect(Fs.readFileSync(Path.join(installed, "index.js"), "utf8")).toContain("'local'");
        } else {
          expect(Fs.existsSync(Path.join(installed, "index.js"))).toBe(false);
        }
        previous = fynlocal;
      }

      expect(Fs.readFileSync(manifest, "utf8")).toBe(original);
      expect(Fs.statSync(manifest).mtimeMs).toBe(modifiedAt);
    }
  );

  it("refreshes an older install once when its saved local mode is unknown", async () => {
    writeManifest();
    const first = makeCli(false);
    await first.install({ opts: { audit: false } });
    const configFile = first.fyn.getInstallConfigFile();
    const config = JSON.parse(Fs.readFileSync(configFile, "utf8"));
    delete config.fynlocal;
    Fs.writeFileSync(configFile, JSON.stringify(config));

    for (const expectedInstalls of [1, 0]) {
      const cli = makeCli(false);
      const start = vi.spyOn(cli.fyn, "_startInstall");
      await cli.install({ opts: { audit: false } });
      if (expectedInstalls) expect(start).toHaveBeenCalled();
      else expect(start).not.toHaveBeenCalled();
      expect(JSON.parse(Fs.readFileSync(configFile, "utf8")).fynlocal).toBe(false);
    }
  });
});
