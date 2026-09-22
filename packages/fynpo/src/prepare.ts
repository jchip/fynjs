
import Fs from "fs";
import { writeJsonSync } from "@fynpo/base";
import Path from "path";
import * as _ from "lodash-es";
import { execShell } from "./utils/exec-shell.ts";
import { logger } from "./logger.ts";
import { readChangelogVersions } from "./read-changelog-versions.ts";
import Promise from "aveazul";
import Chalk from "chalk";
import assert from "assert";
import semver from "semver";
import * as utils from "./utils.ts";
import { checkNupdateTag, updateDep } from "./utils/update-package-versions.ts";
import { Bootstrap } from "./bootstrap.ts";
import { Run } from "./run.ts";
import {
  checkGitClean as gitIsClean,
  commitAndTagUpdates as commitAndTag,
} from "./utils/git-commit-updates.ts";
import {
  printHeader,
  printSection,
  printList,
  printSuccess,
  printWarning,
  printNextSteps,
  printCommand,
} from "./release-output.ts";
// prepare packages for publish

/**
 * What to report at the end of a prepare run.
 *
 * The old line was an unconditional "Package versions updated and committed" - printed under
 * `--no-commit` two lines after warning that committing was skipped, and printed when the
 * changelog only named versions the packages already had, so nothing was written at all
 * (FPO-49). Say what happened instead.
 *
 * Pure so it can be tested directly; {@link Prepare.exec} picks the printer from `level`.
 *
 * @param versionCount - how many packages had their own version bumped
 * @param fileCount - how many release files changed, including bootstrap and hook output
 * @param committed - whether a commit was actually made
 * @param tagged - how many tags were created
 * @returns the message and whether it is a success or a warning
 */
export const prepareOutcome = (
  versionCount: number,
  fileCount: number,
  committed: boolean,
  tagged: number
): { level: "success" | "warning"; message: string } => {
  const count = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;

  if (fileCount === 0) {
    return {
      level: "warning",
      message: "Nothing to update - every package already has the version CHANGELOG.md asks for",
    };
  }

  const updated = `Updated ${count(versionCount, "package version")} across ${count(fileCount, "file")}`;

  if (!committed) {
    return { level: "warning", message: `${updated} - not committed` };
  }

  return {
    level: "success",
    message: tagged > 0 ? `${updated}, committed and ${count(tagged, "tag")} created` : `${updated} and committed`,
  };
};

export class Prepare {
  name;
  _cwd;
  _fynpoRc;
  _graph;
  _packages;
  _allPackages;
  _markers;
  _versions;
  _tags;
  _options;
  _gitClean;

  constructor(opts, graph) {
    this.name = "prepare";
    this._cwd = opts.cwd;

    const { fynpoRc, dir } = utils.loadConfig(this._cwd);

    this._cwd = dir || opts.cwd;
    this._fynpoRc = fynpoRc || {};

    this._markers = this._fynpoRc.changeLogMarkers || ["## Packages", "## Commits"];
    this._graph = graph;
    //
    // prepare matches CHANGELOG.md entries against package names, so it wants one package
    // per name. Use the same managed representative as the changelog/version path, since
    // the graph may also contain higher-version unmanaged copies of that name.
    //
    const byName = _.get(graph, "packages.byName", {});
    this._packages = _.pickBy(
      _.mapValues(byName, (_infos, name) => utils.getManagedPackage(graph, name)),
      Boolean
    );
    const byPath = _.get(graph, "packages.byPath", {});
    this._allPackages = _.isEmpty(byPath)
      ? _.flatten(Object.values(byName) as any[][])
      : Object.values(byPath);
    this._versions = {};
    this._tags = [];

    const commandConfig = (this._fynpoRc as any).command || {};
    const overrides = commandConfig[this.name];
    this._options = _.defaults(opts, overrides, this._fynpoRc);
  }

  /**
   * Point a dependency range at a newly released version, keeping its semver prefix.
   *
   * Delegates to the shared helper (FJM-24); kept as a method because the class is the
   * unit under test.
   *
   * @returns true if any section was actually changed
   */
  updateDep(pkg, name, ver): boolean {
    return updateDep(pkg, name, ver);
  }

  checkGitClean = () => {
    return gitIsClean(this._sh.bind(this)).then((clean) => (this._gitClean = clean));
  };

  _sh(command) {
    return execShell(command, this._cwd);
  }

  _checkNupdateTag(pkg, newV) {
    return checkNupdateTag(pkg, newV, { fynpoRc: this._fynpoRc });
  }

  /**
   * Commit the release's changed files, and tag if asked to.
   *
   * @param packages - paths of the files to stage
   * @returns what actually happened, so the caller can say so rather than assume (FPO-49)
   */
  // no explicit Promise<> annotation: `Promise` here is aveazul's, and TypeScript requires the
  // global one as an async return type. Inference gives the right shape anyway.
  commitAndTagUpdates = async (packages) => {
    return commitAndTag(
      {
        sh: this._sh.bind(this),
        commit: this._options.commit,
        tag: this._options.tag === true,
        gitClean: this._gitClean,
        isSelective: utils.isSelectiveRelease(this._options),
      },
      { packages, tags: this._tags }
    );
  };

  async bootstrapAndRunHooks() {
    // Release selection must not exclude dependents whose ranges were rewritten.
    const opts = {
      ...this._options,
      cwd: this._cwd,
      only: undefined,
      ignore: undefined,
      scope: undefined,
    };
    const before = await utils.readFynpoData(this._cwd);
    for (let attempt = 0; attempt < 2; attempt++) {
      this._graph = await utils.resolveDepGraph(opts);
      const bootstrap = new Bootstrap(this._graph, opts);
      try {
        await bootstrap.exec({ fynOpts: opts.fynOpts, concurrency: opts.concurrency });
      } finally {
        bootstrap.logErrors();
      }
      if (bootstrap.failed) throw new Error("Prepare bootstrap failed");
      const after = await utils.readFynpoData(this._cwd);
      if (after.__timestamp === before.__timestamp) break;
    }

    this._graph = await utils.resolveDepGraph(opts);
    await new Run(
      { concurrency: 6, prefix: true, ...opts, sort: true, bail: true, cache: false, parallel: false },
      { script: "fynpo:prepare" },
      this._graph
    ).exec();
    if (Number(process.exitCode)) throw new Error("fynpo:prepare hook failed");
  }

  async getReleaseFiles() {
    const root = await this._sh("git rev-parse --show-toplevel");
    const tracked = await this._sh("git diff HEAD --no-relative --name-only -z");
    const created = await this._sh("git ls-files --others --exclude-standard --full-name -z -- :/");
    return [...new Set(`${tracked.stdout}\0${created.stdout}`.split("\0").filter(Boolean))]
      .map(file => Path.join(root.stdout.trim(), file));
  }

  async exec() {
    printHeader("Prepare Packages for Publish");

    if (!(await this.checkGitClean())) {
      throw new Error("Cannot prepare with a dirty working tree. Commit or stash your changes first.");
    }

    this.readChangelog();
    if (_.isEmpty(this._versions)) {
      // versions are matched against the discovered package names, so no packages
      // means no matches - blaming the changelog then sends people to the wrong file
      if (_.isEmpty(this._packages)) {
        logger.error(
          `No packages were discovered, so nothing could be matched against CHANGELOG.md.`,
          `Declare where your packages live in fynpo.json, e.g. "packages": ["*"].`
        );
      } else {
        logger.error("No versions found in CHANGELOG.md");
      }
      return undefined;
    }

    const changedPackages = new Map<string, any>();
    const releasedPaths = new Set<string>();
    const updatedPackages: string[] = [];

    _.each(this._packages, (pkg, name) => {
      if (!this._versions.hasOwnProperty(name)) return;

      const newV = this._versions[name];
      if (newV === pkg.version) return;

      // FynpoPackageInfo carries `private`, unlike the readFynpoPackages shape this used
      // to get - where it was always undefined and this check never fired. package.json is
      // still consulted as the authority.
      if (pkg.private === true || pkg.pkgJson?.private === true) {
        printWarning(`Skipping private package: ${pkg.name}`);
        return;
      }

      this._checkNupdateTag(pkg, newV);

      _.each(this._versions, (ver, name2) => {
        this.updateDep(pkg.pkgJson, name2, ver);
      });

      changedPackages.set(pkg.path, pkg);
      releasedPaths.add(pkg.path);
      updatedPackages.push(`${name}@${newV}`);
    });

    //
    // Dependents that are NOT being released still need their ranges pointed at what was.
    // A monorepo moves all in one: after publishing optional-import@0.0.2, chalker declaring
    // `^0.0.1` would be unsatisfiable, since caret on a 0.0.x version means exactly that
    // version. This matters for a selective release, where by definition most dependents are
    // not in the changelog.
    //
    // Their versions are deliberately NOT bumped. A bumped-but-unpublished version sitting in
    // git that does not exist on the registry would confuse the next release. The range
    // rewrite is itself a real change to the package, so the next changelog run picks it up
    // and bumps it for the right reason.
    //
    // These files are staged into the publish commit but their names never reach
    // `updatedPackages`, so they stay out of the commit body - and publish.ts requires BOTH
    // the changed path and the name in that body, so they are not published.
    //
    _.each(this._allPackages, (pkg) => {
      if (releasedPaths.has(pkg.path)) return;

      const touched = _.map(this._versions, (ver, relName) =>
        this.updateDep(pkg.pkgJson, relName, ver)
      ).some(Boolean);

      if (touched) {
        printWarning(`Updated ${pkg.name} dependency range - not released, will bump next time`);
        changedPackages.set(pkg.path, pkg);
      }
    });

    // all updated, write to disk. FynpoPackageInfo carries no `pkgFile`, so compose it from
    // `path` the same way utils/update-package-versions.ts does (FJM-25).
    changedPackages.forEach((pkg) => {
      writeJsonSync(Path.join(this._cwd, pkg.path, "package.json"), pkg.pkgJson);
    });

    await this.bootstrapAndRunHooks();

    const packageFiles = await this.getReleaseFiles();
    const { committed, tagged } = packageFiles.length
      ? await this.commitAndTagUpdates(packageFiles)
      : { committed: false, tagged: 0 };

    const outcome = prepareOutcome(updatedPackages.length, packageFiles.length, committed, tagged);
    if (outcome.level === "success") {
      printSuccess(outcome.message);
    } else {
      printWarning(outcome.message);
    }

    printNextSteps([
      `Review git status: ${printCommand("git status")}`,
      // nothing was committed, so HEAD~1 is somebody else's commit
      `Review package changes: ${printCommand(committed ? "git diff HEAD~1 --stat" : "git diff --stat")}`,
      `Publish packages: ${printCommand("fynpo publish")}`,
    ]);
  }

  readChangelog() {
    const fromCl = readChangelogVersions(this._cwd, this._packages, this._markers);
    this._versions = fromCl.versions;
    this._tags = fromCl.tags;
    if (this._tags.length) {
      printSection("Versions from CHANGELOG");
      const versionList: string[] = [];
      _.each(this._versions, (ver, name) => {
        versionList.push(`${name}@${ver}`);
      });
      printList(versionList);
    }
  }
}
