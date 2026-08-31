import xsh from "xsh";
import Path from "path";
import Fs from "fs";
// imported under its own name: shadowing `Promise` makes async return types invalid (FPO-41)
import AveAzul from "aveazul";
import { logger } from "./logger";
import * as utils from "./utils";
import * as _ from "lodash";
import fyn from "fyn/bin/index.js";
import shell from "shelljs";
import { FynpoDepGraph, FynpoPackageInfo } from "@fynpo/base";
import { TopoRunner } from "./topo-runner";
import {
  printHeader,
  printSection,
  printList,
  printSuccess,
  printWarning,
  printError,
  printNextSteps,
  printCommand,
} from "./release-output";

/**
 * `fynpo publish` command executor class
 *
 */
export default class Publish {
  _cwd: string;
  _distTag: string;
  _dryRun: boolean;
  _push: boolean;
  _packagesToPublish: FynpoPackageInfo[];
  _fynpoRc: any;
  _tagTmpl: string;
  _selective: boolean;
  _graph: FynpoDepGraph;
  _tgzFiles: string[];

  constructor(opts, graph: FynpoDepGraph) {
    this._cwd = opts.cwd;
    this._fynpoRc = opts;
    this._graph = graph;
    this._dryRun = opts.dryRun;
    this._distTag = opts.distTag;
    this._push = opts.push;

    const gitTagTmpl = _.get(
      this._fynpoRc,
      "command.publish.gitTagTemplate",
      utils.defaultTagTemplate
    );

    this._tagTmpl = gitTagTmpl;
    this._tgzFiles = [];
    // set from the HEAD commit subject in getPackagesToPublish
    this._selective = false;
  }

  _sh(command: string, cwd = this._cwd, silent = false) {
    logger.info(`Executing shell command '${command}' in ${cwd}`);
    return xsh.exec(
      {
        silent,
        cwd,
        env: Object.assign({}, process.env, { PWD: cwd }),
      },
      command
    );
  }

  _logError(msg: string, err: Error, showOutput = false) {
    logger.error(msg, err.stack);
    if (showOutput) {
      const stdout = _.get(err, "output.stdout", "");
      const stderr = _.get(err, "output.stderr", "");
      stdout && logger.error(stdout);
      stderr && logger.error(stderr);
    }
  }

  getLatestTag() {
    // check both namespaces: a selective release does not block a later full release from a
    // different commit, but nothing should be published twice off the same HEAD
    const fullSearch = utils.makePublishTagSearchTerm(this._tagTmpl);
    const selectiveSearch = utils.makePublishTagSearchTerm(
      utils.makeSelectiveTagTemplate(this._tagTmpl)
    );
    const tagSearch = `${fullSearch} ${selectiveSearch}`;
    return this._sh(`git tag --points-at HEAD --list ${tagSearch}`).then((output) => {
      const tagInfo = output.stdout.split("\n").filter((x) => x.trim().length > 0);
      if (tagInfo.length > 0) {
        logger.error(
          "Error: HEAD commit already has a release tag. Assuming no packages changed since last release. Skipping publish!"
        );
        process.exit(1);
      }
      return;
    });
  }

  async getPackagesToPublish() {
    const [changedFiles, commitMsg] = await AveAzul.all([
      // this will output file paths with / as separator, even on windows
      // note: it may actually depend on git configuration
      this._sh(`git diff-tree --no-commit-id --name-only -r HEAD`),
      // get the commit message
      this._sh(`git log -1 --pretty=%B`),
    ]);

    if (!commitMsg.stdout.includes("[Publish]")) {
      logger.info(`Head git commit message doesn't have '[Publish]' - skip publish`);
      return [];
    }

    // a selective release only ships some packages, so it must not move the repo wide
    // changelog boundary - it gets tagged in its own namespace instead. See addReleaseTag.
    this._selective = commitMsg.stdout.includes(utils.selectivePublishSubject);
    if (this._selective) {
      logger.info(
        `Selective publish - tagging in the '${utils.selectiveTagPrefix}' namespace so the`,
        `changelog boundary stays at the last full release`
      );
    }

    const packageNames = utils.parsePublishedPackageNames(commitMsg.stdout);

    const packagePaths = changedFiles.stdout
      .split("\n")
      .map((x) => x.trim())
      .filter((x) => Path.basename(x) === "package.json")
      .map((x) => Path.dirname(x));

    const publishFilter = utils.makePublishFilter(this._fynpoRc, this._cwd);

    return Object.values(this._graph.packages.byId).filter((pkg: FynpoPackageInfo) => {
      return (
        packagePaths.includes(pkg.path) &&
        !pkg.pkgJson.private &&
        packageNames.includes(pkg.name) &&
        publishFilter(pkg)
      );
    });
  }

  async runScript(pkg: FynpoPackageInfo, script: string) {
    if (_.get(pkg.pkgJson, ["scripts", script])) {
      const pkgFullDir = Path.join(this._fynpoRc.cwd, pkg.path);
      shell.pushd(pkgFullDir);
      try {
        await fyn.run(["run", script, "--cwd", pkgFullDir], 0, false);
      } finally {
        shell.popd();
      }
    }
  }

  _cleanupFile(name: string) {
    try {
      shell.rm(name);
    } catch (_err) {
      //
    }
  }

  async publishPackages() {
    const toPublishPaths = this._packagesToPublish.map((x) => x.path);
    const topoRunner = new TopoRunner(this._graph.getTopoSortPackages(), this._fynpoRc);

    await topoRunner.start({
      concurrency: 1,
      processor: async (pkgInfo) => {
        if (toPublishPaths.includes(pkgInfo.path)) {
          logger.info(`Publishing ${pkgInfo.name} at path ${pkgInfo.path}`);

          const pkgFullDir = Path.join(this._fynpoRc.cwd, pkgInfo.path);

          shell.pushd(pkgFullDir);

          try {
            await this.runScript(pkgInfo, "prepublishOnly");
            const pack = this._sh("npm pack", pkgFullDir);
            await pack.promise;
            await this.runScript(pkgInfo, "publish");
            await this.runScript(pkgInfo, "postpublish");
          } finally {
            shell.popd();
          }

          const outName = pkgInfo.name.replace(/\//g, "-").replace(/@/g, "");
          const tgzName = `${outName}-${pkgInfo.version}.tgz`;
          logger.info(`Prepared ${tgzName} for publishing`);
          this._tgzFiles.push(Path.join(pkgFullDir, tgzName));
        }
      },
    });

    const errors: Error[] = [];

    if (!this._dryRun) {
      logger.info(`Publishing these tgz files with npm`, this._tgzFiles);
      for (const tgzFile of this._tgzFiles) {
        const tag = this._distTag ? ` --tag ${this._distTag}` : "";
        const cmd = `npm publish${tag} ${tgzFile}`;
        logger.info(`===== publishing ${tgzFile} with command '${cmd}'`);
        const sh = this._sh(cmd, Path.dirname(tgzFile));
        try {
          await sh.promise;
          logger.info(`===== Successfully published ${tgzFile} =====`);
          this._cleanupFile(tgzFile);
        } catch (err) {
          delete err.output;
          logger.error(`==== failed to publish '${tgzFile}' ====`, err);
          errors.push(err);
        }
      }
    } else {
      logger.info(`Dry-run true, not doing actual npm publish, tgz files:`, this._tgzFiles);
    }

    return errors;
  }

  async addReleaseTag(): Promise<{ tag: string; pushed: boolean; remote: string } | undefined> {
    printSection("Creating Release Tag");

    let newTag: string;

    try {
      const dryRun = this._dryRun ? `echo DRY RUN ` : "";
      let commitIds = [];

      if (this._tagTmpl.includes("{COMMIT}")) {
        const commitOutput = await this._sh(`git log --format="%h" -n 1`);
        commitIds = commitOutput.stdout.split("\n").filter((x) => x.trim().length > 0);
      }

      // a selective release is tagged in its own namespace. getLatestTag's --match comes from
      // the full-release template and git anchors the pattern, so `fynpo-rel-*` never matches
      // `selective-fynpo-rel-...` - which is what leaves the changelog boundary untouched.
      const tmpl = this._selective ? utils.makeSelectiveTagTemplate(this._tagTmpl) : this._tagTmpl;

      newTag = utils.makePublishTag(tmpl, {
        date: new Date(),
        gitHash: commitIds[0] || "",
      });

      await this._sh(`${dryRun}git tag -a ${newTag} -m "Release Tag"`);

      // a release tag belongs to a commit, not a branch, so releasing from a branch with no
      // upstream is normal and must not fail here - resolveTagRemote falls back to origin and
      // returns "" rather than throwing when it cannot pick one.
      const [gitStatus, gitRemotes] = await AveAzul.all([
        this._sh(`git status -b --porcelain=v2`, this._cwd, true),
        this._sh(`git remote`, this._cwd, true),
      ]);
      const gitRemote = utils.resolveTagRemote(gitStatus.stdout, gitRemotes.stdout);

      if (!this._push) {
        printSuccess(`Release tag ${newTag} created (not pushed)`);
        return { tag: newTag, pushed: false, remote: gitRemote };
      }

      if (!gitRemote) {
        printWarning(
          `Unable to determine a git remote - release tag ${newTag} created locally only`
        );
        return { tag: newTag, pushed: false, remote: "" };
      }

      await this._sh(`${dryRun}git push ${gitRemote} ${newTag}`, this._cwd, false);
      printSuccess(`Release tag ${newTag} created and pushed to ${gitRemote}`);
      return { tag: newTag, pushed: true, remote: gitRemote };
    } catch (err) {
      this._logError(`Failed to create release tag ${newTag}`, err);
      process.exit(1);
    }
  }

  async exec() {
    printHeader("Publish Packages");

    await this.getLatestTag();
    const packagesToPublish = await this.getPackagesToPublish();

    if (!packagesToPublish.length) {
      printWarning("No changed packages to publish!");
      process.exit(1);
    }

    this._packagesToPublish = packagesToPublish;
    const pkgList = packagesToPublish.map(
      (pkg: FynpoPackageInfo) => `${pkg.name}@${pkg.version}`
    );

    printSection("Packages to Publish");
    printList(pkgList);

    try {
      const fynpoPkgJson = JSON.parse(
        await Fs.promises.readFile(Path.join(this._cwd, "package.json"), "utf-8")
      );
      await this.runScript(
        {
          name: fynpoPkgJson.name,
          version: fynpoPkgJson.version,
          path: ".",
          pkgDir: this._cwd,
          pkgJson: fynpoPkgJson,
        } as FynpoPackageInfo,
        "prepublishOnly"
      );

      printSection("Publishing");
      const errors = await this.publishPackages();

      if (errors.length > 0) {
        printError(`Some packages failed to publish - skipping git release tag`);
      } else {
        const tagInfo = await this.addReleaseTag();
        printSuccess("All packages published successfully");
        if (tagInfo && !tagInfo.pushed) {
          printNextSteps([
            `Push the release tag: ${printCommand(
              `git push ${tagInfo.remote || "origin"} ${tagInfo.tag}`
            )}`,
          ]);
        }
      }
    } catch (err) {
      printError("Failure encountered publishing packages");
      logger.error(err);
      process.exit(1);
    }
  }
}
