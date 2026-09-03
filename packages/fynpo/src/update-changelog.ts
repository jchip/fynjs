/*
 * Looks at each commit that is not a "Merge pull request", figure out
 * the packages it modified and group the commit messages by package.
 *
 * Then check for [major], [minor], [patch] in the commit message, and
 * automatically generate the new package tag name with the would be
 * updated version.
 *
 * Write all these to the file CHANGELOG.md.
 *
 */


import Fs from "fs";
import xsh from "xsh";
import { execShell } from "./utils/exec-shell.js";
import {
  checkGitClean as gitIsClean,
  commitAndTagUpdates as commitAndTag,
} from "./utils/git-commit-updates.js";
import Path from "path";
import Promise from "aveazul";
xsh.Promise = Promise;
xsh.envPath.addToFront(Path.join(__dirname, "../node_modules/.bin"));
import _ from "lodash";
import * as utils from "./utils";
import { logger } from "./logger";
import {
  printHeader,
  printSection,
  printList,
  printSuccess,
  printWarning,
  printNextSteps,
  printCommand,
} from "./release-output";
import { getUpdatedPackages } from "./utils/get-updated-packages";
import {
  isAnythingCommitted,
  getNewCommits,
  collateCommitsPackages,
} from "./utils/git-list-commits";
import { determinePackageVersions } from "./utils/get-package-version";
import { updateChangelog } from "./utils/update-changelog-file";
import { updatePackageVersions } from "./utils/update-package-versions";
import { getCurrentBranch } from "./utils/get-current-branch";

import { FynpoDepGraph } from "@fynpo/base";

export default class Changelog {
  name;
  _cwd;
  _fynpoRc;
  _options;
  _changeLogFile;
  _changeLog;
  _versionLockMap;
  _gitClean;
  _lockAll: boolean;
  _graph: FynpoDepGraph;

  constructor(opts, graph: FynpoDepGraph) {
    this.name = "changelog";
    this._cwd = opts.cwd;
    this._fynpoRc = opts;
    this._graph = graph;

    const commandConfig = (this._fynpoRc as any).command || {};
    const overrides = [this.name, ...this.relatedCommands].map((key) => commandConfig[key]);
    this._options = _.defaults(opts, ...overrides, this._fynpoRc);

    const versionLocks = _.get(this._fynpoRc, "versionLocks", []);
    if (versionLocks[0] && versionLocks[0] === "*") {
      this._lockAll = true;
      this._versionLockMap = utils.makeVersionLockMap([["name:/.*/"]], graph);
    } else {
      this._versionLockMap = utils.makeVersionLockMap(versionLocks, graph);
    }

    try {
      this._changeLogFile = Path.resolve("CHANGELOG.md");
      this._changeLog = Fs.readFileSync(this._changeLogFile).toString();
    } catch {
      this._changeLogFile = Path.join(this._cwd, "CHANGELOG.md");
      this._changeLog = "";
    }
  }

  get relatedCommands() {
    return ["updated"];
  }

  _sh(command) {
    return execShell(command, this._cwd);
  }

  checkGitClean = () => {
    return gitIsClean(this._sh.bind(this)).then((clean) => (this._gitClean = clean));
  };

  commitChangeLogFile = () => {
    logger.info("Change log updated.");

    // Always resolve to a boolean (committed?) so the caller can safely chain
    // .then() - returning undefined here previously crashed the --no-commit and
    // dirty-tree paths with a TypeError.
    if (!this._options.commit) {
      logger.warn("commit option disabled, skip committing changelog file.");
      return Promise.resolve(false);
    }

    if (!this._gitClean) {
      logger.warn("Your git branch is not clean, skip committing updates.");
      return Promise.resolve(false);
    }

    return this._sh(`git add ${this._changeLogFile} && git commit -n -m "Update changelog"`)
      .then(() => {
        logger.info("Changelog committed");
        return true;
      })
      .catch((e) => {
        logger.error("Commit changelog failed", e);
        return false;
      });
  };

  /**
   * A release is selective when --only narrowed it to a subset of packages. Such a release is
   * tagged in its own namespace so it does not move the repo wide changelog boundary.
   */
  _isSelective(): boolean {
    return [].concat(this._options.only || []).filter(Boolean).length > 0;
  }

  commitAndTagUpdates = async ({ packages, tags }) => {
    return commitAndTag(
      {
        sh: this._sh.bind(this),
        commit: this._options.commit,
        tag: this._options.tag === true,
        gitClean: this._gitClean,
        isSelective: this._isSelective(),
        changeLogFile: this._changeLogFile,
      },
      { packages, tags }
    );
  };

  // the commit/tag result is deliberately not propagated - this is a terminal step in the
  // changelog pipeline, whose callers expect void. No explicit Promise<> annotation: `Promise`
  // here is aveazul's, and TypeScript requires the global one as an async return type (FPO-41).
  preparePackages = async (output) => {
    await updatePackageVersions(output).then(this.commitAndTagUpdates);
  };

  async exec() {
    printHeader("Changelog Update");

    const execOpts = {
      cwd: this._cwd,
    };
    if (!isAnythingCommitted(execOpts)) {
      logger.error(
        "No commits in this repository. Please commit something before using changelog."
      );
      return;
    }

    const currentBranch = getCurrentBranch(execOpts);

    if (currentBranch === "HEAD") {
      logger.error("Detached git HEAD, please checkout a branch to choose versions.");
      process.exit(1);
    }

    const opts = Object.assign({}, this._options, {
      cwd: this._cwd,
      changeLog: this._changeLog,
      changeLogFile: this._changeLogFile,
      fynpoRc: this._fynpoRc,
      versionLockMap: this._versionLockMap,
      lockAll: this._lockAll,
      graph: this._graph,
    });
    const changed = getUpdatedPackages(this._graph, opts);

    if (!changed.pkgs.length) {
      printWarning("No changed packages to update changelog.");
      return;
    }

    printSection("Changed Packages");
    printList(changed.pkgs);

    await this.checkGitClean();

    await getNewCommits(opts, changed)
      .then(collateCommitsPackages)
      .then(determinePackageVersions)
      .then(updateChangelog)
      .then((output) => {
        if (opts.publish) {
          return this.preparePackages(output);
        }
        return this.commitChangeLogFile().then((committed) => {
          if (committed) {
            printSuccess("Changelog updated and committed");
            printNextSteps([
              `Review the changes: ${printCommand("git diff HEAD~1 CHANGELOG.md")}`,
              `Check git status: ${printCommand("git status")}`,
              `Prepare packages: ${printCommand("fynpo prepare")}`,
            ]);
          } else {
            printWarning("Changelog updated but not committed");
            printNextSteps([
              `Review the changes: ${printCommand("git diff CHANGELOG.md")}`,
              `Prepare packages: ${printCommand("fynpo prepare")}`,
            ]);
          }
        });
      });
  }
}
