
import Fs from "fs";
import Path from "path";
import _ from "lodash";
import { execShell } from "./utils/exec-shell.js";
import { logger } from "./logger";
import { readChangelogVersions } from "./read-changelog-versions";
import Promise from "aveazul";
import Chalk from "chalk";
import assert from "assert";
import semver from "semver";
import * as utils from "./utils";
import { checkNupdateTag, updateDep } from "./utils/update-package-versions.js";
import {
  checkGitClean as gitIsClean,
  commitAndTagUpdates as commitAndTag,
} from "./utils/git-commit-updates.js";
import {
  printHeader,
  printSection,
  printList,
  printSuccess,
  printWarning,
  printNextSteps,
  printCommand,
} from "./release-output";
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
 * @param fileCount - how many package.json files were staged, including dependency-range-only ones
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
  _markers;
  _data;
  _versions;
  _tags;
  _options;
  _gitClean;

  constructor(opts, data) {
    this.name = "prepare";
    this._cwd = opts.cwd;

    const { fynpoRc, dir } = utils.loadConfig(this._cwd);

    this._cwd = dir || opts.cwd;
    this._fynpoRc = fynpoRc || {};

    this._markers = this._fynpoRc.changeLogMarkers || ["## Packages", "## Commits"];
    this._data = data;
    this._versions = {};
    this._tags = [];

    const commandConfig = (this._fynpoRc as any).command || {};
    const overrides = commandConfig[this.name];
    this._options = _.defaults(opts, overrides, this._fynpoRc);
  }

  /**
   * A release is selective when --only narrowed it to a subset of packages. Such a release is
   * tagged in its own namespace so it does not move the repo wide changelog boundary.
   */
  _isSelective(): boolean {
    return [].concat(this._options.only || []).filter(Boolean).length > 0;
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
   * Commit the updated package.json files, and tag if asked to.
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
        isSelective: this._isSelective(),
      },
      { packages, tags: this._tags }
    );
  };

  async exec() {
    printHeader("Prepare Packages for Publish");

    this.readChangelog();
    if (_.isEmpty(this._versions)) {
      // versions are matched against the discovered package names, so no packages
      // means no matches - blaming the changelog then sends people to the wrong file
      if (_.isEmpty(this._data.packages)) {
        logger.error(
          `No packages were discovered, so nothing could be matched against CHANGELOG.md.`,
          `Declare where your packages live in fynpo.json, e.g. "packages": ["*"].`
        );
      } else {
        logger.error("No versions found in CHANGELOG.md");
      }
      return undefined;
    }

    const packages = [];
    const updatedPackages: string[] = [];

    _.each(this._data.packages, (pkg, name) => {
      if (!this._versions.hasOwnProperty(name)) return;

      const newV = this._versions[name];
      if (newV === pkg.version) return;

      // readFynpoPackages doesn't copy `private` onto the package info, so
      // `pkg.private` was always undefined and this check never fired - read it
      // from the package.json it does carry
      if (pkg.private === true || pkg.pkgJson?.private === true) {
        printWarning(`Skipping private package: ${pkg.name}`);
        return;
      }

      this._checkNupdateTag(pkg, newV);

      _.each(this._versions, (ver, name2) => {
        this.updateDep(pkg.pkgJson, name2, ver);
      });

      // pkg.path is where the file actually is - a hardcoded "packages" prefix
      // staged the wrong path for any repo not laid out under packages/
      packages.push(Path.join(pkg.path, "package.json"));
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
    _.each(this._data.packages, (pkg, name) => {
      if (this._versions.hasOwnProperty(name)) {
        return; // released above, its own deps were already rewritten
      }

      const touched = _.map(this._versions, (ver, relName) =>
        this.updateDep(pkg.pkgJson, relName, ver)
      ).some(Boolean);

      if (touched) {
        printWarning(`Updated ${pkg.name} dependency range - not released, will bump next time`);
        packages.push(Path.join(pkg.path, "package.json"));
      }
    });

    await this.checkGitClean();

    // all updated, write to disk
    _.each(this._data.packages, (pkg) => {
      Fs.writeFileSync(pkg.pkgFile, `${JSON.stringify(pkg.pkgJson, null, 2)}\n`);
    });

    const { committed, tagged } = await this.commitAndTagUpdates(packages);

    const outcome = prepareOutcome(updatedPackages.length, packages.length, committed, tagged);
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
    const fromCl = readChangelogVersions(this._cwd, this._data.packages, this._markers);
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
