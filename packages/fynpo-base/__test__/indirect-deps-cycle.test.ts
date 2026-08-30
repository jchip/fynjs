import { describe, it, expect } from "vitest";
import { makePkgDeps } from "../src/index";

/**
 * Regression: a cycle between two packages OTHER than the one being walked used to recurse
 * until the stack blew.
 *
 * Real case in fynjs: `aveazul` devDepends on `bluebird` while `bluebird` depends on
 * `aveazul`. processIndirectDeps only stopped when a dep came straight back to the package it
 * started from, so every package downstream of that pair bounced between the two forever.
 * `fynpo prepare` died with "Maximum call stack size exceeded" before it could do anything.
 *
 * Note the cycle spans dependency sections (dev one way, dep the other), which is exactly how
 * it slips past a reviewer looking at just `dependencies`.
 */
const mkPkg = (name: string, deps: any = {}, devDeps: any = {}) => ({
  name,
  version: "1.0.0",
  dependencies: deps,
  devDependencies: devDeps,
  localDepsByType: { dep: [], dev: [], opt: [] },
  localDeps: [],
  dependents: [],
  indirectDeps: [],
});

describe("processIndirectDeps with a cycle between other packages", () => {
  it("terminates when two packages depend on each other across dep sections", () => {
    const packages = {
      // the cycle: aveazul --devDep--> bluebird --dep--> aveazul
      aveazul: mkPkg("aveazul", {}, { bluebird: "1.0.0" }),
      bluebird: mkPkg("bluebird", { aveazul: "1.0.0" }),
      // downstream of the cycle - this is what used to recurse forever
      consumer: mkPkg("consumer", { aveazul: "1.0.0" }),
    };

    const result: any = makePkgDeps(packages as any, { cwd: "." });

    expect(result.circulars.length).toBeGreaterThan(0);
    expect(result.circulars).toContainEqual(["aveazul", "bluebird"]);
  });

  it("still resolves indirect deps through a chain", () => {
    const packages = {
      a: mkPkg("a"),
      b: mkPkg("b", { a: "1.0.0" }),
      c: mkPkg("c", { b: "1.0.0" }),
    };

    const result: any = makePkgDeps(packages as any, { cwd: "." });

    // c -> b -> a, so a is an indirect dep of c
    expect(packages.c.localDeps).toContain("b");
    expect(packages.c.indirectDeps).toContain("a");
    expect(result.circulars).toEqual([]);
  });

  it("terminates for a longer cycle that never returns to the starting package", () => {
    const packages = {
      x: mkPkg("x", { y: "1.0.0" }),
      y: mkPkg("y", { z: "1.0.0" }),
      z: mkPkg("z", { x: "1.0.0" }),
      downstream: mkPkg("downstream", { x: "1.0.0" }),
    };

    // the assertion that matters is that this returns at all
    const result: any = makePkgDeps(packages as any, { cwd: "." });
    expect(result).toBeDefined();
  });
});

describe("processIndirectDeps without recursion (FPO-43)", () => {
  it("resolves a deep chain, deepest package first", () => {
    // Insertion order matters: with the deepest package reached first, the old recursive
    // walk descended one frame per link, so chain length was stack depth. The closure is
    // the same either way - this only changes how it is computed.
    const N = 150;
    const packages: any = {};
    for (let i = N - 1; i >= 0; i--) {
      packages[`p${i}`] = mkPkg(`p${i}`, i === 0 ? {} : { [`p${i - 1}`]: "1.0.0" });
    }

    const result: any = makePkgDeps(packages as any, { cwd: "." });

    expect(result.circulars).toEqual([]);
    // p149 -> p148 directly, and everything below it indirectly
    expect(packages[`p${N - 1}`].localDeps).toEqual([`p${N - 2}`]);
    expect(packages[`p${N - 1}`].indirectDeps.length).toBe(N - 2);
    expect(new Set(packages[`p${N - 1}`].indirectDeps).size).toBe(N - 2);
    expect(packages.p0.indirectDeps).toEqual([]);
    expect(packages.p1.indirectDeps).toEqual([]);
    expect(packages.p2.indirectDeps).toEqual(["p0"]);
  });

  it("names every package in a three-package cycle", () => {
    const packages = {
      x: mkPkg("x", { y: "1.0.0" }),
      y: mkPkg("y", { z: "1.0.0" }),
      z: mkPkg("z", { x: "1.0.0" }),
    };

    const result: any = makePkgDeps(packages as any, { cwd: "." });
    const named = new Set(result.circulars.flat());

    expect(named).toEqual(new Set(["x", "y", "z"]));
  });

  it("says which packages a cycle costs the run", () => {
    // `hub` sits in two cycles, so it ends up with more dependents than either spoke and
    // both spokes are the ones dropped to break them
    const packages = {
      hub: mkPkg("hub", { spokeA: "1.0.0", spokeB: "1.0.0" }),
      spokeA: mkPkg("spokeA", { hub: "1.0.0" }),
      spokeB: mkPkg("spokeB", { hub: "1.0.0" }),
    };

    const result: any = makePkgDeps(packages as any, { cwd: "." });

    // the consequence that used to happen in silence
    expect(packages.spokeA.ignore).toBe(true);
    expect(packages.spokeB.ignore).toBe(true);
    expect(packages.hub.ignore).toBeFalsy();

    const said = result.warnings.join("\n");
    expect(said).toContain("Circular local dependencies");
    expect(said).toContain("hub <-> spokeA");
    expect(said).toContain("hub <-> spokeB");
    expect(said).toMatch(/Ignoring spokeA, spokeB/);
    expect(said).toContain("dropped from this run");
  });

  it("stays quiet when there are no cycles", () => {
    const packages = {
      a: mkPkg("a"),
      b: mkPkg("b", { a: "1.0.0" }),
    };

    const result: any = makePkgDeps(packages as any, { cwd: "." });

    expect(result.circulars).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
