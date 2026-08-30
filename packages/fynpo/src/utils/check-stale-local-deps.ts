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
  return RESOLUTION_FIELDS.filter(
    (field) => JSON.stringify(src[field]) !== JSON.stringify(installed[field])
  );
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
  const byName = new Map<string, { consumers: string[]; fields: Set<string> }>();

  for (const depData of packages) {
    const consumerPath = depData?.pkgInfo?.path;
    if (!consumerPath) {
      continue;
    }

    for (const ref of Object.values(depData.localDepsByPath || {})) {
      const srcFullPath = Path.join(cwd, ref.path);
      const installedFile = Path.join(cwd, consumerPath, "node_modules", ref.name, "package.json");

      const installed = readJson(installedFile);
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
      if (!fields.length) {
        continue;
      }

      const entry = byName.get(ref.name) || { consumers: [], fields: new Set<string>() };
      entry.consumers.push(consumerPath);
      fields.forEach((f) => entry.fields.add(f));
      byName.set(ref.name, entry);
    }
  }

  return [...byName.entries()]
    .map(([name, { consumers, fields }]) => ({
      name,
      consumers: consumers.sort(),
      fields: RESOLUTION_FIELDS.filter((f) => fields.has(f)) as string[],
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

  for (const { name, consumers, fields } of stale) {
    lines.push(`  - ${name} (${fields.join(", ")}) stale in: ${consumers.join(", ")}`);
  }

  return lines;
}
