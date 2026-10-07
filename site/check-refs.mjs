// Fails when a package's runtime export is not named in backticks in its docs/reference.md.
// Packages must be built first, since this imports each package's published entry.
import Fs from "node:fs";
import Path from "node:path";
import { pathToFileURL } from "node:url";

const PACKAGES = Path.join(import.meta.dirname, "..", "packages");

// Pick the file node would import for the package root.
function entryOf(pkg) {
  let e = pkg.exports?.["."] ?? pkg.exports ?? pkg.main;
  while (e && typeof e === "object") e = e.import ?? e.node ?? e.default ?? e.require;
  return e;
}

// Public members of an exported object: own and inherited, minus `_` names, stopping at
// node's own base classes.
function memberNames(obj) {
  const names = new Set();
  for (let o = obj; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    if (o.constructor?.name === "EventEmitter") break;
    for (const k of Object.getOwnPropertyNames(o)) {
      if (k !== "constructor" && !k.startsWith("_")) names.add(k);
    }
  }
  return [...names];
}

// Named exports, or a default object's members when the package only has a default export.
// Node adds a "module.exports" key when importing CommonJS.
function exportNames(mod) {
  const names = Object.keys(mod).filter(k => k !== "default" && k !== "module.exports");
  if (names.length === 0 && mod.default && typeof mod.default === "object") {
    return memberNames(mod.default);
  }
  return names;
}

const backticked = ref => {
  const words = new Set();
  for (const [, code] of ref.matchAll(/`([^`\n]+)`/g)) {
    for (const w of code.match(/[A-Za-z_$][\w$]*/g) || []) words.add(w);
  }
  return words;
};

let failed = 0;
for (const dir of Fs.readdirSync(PACKAGES)) {
  const pkgDir = Path.join(PACKAGES, dir);
  const refFile = Path.join(pkgDir, "docs", "reference.md");
  if (!Fs.existsSync(refFile)) continue;
  const pkg = JSON.parse(Fs.readFileSync(Path.join(pkgDir, "package.json"), "utf8"));
  const entry = entryOf(pkg);
  if (!entry) {
    console.log(`${dir}: no JS entry, skipped`);
    continue;
  }
  const entryFile = Path.join(pkgDir, entry);
  if (!Fs.existsSync(entryFile)) {
    console.log(`${dir}: ${entry} missing, build the package first`);
    failed++;
    continue;
  }
  const known = backticked(Fs.readFileSync(refFile, "utf8"));
  const missing = exportNames(await import(pathToFileURL(entryFile).href)).filter(n => !known.has(n));
  if (missing.length) {
    console.log(`${dir}: not in reference: ${missing.join(", ")}`);
    failed++;
  } else {
    console.log(`${dir}: ok`);
  }
}
process.exitCode = failed ? 1 : 0;
