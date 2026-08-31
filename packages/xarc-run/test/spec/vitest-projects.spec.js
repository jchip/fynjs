import { readdirSync, readFileSync } from "fs";
import Path from "path";
import { expect as expect } from "chai";
import vitestConfig from "../../vitest.config.js";

const specDir = import.meta.dirname;
const pkgDir = Path.join(specDir, "../..");

/** every *.spec.js under test/spec, as a path relative to the package */
function findSpecs(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = Path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return findSpecs(full);
    }
    return entry.name.endsWith(".spec.js")
      ? [Path.relative(pkgDir, full).split(Path.sep).join("/")]
      : [];
  });
}

describe("vitest projects", function() {
  it("should run every spec that intercepts stdout without console interception", () => {
    const project = vitestConfig.test.projects.find(p => p.test.name === "stdout-intercept");

    // an import line, so this spec's own mention of the module doesn't match
    const importsStdoutIntercept = /^\s*import .*["']xstdout["'];?\s*$/m;

    const intercepting = findSpecs(specDir).filter(spec =>
      importsStdoutIntercept.test(readFileSync(Path.join(pkgDir, spec), "utf8"))
    );

    //
    // a spec that intercepts stdout itself has to run with vitest's own console
    // interception off, or its output goes over the onUserConsoleLog RPC and a
    // log still in flight at worker teardown fails the whole run
    //
    expect(intercepting).to.not.be.empty;
    expect(project.test.disableConsoleIntercept).to.equal(true);
    expect(project.test.include).to.include.members(intercepting);
  });
});
