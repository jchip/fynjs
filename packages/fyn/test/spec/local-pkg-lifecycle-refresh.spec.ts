import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fs from "fs";
import Path from "path";
import { createRequire } from "module";
import FynCli from "../../cli/fyn-cli";
import fyntil from "../../lib/util/fyntil";

vi.mock("check-pkg-new-version-engine", () => ({ checkPkgNewVersionEngine: vi.fn() }));

describe("local package refresh after root scripts", () => {
  let root: string;
  let consumer: string;
  let producer: string;

  beforeEach(() => {
    const temp = Path.resolve(".temp");
    Fs.mkdirSync(temp, { recursive: true });
    root = Fs.mkdtempSync(Path.join(temp, "local-lifecycle-refresh-"));
    consumer = Path.join(root, "consumer");
    producer = Path.join(root, "producer");
    Fs.mkdirSync(Path.join(root, ".git"));
    Fs.mkdirSync(consumer);
    Fs.mkdirSync(Path.join(producer, "dist"), { recursive: true });
    Fs.writeFileSync(Path.join(producer, "package.json"), JSON.stringify({
      name: "local-pkg", version: "1.0.0", main: "dist/index.js", files: ["dist"],
      dependencies: { "nested-pkg": "../nested-new" }
    }));
    for (const [directory, version] of [["nested-old", "1.0.0"], ["nested-new", "2.0.0"]]) {
      const depDir = Path.join(root, directory);
      Fs.mkdirSync(depDir);
      Fs.writeFileSync(Path.join(depDir, "package.json"), JSON.stringify({
        name: "nested-pkg", version, main: "index.js"
      }));
      Fs.writeFileSync(Path.join(depDir, "index.js"), `module.exports = '${version}';\n`);
    }
    Fs.writeFileSync(Path.join(producer, "dist/index.js"), "module.exports = 'old';\n");
    Fs.writeFileSync(Path.join(producer, "dist/removed.js"), "module.exports = 'removed';\n");
    Fs.writeFileSync(Path.join(consumer, "rebuild.cjs"), `
const Fs = require("fs");
const assert = require("assert/strict");
assert.equal(require("local-pkg"), "old");
Fs.writeFileSync("../producer/dist/index.js.tmp", "module.exports = 'new' + require('nested-pkg');\\n");
Fs.renameSync("../producer/dist/index.js.tmp", "../producer/dist/index.js");
Fs.writeFileSync("../producer/dist/added.js", "module.exports = 'added';\\n");
Fs.unlinkSync("../producer/dist/removed.js");
`);
    vi.spyOn(fyntil, "exit").mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    Fs.rmSync(root, { recursive: true, force: true });
  });

  it.each(["install", "postinstall", "prepare", "build"].flatMap(script =>
    [false, true].map(copyMode => ({ script, copyMode }))
  ))(
    "refreshes replaced, added, and removed outputs after root $script (copy mode: $copyMode)",
    async ({ script, copyMode }) => {
      vi.stubEnv("FYN_LOCAL_COPY_MODE", String(copyMode));
      Fs.writeFileSync(Path.join(consumer, "package.json"), JSON.stringify({
        name: "local-consumer", version: "1.0.0",
        dependencies: { "local-pkg": "../producer", "nested-pkg": "../nested-old" },
        scripts: { [script]: "node rebuild.cjs" }
      }));
      const cli = new FynCli({
        noStartupInfo: true,
        _fynpo: {},
        opts: {
          cwd: consumer, fynDir: Path.join(root, "cache"), centralStore: false,
          sourceMaps: false, buildLocal: false, autoRun: true, runNpm: ["build"],
          progress: "none", targetDir: "node_modules", layout: "normal",
          flattenTop: true, concurrency: 15
        }
      });

      await cli.install({ opts: { audit: false } });

      expect(fyntil.exit).toHaveBeenCalledWith(0);
      const installed = Path.join(consumer, "node_modules/local-pkg");
      expect(Fs.readFileSync(Path.join(producer, "dist/index.js"), "utf8")).toContain("'new'");
      expect(Fs.readFileSync(Path.join(installed, "dist/index.js"), "utf8")).toContain("'new'");
      expect(Fs.readFileSync(Path.join(installed, "dist/added.js"), "utf8")).toContain("'added'");
      expect(Fs.existsSync(Path.join(installed, "dist/removed.js"))).toBe(false);
      expect(Fs.existsSync(Path.join(installed, "node_modules/nested-pkg"))).toBe(true);
      expect(createRequire(Path.join(consumer, "package.json"))("local-pkg")).toBe("new2.0.0");
      const sourceManifest = Path.join(producer, "package.json");
      const installedManifest = Path.join(installed, "package.json");
      expect(JSON.parse(Fs.readFileSync(installedManifest, "utf8"))._id)
        .toBe("local-pkg@1.0.0-fynlocal_h");
      expect(JSON.parse(Fs.readFileSync(sourceManifest, "utf8"))._id).toBeUndefined();
      expect(Fs.statSync(installedManifest).ino).not.toBe(Fs.statSync(sourceManifest).ino);
    }
  );
});
