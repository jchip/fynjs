/* eslint-disable no-console */
//
// CJS-in-ESM check (FPM-120).
//
// FPM-107 found `.test.js` files mixing ESM `import` with top-level `require`/`__dirname`. They
// passed only because vitest supplies CJS shims; under plain node they die with
// "ReferenceError: require is not defined in ES module scope".
//
// FPM-114 widened type-checking to cover test files hoping to catch that class, and FPM-120
// measured that it does not: `@types/node` declares `require`, `__dirname`, `__filename` and
// `module` as unconditional globals with no ESM/CJS discrimination, and `module: NodeNext` only
// rejects the `import x = require()` syntax form, not a plain `require()` call. A throwaway .ts
// file with all three produced zero tsc errors.
//
// So this is a separate check rather than a stricter tsconfig - the type layer cannot express it.
//
// Module format is resolved per FILE, not per package: node walks up to the nearest package.json.
// packages/fyn is `type: module` but ships `{"type":"commonjs"}` shields in test/, stubs/ and
// testing/, and the .ts specs under those are legitimately CJS. Getting this wrong in either
// direction makes the check useless, so it does the same walk node does.
//
// Deliberately NOT flagged: `createRequire(import.meta.url)`. That is the sanctioned ESM way to
// reach a CJS-only module and it works; rolldown.config.mjs and bin/index.mjs both use it.
//
// Usage:
//   node tools/check-cjs-in-esm.mjs            check, exit 1 on a violation
//   node tools/check-cjs-in-esm.mjs --report   list findings, always exit 0
//
import Fs from "fs";
import Path from "path";
import { fileURLToPath } from "url";

const root = Path.resolve(Path.dirname(fileURLToPath(import.meta.url)), "..");
const reportOnly = process.argv.includes("--report");

const SKIP_DIRS = new Set(["node_modules", "dist", ".fynpo", ".temp", ".git", "coverage", "fixtures", "scenarios"]);

/**
 * Blank out comments and string/template literals so a `require(` inside a doc comment or a
 * message string is not reported. Replaces with spaces to keep line/column offsets intact.
 */
const stripNonCode = src => {
  let out = "";
  let i = 0;
  const n = src.length;

  while (i < n) {
    const c = src[i];
    const next = src[i + 1];

    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") out += " ", i++;
    } else if (c === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      out += "  ";
      i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += " ";
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\") {
          out += "  ";
          i += 2;
          continue;
        }
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      out += " ";
      i++;
    } else {
      out += c;
      i++;
    }
  }

  return out;
};

const RULES = [
  { name: "require()", ident: "require", re: /(?<![.\w$])require\s*\(/g },
  { name: "__dirname", ident: "__dirname", re: /(?<![.\w$])__dirname(?![\w$])/g },
  { name: "__filename", ident: "__filename", re: /(?<![.\w$])__filename(?![\w$])/g },
  { name: "module.exports", ident: "module", re: /(?<![.\w$])module\s*\.\s*exports/g }
];

/**
 * A locally bound name is not the CJS global. `const require = createRequire(import.meta.url)`
 * is the sanctioned ESM escape hatch and must not be reported - @fynjs/confippet does exactly
 * that, and flagging it would make the check cry wolf on correct code.
 */
const declaresLocally = (code, name) =>
  new RegExp(
    `(?:const|let|var|function)\\s+${name}(?![\\w$])|` + // const require = ...
      `(?:const|let|var)\\s*\\{[^}]*(?<![\\w$])${name}(?![\\w$])[^}]*\\}\\s*=|` + // const { x } = ...
      `import\\s+(?:[^;]*(?<![\\w$])${name}(?![\\w$])[^;]*)\\s+from` // import x from ...
  ).test(code);

/**
 * Sources whose CJS globals are supplied by the build rather than by node.
 *
 * packages/fyn bundles cli/ and lib/ with rolldown, and rolldown.config.mjs injects a banner
 * defining `__filename`/`__dirname` from import.meta.url precisely so those call sites keep
 * working in the ESM bundle. They are correct as written; the check cannot see the banner.
 */
const BUILD_PROVIDES_CJS_GLOBALS = [
  { pkg: "fyn", dirs: ["cli", "lib"], idents: ["__dirname", "__filename"] }
];

const isBuildProvided = (relFile, ident) =>
  BUILD_PROVIDES_CJS_GLOBALS.some(
    entry =>
      entry.idents.includes(ident) &&
      entry.dirs.some(d => relFile.startsWith(`packages/${entry.pkg}/${d}/`))
  );

/** node's own rule: nearest package.json wins; .mts is always ESM, .cts always CJS */
const isEsmFile = (file, pkgRoot) => {
  const ext = Path.extname(file);
  if (ext === ".mts") return true;
  if (ext === ".cts") return false;

  let dir = Path.dirname(file);
  while (dir.length >= pkgRoot.length) {
    const manifest = Path.join(dir, "package.json");
    if (Fs.existsSync(manifest)) {
      try {
        return JSON.parse(Fs.readFileSync(manifest, "utf8")).type === "module";
      } catch {
        return false;
      }
    }
    dir = Path.dirname(dir);
  }
  return false;
};

const walk = (dir, acc) => {
  for (const entry of Fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(Path.join(dir, entry.name), acc);
    } else if (/\.(ts|mts)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      acc.push(Path.join(dir, entry.name));
    }
  }
  return acc;
};

const pkgDir = Path.join(root, "packages");
const findings = [];
let scanned = 0;

for (const d of Fs.readdirSync(pkgDir)) {
  const base = Path.join(pkgDir, d);
  if (!Fs.existsSync(Path.join(base, "package.json"))) continue;

  for (const file of walk(base, [])) {
    if (!isEsmFile(file, base)) continue;
    scanned++;

    const rel = Path.relative(root, file).split(Path.sep).join("/");
    const code = stripNonCode(Fs.readFileSync(file, "utf8"));

    for (const rule of RULES) {
      if (declaresLocally(code, rule.ident) || isBuildProvided(rel, rule.ident)) {
        continue;
      }

      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(code)) !== null) {
        const line = code.slice(0, m.index).split("\n").length;
        findings.push({ file: rel, line, rule: rule.name });
      }
    }
  }
}

for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  ${f.rule} in an ESM file`);
}

if (reportOnly) {
  console.log(`check-cjs-in-esm: ${findings.length} finding(s) in ${scanned} ESM source files`);
  process.exit(0);
}

if (findings.length > 0) {
  console.error(
    `\ncheck-cjs-in-esm: ${findings.length} CJS construct(s) in ESM files. These pass under vitest's
shims and throw "require is not defined in ES module scope" under plain node.
Use import, import.meta.dirname/url, or createRequire(import.meta.url) for a CJS-only module.`
  );
  process.exit(1);
}

console.log(`check-cjs-in-esm: clean (${scanned} ESM source files)`);
