import { describe, it, beforeEach, expect } from "vitest";
import LifecycleScripts from "../../lib/lifecycle-scripts";
import Path from "path";
import xstdout from "xstdout";
import logger from "../../lib/logger";
import chalk from "chalk";
import * as xaa from "xaa";
import { verify } from "run-verify";

describe("lifecycle-scripts", function() {
  logger.setItemType(false);
  chalk.level = 0;

  beforeEach(() => {
    logger._logLevel = 0;
  });

  const extractOutput = intercept => {
    let output = intercept.stdout.find(x => x.indexOf(">>> Start of output") >= 0).split("\n");
    output = output
      .slice(1, output.length - 1)
      .map(x => x.trim())
      .filter(x => x);
    const ix1 = output.indexOf("=== stderr ===");
    const stdout = output.slice(0, ix1);
    const stderr = output.slice(ix1 + 1, output.length - 1);

    return { stdout, stderr };
  };

  it("should execute a script from package.json", () => {
    const intercept = xstdout.intercept(true);
    const ls = new LifecycleScripts(Path.join(__dirname, "../fixtures/lifecycle-scripts/f1"));

    return verify({ cleanup: () => intercept.restore() })
      .step(() => xaa.wrap(() => ls.execute(["test"])))
      .step(() => {
        intercept.restore();
        expect(intercept.stdout.map(x => x.trim())).toContain("hello");
      });
  });

  it("should silently execute a script from package.json", () => {
    const intercept = xstdout.intercept(true);

    return verify({ cleanup: () => intercept.restore() })
      .step(() =>
        new LifecycleScripts(Path.join(__dirname, "../fixtures/lifecycle-scripts/f1")).execute(
          "test1",
          true
        )
      )
      .step(() => {
        intercept.restore();
        const output = extractOutput(intercept);
        expect(output.stdout[0]).toBe("hello");
        expect(output.stderr[0]).toBe("stderr foo");
      });
  });

  it("should silently execute a script with empty output from package.json", () => {
    const intercept = xstdout.intercept(true);

    return verify({ cleanup: () => intercept.restore() })
      .step(() =>
        new LifecycleScripts(Path.join(__dirname, "../fixtures/lifecycle-scripts/f1")).execute(
          "test4",
          true
        )
      )
      .step(() => {
        intercept.restore();
        const output = extractOutput(intercept);
        expect(output.stdout).toHaveLength(0);
        expect(output.stderr).toHaveLength(0);
      });
  });

  it("should silently execute a fail script from package.json", () => {
    const intercept = xstdout.intercept(true);

    return verify({ cleanup: () => intercept.restore() })
      .expectError.step(() =>
        new LifecycleScripts(Path.join(__dirname, "../fixtures/lifecycle-scripts/f1")).execute(
          "test3",
          true
        )
      )
      .step(error => {
        intercept.restore();
        const output = extractOutput(intercept);
        expect(output.stdout).toHaveLength(0);
        expect(output.stderr[0]).toBe("stderr blah");
        expect(error.stack).toContain("exit code 127");
      });
  });

  it("should silently execute a script with no output from package.json", () => {
    const intercept = xstdout.intercept(true);

    return verify({ cleanup: () => intercept.restore() })
      .step(() =>
        new LifecycleScripts(Path.join(__dirname, "../fixtures/lifecycle-scripts/f1")).execute(
          "test2",
          true
        )
      )
      .step(() => {
        intercept.restore();
        expect(intercept.stdout.map(x => x.trim())).toContain(
          "> No output from f1@1.0.0 npm script test2"
        );
      });
  });

  it("should set vars from config in package.json", () => {
    const intercept = xstdout.intercept(true);
    const ls = new LifecycleScripts(Path.join(__dirname, "../fixtures/lifecycle-scripts/f3"));

    return verify({ cleanup: () => intercept.restore() })
      .step(() => ls.execute("test1", true))
      .step(() => {
        intercept.restore();
        const output = extractOutput(intercept);
        expect(output.stdout).toContain("foo-bar");
      });
  });

  //
  // FPM-77: npm and bun both hand a lifecycle script the absolute path of the manifest it
  // is running for.  Pack time scripts need it to tell which package they are packing -
  // INIT_CWD can't answer that, it is the directory the user invoked the command from.
  //
  it("should set npm_package_json to the package's own manifest", () => {
    const dir = Path.join(__dirname, "../fixtures/lifecycle-scripts/f3");
    const env = new LifecycleScripts(dir).makeEnv();

    expect(env.npm_package_json).toBe(Path.join(dir, "package.json"));
  });

  it("should pass npm_package_json to the spawned script", () => {
    const dir = Path.join(__dirname, "../fixtures/lifecycle-scripts/f3");
    const intercept = xstdout.intercept(true);

    return verify({ cleanup: () => intercept.restore() })
      .step(() => new LifecycleScripts(dir).execute("test-pkg-json", true))
      .step(() => {
        intercept.restore();
        const output = extractOutput(intercept);
        expect(output.stdout).toContain(Path.join(dir, "package.json"));
      });
  });

  it("should tell the spawned script which lifecycle stage is running", () => {
    const dir = Path.join(__dirname, "../fixtures/lifecycle-scripts/f3");
    const intercept = xstdout.intercept(true);

    return verify({ cleanup: () => intercept.restore() })
      .step(() => new LifecycleScripts(dir).execute("test-lifecycle", true))
      .step(() => {
        intercept.restore();
        const output = extractOutput(intercept);
        expect(output.stdout).toContain("test-lifecycle");
      });
  });

  it("should tell the spawned script what its own script body is", () => {
    const dir = Path.join(__dirname, "../fixtures/lifecycle-scripts/f3");
    const intercept = xstdout.intercept(true);

    return verify({ cleanup: () => intercept.restore() })
      .step(() => new LifecycleScripts(dir).execute("test-lifecycle-script", true))
      .step(() => {
        intercept.restore();
        const output = extractOutput(intercept);
        expect(output.stdout).toContain(
          'node -e "console.log(process.env.npm_lifecycle_script)"'
        );
      });
  });

  it("should not execute a script not in package.json", () => {
    const promise = new LifecycleScripts({
      dir: Path.join(__dirname, "../fixtures/lifecycle-scripts/f2")
    })
      .execute("test-not-exist")
      .then(x => {
        expect(x).toBe(false);
      });

    return promise;
  });
});
