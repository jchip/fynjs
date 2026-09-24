import Path from "path";
import { expect, describe, it, afterEach } from "vitest";
import { verify } from "run-verify";
import makeNpmScriptEnv from "../../../lib/util/npm-script-env.js";
import { myPkgDir } from "../../../lib/my-pkg.js";

describe("npm-script-env utility", () => {
  const saveNode = process.env.NODE;

  afterEach(() => {
    if (saveNode === undefined) {
      delete process.env.NODE;
    } else {
      process.env.NODE = saveNode;
    }
  });

  const baseOpts = {
    pkgPath: "/repo/pkg/package.json",
    pkgJson: { name: "my-pkg", version: "1.2.3" },
    scriptName: "build",
    scriptCmd: "webpack --mode production",
    initCwd: "/repo"
  };

  it("should set all npm-parity env vars", () => {
    delete process.env.NODE;

    return verify()
      .step(() => makeNpmScriptEnv(baseOpts))
      .step(env => {
        expect(env.npm_lifecycle_event).toBe("build");
        expect(env.npm_lifecycle_script).toBe("webpack --mode production");
        expect(env.npm_package_name).toBe("my-pkg");
        expect(env.npm_package_version).toBe("1.2.3");
        expect(env.npm_package_json).toBe("/repo/pkg/package.json");
        expect(env.INIT_CWD).toBe("/repo");
        expect(env.PWD).toBe(Path.dirname("/repo/pkg/package.json"));
        expect(env.npm_execpath).toBe(Path.join(myPkgDir, "bin", "xrun.js"));
        expect(env.npm_node_execpath).toBe(process.execPath);
        expect(env.NODE).toBe(process.execPath);
      });
  });

  it("should omit npm_package_name/version when absent from pkgJson", () => {
    return verify()
      .step(() => makeNpmScriptEnv({ ...baseOpts, pkgJson: {} }))
      .step(env => {
        expect(env.npm_package_name).toBeUndefined();
        expect(env.npm_package_version).toBeUndefined();
      });
  });

  it("should respect a pre-set NODE env var", () => {
    process.env.NODE = "/custom/node";

    return verify()
      .step(() => makeNpmScriptEnv(baseOpts))
      .step(env => {
        expect(env.NODE).toBe("/custom/node");
        expect(env.npm_node_execpath).toBe("/custom/node");
      });
  });
});
