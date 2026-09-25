/**
 * What counts as non-runtime material in an installed `node_modules` tree.
 *
 * ESM, TypeScript. See index.ts for this module's own reasoning.
 *
 * Every rule is keyed on what a file *is*, never on which package ships it. A
 * rule that has to name a package is only correct for the dependency tree as it
 * looked on the day it was written, and it rots silently — the failure mode
 * being a runtime crash in a deployed image that no build-time check catches.
 *
 * License and notice files are never removed by these rules — they are gathered
 * into a single combined file first (see `isLicenseFile`). MIT, BSD and Apache
 * all require the copyright notice to travel with redistributed code, and
 * shipping a container image is redistribution.
 *
 * Build formats are deliberately not touched either. A package that publishes
 * both CJS and ESM has both trees reachable, and `require-in-the-middle` (which
 * @sentry/node and @opentelemetry monkey-patch through) needs the CJS one
 * present. Deleting a format risks a runtime failure no build-time check sees.
 * The one exception is `isBundlerOnlyEsnext`, which node provably cannot reach.
 */
import Fs from "fs";
import Path from "path";

export interface ManifestTargets {
  node: string[];
  bundler: string[];
}

/**
 * Removed whole, wherever they appear in the tree, except as a package's own
 * directory (see `isPackageRoot`).
 */
export const REMOVE_DIRS = new Set([
  "test",
  "tests",
  "__tests__",
  "spec",
  "__mocks__",
  "docs",
  "doc",
  "example",
  "examples",
  "benchmark",
  "benchmarks",
  "coverage",
  ".nyc_output",
  ".github",
  ".circleci",
  ".husky",
  ".idea",
  ".vscode"
]);

/**
 * Removed by extension, compared lower-case. `.ts` covers `.d.ts`, since the
 * extension is taken from the last dot; both are compile-time only. `.mts` and
 * `.cts` are the same in the module and commonjs flavours — node loads `.mjs`
 * and `.cjs`, never their TypeScript spellings, so nothing there is reachable
 * either.
 */
const REMOVE_EXTS = new Set([
  ".ts",
  ".mts",
  ".cts",
  ".map",
  ".tsbuildinfo",
  ".md",
  ".markdown",
  // Residue: something wrote these into the package and nobody swept up. A
  // publish is supposed to carry none of them, so finding one is already a
  // mistake — it is never a file node loads.
  ".log",
  ".tmp",
  ".temp",
  ".bak",
  ".orig",
  ".rej",
  ".swp",
  ".swo"
]);

/** Removed by exact name, case-sensitive. */
const REMOVE_NAMES = new Set([
  ".editorconfig",
  ".npmignore",
  ".gitignore",
  ".gitattributes",
  ".jshintrc",
  ".taprc",
  ".c8rc",
  ".nojekyll",
  ".runkit_example.js",
  "Makefile",
  ".DS_Store",
  "Thumbs.db"
]);

/**
 * YAML removed by exact name, compared lower-case. YAML is not removed by
 * extension: a package may read its own `.yaml` config, schema or spec at
 * runtime. These names are CI and tooling config that no package loads.
 */
const REMOVE_YAML_NAMES = new Set([
  ".travis.yml",
  "appveyor.yml",
  ".appveyor.yml",
  "azure-pipelines.yml",
  "bitbucket-pipelines.yml",
  ".drone.yml",
  ".gitlab-ci.yml",
  ".codeclimate.yml",
  "codecov.yml",
  ".codecov.yml",
  ".readthedocs.yml",
  ".readthedocs.yaml",
  ".pre-commit-config.yaml",
  ".yarnrc.yml",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ".mocharc.yml",
  ".mocharc.yaml",
  ".nycrc.yml",
  ".nycrc.yaml",
  ".lintstagedrc.yml",
  ".lintstagedrc.yaml",
  ".stylelintrc.yml",
  ".stylelintrc.yaml",
  ".markdownlint.yml",
  ".markdownlint.yaml",
  ".markdownlint-cli2.yaml",
  ".borp.yml",
  ".borp.yaml",
  ".airtap.yml"
]);

/**
 * Tooling config removed when the file name starts with one of these, compared
 * lower-case. Any extension, since a dotfile with these names is never loaded
 * by a package.
 *
 * `.eslint` and `.prettier` rather than `.eslintrc` and `.prettierrc`, so the
 * matching `.eslintignore` and `.prettierignore` go with them.
 */
const REMOVE_CONFIG_PREFIXES = [".eslint", ".prettier", ".babelrc"];

/**
 * Project documents removed when the file name starts with one of these,
 * compared lower-case, and only with a document extension. The names are
 * ordinary words, so a code file can start with one: the `history` package
 * loads `umd/history.production.min.js`.
 */
const REMOVE_DOC_PREFIXES = ["changelog", "history", "authors", "contributing", "code_of_conduct"];

const DOC_EXTS = new Set(["", ".md", ".markdown", ".txt", ".rst"]);

const TSCONFIG_RE = /^tsconfig.*\.json$/;

/**
 * Names that carry a copyright notice. The extension list keeps this from
 * matching source files such as `license.js`.
 *
 * This check runs *before* `isNonRuntimeFile`, which would otherwise delete the
 * nine `LICENSE.md` files in a BFF install under its `.md` rule.
 *
 * @param file file name, no directory part
 * @param ext extension including the dot, `""` for a dotfile
 */
export function isLicenseFile(file: string, ext: string): boolean {
  if (!LICENSE_EXTS.has(ext.toLowerCase())) {
    return false;
  }
  return LICENSE_RE.test(file);
}

const LICENSE_EXTS = new Set(["", ".txt", ".md", ".markdown"]);
const LICENSE_RE = /^(licen[cs]e|notice|copying)/i;

/**
 * @param file file name, no directory part
 * @param ext extension including the dot, `""` for a dotfile
 * @returns true when node never loads this file
 */
export function isNonRuntimeFile(file: string, ext: string): boolean {
  const lowerExt = ext.toLowerCase();
  if (REMOVE_EXTS.has(lowerExt)) {
    return true;
  }
  if (REMOVE_NAMES.has(file)) {
    return true;
  }
  const lower = file.toLowerCase();
  if (TSCONFIG_RE.test(lower) || REMOVE_YAML_NAMES.has(lower)) {
    return true;
  }
  if (REMOVE_CONFIG_PREFIXES.some(prefix => lower.startsWith(prefix))) {
    return true;
  }
  return DOC_EXTS.has(lowerExt) && REMOVE_DOC_PREFIXES.some(prefix => lower.startsWith(prefix));
}

/**
 * Is this fyn's installed-lock copy? fyn writes it at `.f/lock.yaml` to record
 * what it installed. A pruned tree no longer matches a fyn install, so the copy
 * goes, and fyn cannot trust it later. `.f/.fyn.json` stays: `fyn prod-prune`
 * reads its `production` flag.
 *
 * @param root the node_modules being cleaned
 * @param fullPath
 */
export function isFynInstalledLock(root: string, fullPath: string): boolean {
  return Path.relative(root, fullPath) === Path.join(".f", "lock.yaml");
}

/**
 * Is this directory a package's own folder rather than one inside it?
 * `REMOVE_DIRS` names are real package names too (`benchmark` is one), and
 * `esnext` sitting beside the `esm` package would pass `isBundlerOnlyEsnext`.
 * A name match alone would delete a whole dependency.
 *
 * A package folder sits directly under a `node_modules` (or the tree root),
 * under an `@scope` there, or in fyn's store at `.f/_/<name>` or
 * `.f/_/@scope/<name>`.
 *
 * @param root the node_modules being cleaned
 * @param dir full path of the directory
 */
export function isPackageRoot(root: string, dir: string): boolean {
  const parts = Path.relative(root, dir).split(Path.sep);
  const n = parts.length;
  const scoped = n >= 2 && parts[n - 2].startsWith("@");
  const container = scoped ? parts.slice(0, n - 2) : parts.slice(0, n - 1);
  const c = container.length;
  return (
    c === 0 ||
    container[c - 1] === "node_modules" ||
    (c === 2 && container[0] === ".f" && container[1] === "_")
  );
}

/**
 * Media and archives that survive the prune and are worth a human's attention.
 *
 * These are *reported, never removed*. An image or a zip in a server's runtime
 * tree is odd — it is usually a test fixture, a README screenshot or vendored
 * source — but a package is free to read its own asset at runtime, and nothing
 * about the file says which case this is. Deleting on a guess would break a
 * dependency in a way no build-time check catches, so the tool surfaces them
 * and leaves the judgement to whoever reads the build log.
 *
 * Native and WebAssembly binaries (`.node`, `.wasm`, `.so`, `.dylib`) are
 * deliberately absent: those genuinely are loaded at runtime.
 *
 * @param ext extension including the dot
 */
export function isReviewableAsset(ext: string): boolean {
  return REVIEW_EXTS.has(ext.toLowerCase());
}

const REVIEW_EXTS = new Set([
  // images
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp", ".avif", ".svg", ".psd",
  // video and audio
  ".mp4", ".webm", ".mov", ".mp3", ".wav", ".ogg",
  // fonts
  ".ttf", ".otf", ".woff", ".woff2", ".eot",
  // archives and pre-compressed payloads
  ".zip", ".tar", ".tgz", ".gz", ".bz2", ".xz", ".7z", ".rar", ".br",
  // editor and diagram documents
  ".pdf", ".drawio", ".sketch"
]);

/**
 * Is this `esnext/` directory a build only a bundler will ever read?
 *
 * `esnext` is not a condition node implements, so node can enter such a
 * directory only if the package's own manifest points at it. Two questions
 * decide it, and both must agree:
 *
 * 1. **Can node reach it?** Every path a resolver can land on comes from the
 *    manifest — `main`, `bin`, or an `exports` entry under a condition node
 *    implements (`import`, `require`, `node`, `default`). If any of them lands
 *    inside the directory, it stays, whatever else suggests otherwise. This is
 *    what keeps the rule from going stale: a future package that does point
 *    node at its `esnext/` is left alone instead of being broken at runtime.
 *
 * 2. **Is something else claiming it?** Absence of evidence is not enough, so
 *    the directory also has to be claimed by a bundler: named under a condition
 *    node does not implement (`esnext`, `module`, `browser`, `webpack`, …),
 *    pointed at by the legacy `module` field, or sitting beside an `esm/`
 *    sibling — which shows the package publishes per-syntax-level variants for
 *    a bundler to choose between. Anything unclaimed is left alone.
 *
 * The one case this cannot see is a reachable file reaching sideways with a
 * relative `../esnext/x.js` import. Packages publish parallel compiled outputs
 * precisely so that they do not cross-import, so the assumption holds in
 * practice, but it is an assumption rather than a proof.
 *
 * @param dir full path of the candidate `esnext` directory
 * @param siblings names of the entries beside it
 * @param manifestTargets resolves a package directory to its manifest paths,
 *   memoised by the caller
 */
export function isBundlerOnlyEsnext(
  dir: string,
  siblings: (string)[],
  manifestTargets: (dir: string) => ManifestTargets
): boolean {
  if (Path.basename(dir) !== "esnext") {
    return false;
  }
  const pkgDir = findPackageDir(dir);
  if (!pkgDir) {
    return false;
  }
  const inside = `${Path.relative(pkgDir, dir).split(Path.sep).join("/")}/`;
  const pointsInside = (target: string) => target.replace(/^\.\//, "").startsWith(inside);

  const targets = manifestTargets(pkgDir);
  if (targets.node.some(pointsInside)) {
    return false;
  }
  return targets.bundler.some(pointsInside) || siblings.includes("esm");
}

/** Nearest ancestor directory holding a package.json, or `""`. */
function findPackageDir(dir: string): string {
  let cur = Path.dirname(dir);
  for (let i = 0; i < 8 && cur && cur !== Path.dirname(cur); i++) {
    if (Fs.existsSync(Path.join(cur, "package.json"))) {
      return cur;
    }
    cur = Path.dirname(cur);
  }
  return "";
}

/** Conditions node resolves. `module` and `esnext` are bundler conventions. */
const NODE_CONDITIONS = new Set(["import", "require", "node", "node-addons", "default"]);

/**
 * Split a manifest's entry points into the ones node can resolve and the ones
 * only a bundler will.
 *
 * @param pkgDir directory holding the package.json
 */
export function readManifestTargets(pkgDir: string): ManifestTargets {
  const targets: ManifestTargets = { node: [], bundler: [] };
  let manifest: any;
  try {
    manifest = JSON.parse(Fs.readFileSync(Path.join(pkgDir, "package.json"), "utf8"));
  } catch {
    return targets;
  }
  if (typeof manifest.main === "string") {
    targets.node.push(manifest.main);
  }
  if (typeof manifest.bin === "string") {
    targets.node.push(manifest.bin);
  } else if (manifest.bin && typeof manifest.bin === "object") {
    for (const key of Object.keys(manifest.bin)) {
      targets.node.push(manifest.bin[key]);
    }
  }
  // `module` is the pre-`exports` way to offer a bundler an ESM build; node has
  // never read it.
  if (typeof manifest.module === "string") {
    targets.bundler.push(manifest.module);
  }
  collectExportTargets(manifest.exports, targets, false);
  return targets;
}

function collectExportTargets(node: any, targets: ManifestTargets, bundlerOnly: boolean): void {
  if (typeof node === "string") {
    targets[bundlerOnly ? "bundler" : "node"].push(node);
    return;
  }
  if (!node || typeof node !== "object") {
    return;
  }
  for (const key of Object.keys(node)) {
    if (key.startsWith(".")) {
      collectExportTargets(node[key], targets, bundlerOnly);
    } else if (key !== "types") {
      collectExportTargets(node[key], targets, bundlerOnly || !NODE_CONDITIONS.has(key));
    }
  }
}
