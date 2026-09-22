import { afterEach, expect, it, vi } from "vitest";
import Fs from "node:fs";
import Path from "node:path";
import FynCli from "../../cli/fyn-cli";
import fyntil from "../../lib/util/fyntil";
import { LocalPkgBuilder } from "../../lib/local-pkg-builder";

vi.mock("check-pkg-new-version-engine", () => ({ checkPkgNewVersionEngine: vi.fn() }));

let root: string;
afterEach(() => {
  vi.restoreAllMocks();
  if (root) Fs.rmSync(root, { recursive: true, force: true });
});

it("forced installs rebuild unchanged local dependencies even with their own install checkpoint", async () => {
  Fs.mkdirSync(Path.resolve(".temp"), { recursive: true });
  root = Fs.mkdtempSync(Path.resolve(".temp/local-build-install-"));
  const consumer = Path.join(root, "consumer");
  const producer = Path.join(root, "producer");
  Fs.mkdirSync(consumer);
  Fs.mkdirSync(producer);
  Fs.mkdirSync(Path.join(root, ".git"));
  Fs.writeFileSync(Path.join(producer, "package.json"), JSON.stringify({
    name: "local-build-producer", version: "1.0.0", files: ["dist"],
    scripts: { prepare: "node build.cjs" }
  }));
  Fs.writeFileSync(Path.join(producer, "source.txt"), "fresh-output");
  Fs.writeFileSync(Path.join(producer, "build.cjs"), `
    const fs = require("node:fs");
    fs.mkdirSync("dist", { recursive: true });
    fs.writeFileSync("dist/value.txt", fs.readFileSync("source.txt"));
  `);
  Fs.writeFileSync(Path.join(consumer, "package.json"), JSON.stringify({
    name: "local-build-consumer", version: "1.0.0",
    dependencies: { "local-build-producer": "1.0.0" },
    fyn: { dependencies: { "local-build-producer": "../producer" } }
  }));
  vi.spyOn(fyntil, "exit").mockImplementation(() => undefined as never);
  const makeCli = (cwd: string, forceInstall = false, buildLocal = false) => new FynCli({
    noStartupInfo: true,
    _fynpo: {},
    opts: {
      cwd, fynDir: Path.join(root, "cache"), centralStore: false, sourceMaps: false,
      buildLocal, autoRun: true, progress: "none", targetDir: "node_modules",
      flattenTop: true, concurrency: 5, fynlocal: true, forceInstall
    }
  });
  const install = async (cwd: string, forceInstall = false, buildLocal = false) => {
    const result = await makeCli(cwd, forceInstall, buildLocal).install({ opts: { audit: false } });
    expect(result).not.toBeInstanceOf(Error);
  };
  const output = Path.join(producer, "dist/value.txt");
  const installedOutput = Path.join(consumer, "node_modules/local-build-producer/dist/value.txt");

  // Establish the producer's own checkpoint, then leave stale ignored output.
  await install(producer);
  expect(Fs.readFileSync(output, "utf8")).toBe("fresh-output");
  Fs.writeFileSync(output, "stale-output");
  await install(producer);
  expect(Fs.readFileSync(output, "utf8")).toBe("stale-output");
  await install(consumer);
  expect(Fs.readFileSync(installedOutput, "utf8")).toBe("stale-output");

  const processItem = vi.spyOn(LocalPkgBuilder.prototype, "processItem");
  await install(consumer, false, true);
  await install(consumer, true, false);
  expect(processItem).not.toHaveBeenCalled();
  expect(Fs.readFileSync(installedOutput, "utf8")).toBe("stale-output");

  await install(consumer, true, true);
  expect(processItem).toHaveBeenCalledTimes(1);
  expect(Fs.readFileSync(output, "utf8")).toBe("fresh-output");
  expect(Fs.readFileSync(installedOutput, "utf8")).toBe("fresh-output");
});
