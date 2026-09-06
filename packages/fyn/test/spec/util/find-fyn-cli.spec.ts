import { describe, it, expect } from "vitest";
import Fs from "fs";
import Path from "path";
import { findFynCli } from "../../../lib/lifecycle-scripts";

//
// npm_execpath has to point at fyn's own CLI. It used to be computed with plain path math from
// this module's location, which is right only while the bundle sits in fyn's own package -
// fynpo inlines fyn's dist into its own, and there the computed path does not exist.
//
describe("findFynCli", function () {
  it("resolves fyn's own CLI, and the file is really there", () => {
    const cli = findFynCli();
    expect(cli.endsWith(Path.join("bin", "fyn.mjs"))).toBe(true);
    expect(Fs.existsSync(cli), `${cli} does not exist`).toBe(true);
  });

  it("points at this package, not somewhere else on disk", () => {
    const pkgDir = Path.resolve(__dirname, "../../..");
    expect(Path.resolve(findFynCli())).toBe(Path.join(pkgDir, "bin", "fyn.mjs"));
  });

  it("memoizes, so repeated lifecycle scripts do not re-resolve", () => {
    expect(findFynCli()).toBe(findFynCli());
  });
});
