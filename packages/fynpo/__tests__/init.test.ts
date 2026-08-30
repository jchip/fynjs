import { describe, it, expect, afterAll, beforeEach, afterEach, vi } from "vitest";
import { Init } from "../src/init";
import path from "path";
import fs from "fs";
import shell from "shelljs";
import { makeSampleFixture, removeSampleFixture } from "./helpers/sample-fixture";

describe("fynpo Init", () => {
  // Init writes config files into cwd, so use a private copy of the sample - FPO-14
  const dir = makeSampleFixture("init");
  const packageJsonPath = path.join(dir, "package.json");

  afterAll(() => {
    removeSampleFixture(dir);
  });

  beforeEach(() => {
    // Ensure package.json exists
    if (!fs.existsSync(packageJsonPath)) {
      fs.writeFileSync(
        packageJsonPath,
        JSON.stringify({
          name: "test-repo",
          version: "1.0.0",
        })
      );
    }
  });

  afterEach(() => {
    // Clean up created files
    const fynpoConfigJs = path.join(dir, "fynpo.config.js");
    if (fs.existsSync(fynpoConfigJs)) {
      shell.rm("-f", fynpoConfigJs);
    }
  });

  //
  // updateFynpoConfig writes fynpo.config.js through prettier. prettier 3's format() returns a
  // promise, so this path had to become async - nothing covered it before, which is how it
  // stayed on a pinned prettier 2 for so long.
  //
  describe("updateFynpoConfig", () => {
    const fynpoJson = path.join(dir, "fynpo.json");

    afterEach(() => {
      if (fs.existsSync(fynpoJson)) shell.rm("-f", fynpoJson);
    });

    it("should write a prettier formatted fynpo.config.js", async () => {
      fs.writeFileSync(fynpoJson, JSON.stringify({ packages: ["packages/*"] }));

      const init = new Init({ cwd: dir, commitlint: true });
      await init.updateFynpoConfig();

      const out = fs.readFileSync(path.join(dir, "fynpo.config.js"), "utf8");

      // a promise leaking through instead of the formatted string is the failure this guards
      expect(out).to.not.contain("[object Promise]");
      expect(out).to.contain('"use strict"');
      expect(out).to.contain("module.exports =");
      expect(out).to.contain("commitlint");
      // prettier put it on more than one line and terminated the statement
      expect(out.split("\n").length).to.be.greaterThan(3);
      expect(out.trimEnd().endsWith(";")).to.equal(true);
    });

    it("should do nothing without the commitlint option", async () => {
      fs.writeFileSync(fynpoJson, JSON.stringify({ packages: ["packages/*"] }));

      const init = new Init({ cwd: dir });
      await init.updateFynpoConfig();

      expect(fs.existsSync(path.join(dir, "fynpo.config.js"))).to.equal(false);
    });
  });

  it("should initialize Init class", () => {
    const opts = { cwd: dir };
    const init = new Init(opts);

    expect(init.name).toBe("init");
    // Init class loads config which may change the cwd
    expect(init._cwd).toBeDefined();
    expect(init._options).toBeDefined();
  });

  it("should check if git is initialized", async () => {
    const opts = { cwd: dir };
    const init = new Init(opts);

    const isGit = await init.isGitInitialized();
    expect(typeof isGit).toBe("boolean");
  });

  it("should add dependency to package.json", () => {
    const opts = { cwd: dir };
    const init = new Init(opts);

    const rootPkg = {
      name: "test-repo",
      version: "1.0.0",
      dependencies: {
        "test-dep": "0.9.0"
      },
    };

    init.addDependency(rootPkg, "test-dep", "1.0.0");
    expect(rootPkg.dependencies["test-dep"]).toBe("^1.0.0");
  });

  it("should add dependency to devDependencies if not in dependencies", () => {
    const opts = { cwd: dir };
    const init = new Init(opts);

    const rootPkg: any = {
      name: "test-repo",
      version: "1.0.0",
      dependencies: {},
    };

    init.addDependency(rootPkg, "test-dev-dep", "2.0.0");
    expect(rootPkg.devDependencies).toBeDefined();
    expect(rootPkg.devDependencies["test-dev-dep"]).toBe("^2.0.0");
  });

  it("should update existing dependency", () => {
    const opts = { cwd: dir };
    const init = new Init(opts);

    const rootPkg: any = {
      name: "test-repo",
      version: "1.0.0",
      dependencies: {
        "existing-dep": "1.0.0",
      },
    };

    init.addDependency(rootPkg, "existing-dep", "2.0.0");
    expect(rootPkg.dependencies["existing-dep"]).toBe("^2.0.0");
    expect(rootPkg.devDependencies).toBeUndefined();
  });

  it("should add packages directory", async () => {
    const opts = { cwd: dir };
    const init = new Init(opts);

    const packagesDir = path.join(init._cwd, "packages");
    
    await init.addPackagesDirs();
    expect(fs.existsSync(packagesDir)).toBe(true);
  });

  it("should update package.json with commitlint dependencies", () => {
    const opts = { cwd: dir, commitlint: true };
    const init = new Init(opts);

    const originalPkg = JSON.parse(fs.readFileSync(packageJsonPath).toString());
    init.updatePackageJson();

    const updatedPkg = JSON.parse(fs.readFileSync(packageJsonPath).toString());
    // Check that dependencies or devDependencies were updated
    const hasCommitlint = 
      updatedPkg.dependencies?.["@commitlint/config-conventional"] || 
      updatedPkg.devDependencies?.["@commitlint/config-conventional"];
    const hasHusky = 
      updatedPkg.dependencies?.husky || 
      updatedPkg.devDependencies?.husky;
    
    expect(hasCommitlint).toBeTruthy();
    expect(hasHusky).toBeTruthy();
    expect(updatedPkg.scripts.prepare).toContain("husky install");

    // Restore original
    fs.writeFileSync(packageJsonPath, JSON.stringify(originalPkg, null, 2) + "\n");
  });

  it("should not update package.json without commitlint option", () => {
    const opts = { cwd: dir, commitlint: false };
    const init = new Init(opts);

    const originalPkg = JSON.parse(fs.readFileSync(packageJsonPath).toString());
    init.updatePackageJson();

    const updatedPkg = JSON.parse(fs.readFileSync(packageJsonPath).toString());
    expect(updatedPkg).toEqual(originalPkg);
  });
});


//
// FPO-36. fynpo's one chalker call site made `bin/fynpo.js`'s documented "load from TypeScript
// source" fallback dead under any TS loader that emits cjs: chalker is ESM-only and ends in a
// top-level await, which cjs cannot represent, so tsx aborted with a TransformError before
// fynpo printed anything. chalk 4 is CJS and already a dependency, so the fix was to drop
// chalker rather than add a third copy of the lazy-import shim.
//
describe("fynpo runs from TypeScript source (FPO-36)", () => {
  it("declares no dependency on chalker", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
    );

    expect(pkg.dependencies?.chalker).toBeUndefined();
    expect(pkg.devDependencies?.chalker).toBeUndefined();
  });

  it("has no chalker import left in src", () => {
    const srcDir = path.join(__dirname, "..", "src");
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith(".ts")) {
          const src = fs.readFileSync(full, "utf8");
          if (/^\s*import .*from "chalker"/m.test(src)) {
            offenders.push(path.relative(srcDir, full));
          }
        }
      }
    };
    walk(srcDir);

    expect(offenders, `chalker imported in: ${offenders.join(", ")}`).toEqual([]);
  });
});
