import { describe, it, expect } from "vitest";
import Fs from "fs";
import Path from "path";
import { fileURLToPath } from "url";

//
// FPM-126: the declared node floor lives in three places that must agree, and nothing was
// keeping them together. When the floor moved 22.12 -> 22.18 (cf000d60) only package.json
// followed; the rolldown transform target and check-node.mjs both kept saying 22.12, so fyn
// shipped a bundle lowered further than needed and a version gate that waved through versions
// package.json says are unsupported.
//
const pkgDir = Path.resolve(Path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => Fs.readFileSync(Path.join(pkgDir, rel), "utf8");

/** "^22.18.0" / ">=22.18.0" -> "22.18" */
const floorMinorFromEngines = (range: string) => {
  const m = range.match(/(\d+)\.(\d+)\.\d+/);
  if (!m) {
    throw new Error(`could not read a version out of engines.node: ${range}`);
  }
  return `${m[1]}.${m[2]}`;
};

describe("declared node floor consistency", () => {
  const engines = JSON.parse(read("package.json")).engines.node;

  it("bin/check-node.mjs MIN_NODE should match package.json engines.node", () => {
    const engineFloor = engines.match(/(\d+\.\d+\.\d+)/)?.[1];
    const minNode = read("bin/check-node.mjs").match(/MIN_NODE\s*=\s*"([^"]+)"/)?.[1];

    expect(minNode).toBeDefined();
    expect(minNode).toBe(engineFloor);
  });

  it("rolldown transform target should match package.json engines.node", () => {
    const target = read("rolldown.config.mjs").match(/target:\s*"node([\d.]+)"/)?.[1];

    expect(target).toBeDefined();
    // a target above the floor ships syntax check-node.mjs would let through into a parse
    // error; below it, the bundle is lowered further than fyn claims to need
    expect(target).toBe(floorMinorFromEngines(engines));
  });
});
