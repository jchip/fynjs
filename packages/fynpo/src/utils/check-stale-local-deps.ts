/**
 * Detect workspace packages whose source `package.json` no longer matches the copy installed
 * into a consumer's `node_modules`.
 *
 * fyn does not link an installed `package.json` back to its source - it writes a fresh physical
 * file so it can stamp `_from`/`_id` into it (see fyn's `pkg-installer.ts` `_savePkgJson`). That
 * snapshot is correct and keeps `node_modules` internally consistent, but it only refreshes when
 * install runs. Edit a workspace manifest without re-bootstrapping and consumers keep resolving
 * against the old one.
 *
 * The same goes for the package's *files*: fyn installs a local package as a physical copy
 * (hardlinked when it can), so rebuilding a workspace package's `dist` leaves every consumer
 * holding the previous build. A bundler that resolves the dep through `node_modules` then
 * bundles the old code, which is how fynpo@3.0.3 shipped without a fix that its own
 * `@fynpo/base` dependency had already published (FPO-59).
 *
 * That failure is silent and lands far from its cause: a consumer requires an entry point that
 * no longer exists, the child process dies on module resolution, and the parent just waits until
 * it times out. Nothing in the output names the stale package. This module exists to turn that
 * into one line naming it.
 */

import Fs from "fs";
import Path from "path";
import { PackageDepData } from "@fynpo/base";

/**
 * Manifest fields a consumer actually resolves against.
 *
 * Deliberately not a full manifest diff. fyn writes a *reduced* manifest for installed packages:
 * `devDependencies`, `prettier` and `publishUtil` are dropped, `scripts` is trimmed to lifecycle
 * entries, and `dist`/`_fyn`/`_from`/`_id` are added. Comparing everything reports those
 * normalizations as differences and buries the real signal - measured on this monorepo, a full
 * compare flagged ~100 of 114 pairs.
 */
export const RESOLUTION_FIELDS = [
  "version",
  "type",
  "main",
  "module",
  "browser",
  "types",
  "typings",
  "exports",
  "imports",
  "bin",
  "dependencies",
  "peerDependencies",
  "optionalDependencies",
  "engines",
] as const;

/** one workspace package found stale, with every consumer holding an outdated copy */
export type StaleLocalDep = {
  /** the workspace package whose source manifest moved on */
  name: string;
  /** paths of consumers whose installed copy is behind, relative to the monorepo top */
  consumers: string[];
  /** union of the resolution fields that differ, across those consumers */
  fields: string[];
  /** installed files whose content no longer matches the source, across those consumers */
  files: string[];
};

/**
 * Whether an installed manifest is a link to the given workspace source, rather than a copy
 * fetched from the registry.
 *
 * This check is what makes the comparison trustworthy. A workspace package name can also resolve
 * to a registry package of the same name at a different version - `bluebird` is pinned off local
 * resolution via `fyn.devDependencies` in aveazul, and xarc-run resolves `xaa@^1` from npm while
 * the workspace holds 2.0.0. Diffing either against the workspace source reports a large fake
 * change. Both are excluded here.
 *
 * @param installed - parsed installed `package.json`
 * @param srcFullPath - absolute path of the workspace package dir
 * @returns true when the installed copy is fyn's local link of that source
 */
export function isLocalLink(installed: Record<string, any>, srcFullPath: string): boolean {
  if (installed?.dist?.fullPath) {
    return Path.resolve(installed.dist.fullPath) === Path.resolve(srcFullPath);
  }
  return /-fynlocal/.test(installed?._id || "");
}

/**
 * Compare the resolution-relevant fields of a source manifest against an installed copy.
 *
 * @param src - parsed source `package.json`
 * @param installed - parsed installed `package.json`
 * @returns names of fields that differ, in {@link RESOLUTION_FIELDS} order
 */
export function diffResolutionFields(
  src: Record<string, any>,
  installed: Record<string, any>
): string[] {
  // publish-util drops these fields from what ships, and fyn applies the same list when it
  // installs a local copy - fyn itself declares `publishUtil.remove: ["dependencies"]` because
  // it bundles everything, so its installed copy has no `dependencies` and never will. Reading
  // that as staleness reported fyn as stale in packages/fynpo after every bootstrap.
  const removed: string[] = [].concat(src?.publishUtil?.remove || []);

  return RESOLUTION_FIELDS.filter((field) => {
    if (removed.includes(field) && installed[field] === undefined) {
      return false;
    }
    return JSON.stringify(src[field]) !== JSON.stringify(installed[field]);
  });
}

/**
 * Files fyn rewrites when it installs a package, so a difference in them is normalization
 * rather than staleness.
 *
 * - `package.json` gets `_id`/`_from`/`dist` stamped in and `scripts` trimmed;
 *   {@link diffResolutionFields} is what compares that file, on the fields that matter.
 * - source maps get their `sources` rewritten to point back at the workspace source dir
 *   (`../src/index.ts` becomes `../../../../../xaa/src/index.ts`), so every installed
 *   `.map` differs from the one the build produced. Measured on this monorepo, not excluding
 *   them reported xaa and pkg-foo as stale in 6 consumers that were perfectly current.
 */
const isRewrittenByInstall = (rel: string) => rel === "package.json" || rel.endsWith(".map");

/** relative paths of the files in a dir, skipping dot entries and nested installs */
const walkFiles = (dir: string, base = "", out: string[] = []): string[] => {
  let entries: Fs.Dirent[];
  try {
    entries = Fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") {
      continue;
    }
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walkFiles(Path.join(dir, entry.name), rel, out);
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }

  return out;
};

/**
 * Whether the installed file is still the one the workspace holds.
 *
 * Three signals, in order of what each can actually prove:
 *
 * 1. **inode identity** proves current. fyn hardlinks a local install where it can, so a fresh
 *    copy and its source are one file on disk under two names - nothing to read.
 * 2. **a differing mtime** proves not-current. The links only break when something rewrote the
 *    source (`rm -rf dist && tsc` makes new inodes), and that write stamps a new mtime. Deciding
 *    it here costs a stat instead of reading a multi-megabyte bundle.
 * 3. only when inodes differ but mtimes agree do size and bytes settle it. An equal mtime alone
 *    is NOT proof of equality - two independent writes share one when they land inside a single
 *    filesystem timestamp tick, which is how CI caught a same-size pair being passed as current.
 *
 * Caveat worth knowing: fyn's fallback when it cannot hardlink is `copyFile`/`clonefile`, and
 * neither carries the source mtime over. Where that fallback runs - a node_modules on another
 * device, or Windows without link privileges - every installed file reads as not-current here.
 * That direction is the safe one (it asks for a bootstrap that is never wrong to run) but it is
 * why this must not be the only gate: {@link diffResolutionFields} stays a warning, and only a
 * file difference in a package actually being published stops a release.
 */
const sameFile = (a: string, b: string): boolean => {
  try {
    const statA = Fs.statSync(a);
    const statB = Fs.statSync(b);
    // same inode on the same device: one file with two names
    if (statA.ino === statB.ino && statA.dev === statB.dev) {
      return true;
    }
    if (statA.mtimeMs !== statB.mtimeMs) {
      return false;
    }
    if (statA.size !== statB.size) {
      return false;
    }
    return Fs.readFileSync(a).equals(Fs.readFileSync(b));
  } catch {
    // one of them vanished mid-check - a diagnostic must not throw on a racing install
    return false;
  }
};

/**
 * Compare the files of an installed copy against the workspace source they came from.
 *
 * Only files the copy actually holds are compared. A workspace package carries sources, tests
 * and config that are never installed, and reporting those would flag every package with an
 * uncommitted test edit.
 *
 * @param srcDir - absolute path of the workspace package dir
 * @param copyDir - absolute path of the installed copy
 * @param limit - stop after this many differing files, to keep the message short
 * @returns relative paths of files that differ, capped at `limit`
 */
export function diffInstalledFiles(srcDir: string, copyDir: string, limit = 3): string[] {
  const diffs: string[] = [];

  for (const rel of walkFiles(copyDir)) {
    if (isRewrittenByInstall(rel)) {
      continue;
    }
    if (!sameFile(Path.join(srcDir, rel), Path.join(copyDir, rel))) {
      diffs.push(rel);
      if (diffs.length >= limit) {
        break;
      }
    }
  }

  return diffs;
}

const readJson = (file: string): Record<string, any> | undefined => {
  try {
    return JSON.parse(Fs.readFileSync(file, "utf8"));
  } catch {
    // an unreadable or half-written manifest is not something to fail a run over - this is a
    // diagnostic, so stay quiet and let the real command report whatever goes wrong downstream
    return undefined;
  }
};

/**
 * Find workspace packages with a stale installed copy in any consumer.
 *
 * Results are grouped by the stale source package rather than by consumer: one workspace package
 * linked into ten consumers is one problem with one fix (`fynpo bootstrap`), so it should read as
 * one warning, not ten.
 *
 * @param packages - dep data for the packages to check, from the topo sort
 * @param cwd - monorepo top dir
 * @returns stale packages, sorted by name
 */
export function findStaleLocalDeps(packages: PackageDepData[], cwd: string): StaleLocalDep[] {
  const byName = new Map<string, { consumers: string[]; fields: Set<string>; files: Set<string> }>();

  for (const depData of packages) {
    const consumerPath = depData?.pkgInfo?.path;
    if (!consumerPath) {
      continue;
    }

    for (const ref of Object.values(depData.localDepsByPath || {})) {
      const srcFullPath = Path.join(cwd, ref.path);
      const installedDir = Path.join(cwd, consumerPath, "node_modules", ref.name);

      const installed = readJson(Path.join(installedDir, "package.json"));
      // not installed under this consumer - an indirect local dep can be hoisted elsewhere, and
      // that is not staleness
      if (!installed || !isLocalLink(installed, srcFullPath)) {
        continue;
      }

      const src = readJson(Path.join(srcFullPath, "package.json"));
      if (!src) {
        continue;
      }

      const fields = diffResolutionFields(src, installed);
      const files = diffInstalledFiles(srcFullPath, installedDir);
      if (!fields.length && !files.length) {
        continue;
      }

      const entry = byName.get(ref.name) || {
        consumers: [],
        fields: new Set<string>(),
        files: new Set<string>(),
      };
      entry.consumers.push(consumerPath);
      fields.forEach((f) => entry.fields.add(f));
      files.forEach((f) => entry.files.add(f));
      byName.set(ref.name, entry);
    }
  }

  return [...byName.entries()]
    .map(([name, { consumers, fields, files }]) => ({
      name,
      consumers: consumers.sort(),
      fields: RESOLUTION_FIELDS.filter((f) => fields.has(f)) as string[],
      files: [...files].sort(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Render stale packages as warning lines.
 *
 * Split from detection so the wording can be asserted in tests without a filesystem fixture.
 *
 * @param stale - result of {@link findStaleLocalDeps}
 * @returns lines to log, empty when nothing is stale
 */
export function formatStaleLocalDeps(stale: StaleLocalDep[]): string[] {
  if (!stale.length) {
    return [];
  }

  const lines = [
    `WARNING: ${stale.length} local package${stale.length === 1 ? "" : "s"} changed since ${
      stale.length === 1 ? "it was" : "they were"
    } installed - run 'fynpo bootstrap' to refresh`,
  ];

  for (const { name, consumers, fields, files } of stale) {
    const changed = fields.concat(files);
    lines.push(`  - ${name} (${changed.join(", ")}) stale in: ${consumers.join(", ")}`);
  }

  return lines;
}
