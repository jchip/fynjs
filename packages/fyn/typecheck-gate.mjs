/* eslint-disable no-console */
//
// Typecheck gate for packages/fyn (FJM-154).
//
// fyn is not type-clean yet, so `tsc --noEmit` cannot simply be wired into `ci:check` the
// way it is for every other TS package in this repo. This runs tsc and compares what it
// reports against a recorded baseline, failing only on errors that are NEW.
//
// The baseline records one line per error as `<file> TS<code>`, so it is stable against the
// message-text churn that any type edit causes - changing an interface routinely rewords a
// dozen unrelated "missing the following properties" messages without changing what is
// actually wrong. A regression is any (file, code) pair appearing more often than the
// baseline allows, or a total above the baseline total.
//
// Usage:
//   node typecheck-gate.mjs            check, exit 1 on regression
//   node typecheck-gate.mjs --update   rewrite the baseline from the current state
//
import { spawnSync } from "child_process";
import Fs from "fs";
import Path from "path";
import { fileURLToPath } from "url";

const dir = Path.dirname(fileURLToPath(import.meta.url));
const baselineFile = Path.join(dir, "tsc-baseline.txt");
const update = process.argv.includes("--update");

const tsc = Path.join(dir, "node_modules", ".bin", "tsc");
const result = spawnSync(tsc, ["--noEmit", "-p", "tsconfig.json"], {
  cwd: dir,
  encoding: "utf8",
  shell: process.platform === "win32"
});

if (result.error) {
  console.error(`typecheck-gate: could not run ${tsc}:`, result.error.message);
  process.exit(2);
}

const output = `${result.stdout || ""}${result.stderr || ""}`;
// only the lines that start an error; tsc indents the explanation lines under them
const errorLine = /^(\S[^(]*)\(\d+,\d+\): error (TS\d+):/;
const current = [];
for (const line of output.split("\n")) {
  const m = line.match(errorLine);
  if (m) {
    current.push(`${m[1].split(Path.sep).join("/")} ${m[2]}`);
  }
}
current.sort();

if (update) {
  Fs.writeFileSync(baselineFile, `${current.join("\n")}\n`);
  console.log(`typecheck-gate: baseline updated - ${current.length} errors`);
  process.exit(0);
}

if (!Fs.existsSync(baselineFile)) {
  console.error(`typecheck-gate: no baseline at ${baselineFile}. Run with --update to create it.`);
  process.exit(2);
}

const baseline = Fs.readFileSync(baselineFile, "utf8").split("\n").filter(Boolean);

const tally = list => list.reduce((acc, k) => acc.set(k, (acc.get(k) || 0) + 1), new Map());
const baseCount = tally(baseline);
const curCount = tally(current);

const regressions = [];
for (const [key, count] of curCount) {
  const allowed = baseCount.get(key) || 0;
  if (count > allowed) {
    regressions.push(`  ${key}: ${count} (baseline ${allowed})`);
  }
}

if (regressions.length > 0) {
  console.error(
    `typecheck-gate: ${regressions.length} new type error(s) - fyn's baseline may shrink, never grow:`
  );
  console.error(regressions.sort().join("\n"));
  console.error("\nRun `nvx tsc --noEmit -p tsconfig.json` to see them in full.");
  process.exit(1);
}

if (current.length < baseline.length) {
  console.log(
    `typecheck-gate: ${baseline.length - current.length} error(s) fixed.`,
    "Run `node typecheck-gate.mjs --update` and commit the smaller baseline."
  );
  process.exit(0);
}

console.log(`typecheck-gate: no new type errors (${current.length} known, unchanged)`);
