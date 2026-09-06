/* eslint-disable no-console */
//
// Engines consistency check for the monorepo (FJM-172).
//
// A package that declares `engines.node` is promising every version in that range works. That
// promise is only real if its dependencies make the same promise. FJM-167 was exactly this
// gap: unwrap-npm-cmd said `>=22.18.0` while depending on which@7, which supports
// `^22.22.2 || ^24.15.0 || >=26.0.0` - so node 22.18 through 22.22.1 was declared supported by
// us and unsupported by a dependency we load on every call. Nothing in CI noticed, because CI
// runs one concrete version per leg and those legs happened to sit inside both ranges.
//
// The check is therefore about *declared* support, not about whether today's CI is green.
//
// Rather than a full `semver.subset`, which is too strict to be useful here - our floors are
// open-ended (`>=22.18.0` admits node 23 and 25, which almost no modern package claims to
// support) - this samples the versions that actually matter: the floor itself, and the lowest
// version of each additional major line the CI matrix exercises.
//
// Engines are read from the *installed* copy under node_modules rather than the registry, so
// the check is offline, deterministic, and describes the tree you actually have.
//
// Usage:
//   node tools/check-engines.mjs            check, exit 1 on a conflict
//   node tools/check-engines.mjs --report   list every finding, always exit 0
//
import Fs from "fs";
import Path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const semver = require("semver");

const root = Path.resolve(Path.dirname(fileURLToPath(import.meta.url)), "..");
const reportOnly = process.argv.includes("--report");

// The majors CI exercises, from .github/workflows/ci.yml. A dep that excludes the *lowest*
// version of a major we claim to support is a conflict even when CI's newer patch passes.
const CI_MAJOR_FLOORS = ["24.0.0", "26.0.0"];

// devDependencies count: CI's lowest leg runs the suite at the floor, so a devDep that excludes
// the floor breaks the build there just as surely as a runtime dep breaks a consumer.
const DEP_SECTIONS = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "devDependencies"
];

const readJson = file => JSON.parse(Fs.readFileSync(file, "utf8"));

/** lowest concrete version a range admits, e.g. ">=22.18.0" -> "22.18.0" */
const rangeFloor = range => {
  const m = range.match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? m[0] : null;
};

const pkgDir = Path.join(root, "packages");
const dirs = Fs.readdirSync(pkgDir).filter(d =>
  Fs.existsSync(Path.join(pkgDir, d, "package.json"))
);

const findings = [];
const skipped = [];

for (const dir of dirs) {
  const base = Path.join(pkgDir, dir);
  const pkg = readJson(Path.join(base, "package.json"));
  const ourRange = pkg.engines && pkg.engines.node;

  if (!ourRange) {
    skipped.push(`${pkg.name}: no engines.node`);
    continue;
  }

  const floor = rangeFloor(ourRange);
  if (!floor) {
    skipped.push(`${pkg.name}: could not read a floor out of engines.node "${ourRange}"`);
    continue;
  }

  // the floor, plus each CI major line our own range actually admits
  const probes = [floor, ...CI_MAJOR_FLOORS.filter(v => semver.satisfies(v, ourRange))];

  for (const section of DEP_SECTIONS) {
    for (const name of Object.keys(pkg[section] || {})) {
      const installed = Path.join(base, "node_modules", name, "package.json");
      if (!Fs.existsSync(installed)) {
        skipped.push(`${pkg.name} -> ${name}: not installed, run bootstrap`);
        continue;
      }

      const depRange = readJson(installed).engines && readJson(installed).engines.node;
      if (!depRange) {
        continue; // no claim made, nothing to contradict
      }

      const excluded = probes.filter(v => !semver.satisfies(v, depRange));
      if (excluded.length > 0) {
        findings.push({
          pkg: pkg.name,
          section,
          dep: name,
          ourRange,
          depRange,
          excluded
        });
      }
    }
  }
}

for (const f of findings) {
  console.error(
    `  ${f.pkg} [${f.section}] -> ${f.dep}\n` +
      `      we claim ${f.ourRange}, ${f.dep} claims ${f.depRange}\n` +
      `      unsupported by ${f.dep}: ${f.excluded.join(", ")}`
  );
}

if (reportOnly) {
  console.log(
    `check-engines: ${findings.length} conflict(s), ${skipped.length} skipped, ${dirs.length} packages`
  );
  for (const s of skipped) {
    console.log(`  skipped ${s}`);
  }
  process.exit(0);
}

if (findings.length > 0) {
  console.error(
    `\ncheck-engines: ${findings.length} dependency/dependencies do not support a node version we claim to.`
  );
  console.error("Pin the dep to a version whose engines cover our floor, or raise our engines.");
  process.exit(1);
}

console.log(`check-engines: no engines conflicts (${dirs.length} packages)`);
