import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Fs from "fs";
import Path from "path";
import * as semverUtil from "../../lib/util/semver";
import DepItem from "../../lib/dep-item";
import Fyn from "../../lib/fyn";
import mockNpm from "../fixtures/mock-npm";
import logger from "../../lib/logger";

describe("npm package aliases", () => {
  it.each([
    ["npm:mod-a@^1.0.0", "mod-a", "^1.0.0"],
    ["npm:mod-a", "mod-a", "*"],
    ["npm:@scope/real-pkg@~2.3.0", "@scope/real-pkg", "~2.3.0"],
    ["npm:@scope/real-pkg", "@scope/real-pkg", "*"],
  ])("parses %s as a registry alias", (specifier, name, range) => {
    expect(semverUtil.analyze(specifier)).toMatchObject({
      $: range,
      alias: { name, specifier },
    });
  });

  it("does not classify an npm alias as a URL dependency", () => {
    expect(semverUtil.analyze("npm:mod-a@1").urlType).toBeUndefined();
  });

  it.each([
    ["npm:foo@npm:bar@1", "nested aliases not supported"],
    ["npm:file:../foo", "aliases only work for registry deps"],
    ["npm:", "aliases must have a name"],
  ])("rejects unsupported alias target %s", (specifier, message) => {
    expect(() => semverUtil.analyze(specifier)).toThrow(message);
  });

  it("keeps the declared name while exposing the registry target", () => {
    const item = new DepItem({
      name: "legacy-mod",
      semver: "npm:mod-a@^1.0.0",
      src: "dep",
      dsrc: "dep",
    });

    expect(item.name).toBe("legacy-mod");
    expect(item.resolutionName).toBe("mod-a");
    expect(item.semver).toBe("^1.0.0");
    expect(item.specifier).toBe("npm:mod-a@^1.0.0");
  });
});

describe("package alias resolution", () => {
  let server;
  let cwd: string;

  beforeAll(async () => {
    logger.setItemType(false);
    server = await mockNpm({ port: 0, logLevel: "warn" });
  });

  afterAll(() => server?.stop());

  beforeEach(() => {
    logger._logLevel = 999;
    cwd = Path.join(
      __dirname,
      "..",
      `.tmp_alias_${process.pid.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    );
    Fs.mkdirSync(cwd, { recursive: true });
    Fs.writeFileSync(
      Path.join(cwd, "package.json"),
      JSON.stringify({
        name: "alias-app",
        version: "1.0.0",
        dependencies: {
          "legacy-mod": "npm:mod-a@^1.1.0",
          "@test/legacy": "npm:mod-b@1.0.0",
        },
      }),
    );
  });

  afterEach(() => Fs.rmSync(cwd, { recursive: true, force: true }));

  it("resolves target metadata under each declared alias and preserves specs in the lock", async () => {
    const fyn = new Fyn({
      opts: {
        registry: `http://localhost:${server.info.port}`,
        pkgFile: Path.join(cwd, "package.json"),
        targetDir: "node_modules",
        cwd,
        fynDir: Path.join(cwd, ".fyn"),
        lockfile: true,
        ignoreDist: true,
      },
    });

    await fyn.resolveDependencies();

    expect(Object.keys(fyn._data.pkgs)).toEqual(
      expect.arrayContaining(["@test/legacy", "legacy-mod"]),
    );
    expect(Object.keys(fyn._data.pkgs["legacy-mod"].versions)).toEqual(["1.1.2"]);
    expect(Object.keys(fyn._data.pkgs["@test/legacy"].versions)).toEqual(["1.0.0"]);

    fyn._depLocker.generate(fyn._data);
    expect(fyn._depLocker.data.$pkg?.dep).toEqual({
      "@test/legacy": "npm:mod-b@1.0.0",
      "legacy-mod": "npm:mod-a@^1.1.0",
    });
  });
});
