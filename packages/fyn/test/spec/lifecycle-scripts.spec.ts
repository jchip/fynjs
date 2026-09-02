import { describe, it, beforeEach, expect } from "vitest";
import LifecycleScripts from "../../lib/lifecycle-scripts";
import Path from "path";
import xstdout from "xstdout";
import logger from "../../lib/logger";
import chalk from "chalk";
import * as xaa from "xaa";

describe("lifecycle-scripts", function() {
  logger.setItemType(false);
  chalk.level = 0;

  beforeEach(() => {
    logger._logLevel = 0;
  });

  const failRestore = (err, intercept) => {
    intercept.restore();
    console.log(intercept.stdout);
    console.log(intercept.stderr);
    throw err;
  };

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

    const promise = xaa
      .wrap(() => ls.execute(["test"]))
      .then(() => {
        intercept.restore();
        expect(intercept.stdout.map(x => x.trim())).to.include("hello");
      })
      .catch(err => {
        failRestore(err, intercept);
      });

    return promise;
  });

  it("should silently execute a script from package.json", () => {
    const intercept = xstdout.intercept(true);
    const promise = new LifecycleScripts(Path.join(__dirname, "../fixtures/lifecycle-scripts/f1"))
      .execute("test1", true)
      .then(() => {
        intercept.restore();
        const output = extractOutput(intercept);
        expect(output.stdout[0]).to.equal("hello");
        expect(output.stderr[0]).to.equal("stderr foo");
      })
      .catch(err => failRestore(err, intercept));

    return promise;
  });

  it("should silently execute a script with empty output from package.json", () => {
    const intercept = xstdout.intercept(true);
    const promise = new LifecycleScripts(Path.join(__dirname, "../fixtures/lifecycle-scripts/f1"))
      .execute("test4", true)
      .then(() => {
        intercept.restore();
        const output = extractOutput(intercept);
        expect(output.stdout).to.be.empty;
        expect(output.stderr).to.be.empty;
      })
      .catch(err => failRestore(err, intercept));

    return promise;
  });

  it("should silently execute a fail script from package.json", () => {
    let error;
    const intercept = xstdout.intercept(true);
    const promise = new LifecycleScripts(Path.join(__dirname, "../fixtures/lifecycle-scripts/f1"))
      .execute("test3", true)
      .catch(err => {
        intercept.restore();
        error = err;
      })
      .then(() => {
        intercept.restore();
        expect(error).to.exist;
        const output = extractOutput(intercept);
        expect(output.stdout).to.be.empty;
        expect(output.stderr[0]).to.equal("stderr blah");
        expect(error.stack).includes("exit code 127");
      });

    return promise;
  });

  it("should silently execute a script with no output from package.json", () => {
    const intercept = xstdout.intercept(true);
    const promise = new LifecycleScripts(Path.join(__dirname, "../fixtures/lifecycle-scripts/f1"))
      .execute("test2", true)
      .then(() => {
        intercept.restore();
        expect(intercept.stdout.map(x => x.trim())).to.include(
          "> No output from f1@1.0.0 npm script test2"
        );
      })
      .catch(err => failRestore(err, intercept));

    return promise;
  });

  it("should set vars from config in package.json", () => {
    const intercept = xstdout.intercept(true);
    const ls = new LifecycleScripts(Path.join(__dirname, "../fixtures/lifecycle-scripts/f3"));
    const promise = ls
      .execute("test1", true)
      .then(() => {
        intercept.restore();
        const output = extractOutput(intercept);
        expect(output.stdout).includes("foo-bar");
      })
      .catch(err => failRestore(err, intercept));

    return promise;
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

    return new LifecycleScripts(dir)
      .execute("test-pkg-json", true)
      .then(() => {
        intercept.restore();
        const output = extractOutput(intercept);
        expect(output.stdout).includes(Path.join(dir, "package.json"));
      })
      .catch(err => failRestore(err, intercept));
  });

  it("should tell the spawned script which lifecycle stage is running", () => {
    const dir = Path.join(__dirname, "../fixtures/lifecycle-scripts/f3");
    const intercept = xstdout.intercept(true);

    return new LifecycleScripts(dir)
      .execute("test-lifecycle", true)
      .then(() => {
        intercept.restore();
        const output = extractOutput(intercept);
        expect(output.stdout).includes("test-lifecycle");
      })
      .catch(err => failRestore(err, intercept));
  });

  it("should tell the spawned script what its own script body is", () => {
    const dir = Path.join(__dirname, "../fixtures/lifecycle-scripts/f3");
    const intercept = xstdout.intercept(true);

    return new LifecycleScripts(dir)
      .execute("test-lifecycle-script", true)
      .then(() => {
        intercept.restore();
        const output = extractOutput(intercept);
        expect(output.stdout).includes(
          'node -e "console.log(process.env.npm_lifecycle_script)"'
        );
      })
      .catch(err => failRestore(err, intercept));
  });

  it("should not execute a script not in package.json", () => {
    const promise = new LifecycleScripts({
      dir: Path.join(__dirname, "../fixtures/lifecycle-scripts/f2")
    })
      .execute("test-not-exist")
      .then(x => {
        expect(x).to.equal(false);
      });

    return promise;
  });
});
