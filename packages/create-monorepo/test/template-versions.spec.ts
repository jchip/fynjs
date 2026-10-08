import { describe, it, expect } from "vitest";
import Fs from "fs";
import Path from "path";
import { createRequire } from "module";
import { merge } from "lodash-es";
import { verify } from "run-verify";

import { fillTemplateVersions, myPkg } from "../src/utils.js";

const pkgDir = Path.resolve(import.meta.dirname, "..");
const readJson = (file: string) => JSON.parse(Fs.readFileSync(file, "utf8"));
const makePkg = createRequire(import.meta.url)(Path.join(pkgDir, "templates/_package.cjs"));

describe("template fyn and fynpo ranges", () => {
  it("come from create-monorepo's own devDependencies", () =>
    verify()
      .step(() => makePkg({}, merge))
      .step((pkg: any) => {
        // a literal range in the template is never updated by a release, so it must be a placeholder
        expect(pkg.devDependencies.fyn).toBe("{{fyn}}");
        expect(pkg.devDependencies.fynpo).toBe("{{fynpo}}");
        fillTemplateVersions(pkg);
        return pkg;
      })
      .step((pkg: any) => {
        expect(pkg.devDependencies.fyn).toBe(myPkg.devDependencies.fyn);
        expect(pkg.devDependencies.fynpo).toBe(myPkg.devDependencies.fynpo);
        expect(JSON.stringify(pkg)).not.toContain("{{");
      }));

  it("refuses to scaffold with a placeholder it can't fill", () =>
    verify()
      .expectError.step(() => fillTemplateVersions({ devDependencies: { fyn: "{{fyn}}" } }, {}))
      .step((err: any) => {
        expect(err.message).toContain("no fyn devDependency");
      }));

  // fynpo rewrites these ranges in the same [Publish] that releases fyn or fynpo, so they
  // always name the workspace version. A mismatch means the template would ship a stale range.
  it.each(["fyn", "fynpo"])("%s range matches the workspace %s version", (name) =>
    verify()
      .step(() => readJson(Path.join(pkgDir, "..", name, "package.json")).version)
      .step((version: string) => {
        expect(myPkg.devDependencies[name]).toBe(`^${version}`);
      }));
});
