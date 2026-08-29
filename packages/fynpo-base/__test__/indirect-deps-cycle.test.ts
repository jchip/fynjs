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
