import { execShell } from "./utils/exec-shell.js";
import Path from "path";
import Fs from "fs";
// imported under its own name: shadowing `Promise` makes async return types invalid (FPO-41)
import AveAzul from "aveazul";
import { logger } from "./logger";
import * as utils from "./utils";
import * as _ from "lodash";
import fyn from "fyn/bin/index.mjs";
import shell from "shelljs";
import { FynpoDepGraph, FynpoPackageInfo } from "@fynpo/base";
import { TopoRunner } from "./topo-runner";
import { findStaleLocalDeps, formatStaleLocalDeps } from "./utils/check-stale-local-deps";
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

/** a packed tarball waiting to be published, and what it holds */
type TgzToPublish = { file: string; name: string; version: string };

/**
 * Outcome of the npm publish phase.
 *
 * `alreadyPublished` is kept apart from `failures` on purpose: the registry already having the
 * exact version being published is the desired end state, not a failure, and must not cost the
 * release its git tag (FPO-56).
 */
export type PublishOutcome = {
  /** publish failures that are real - the tag is skipped and the command exits non-zero */
  failures: Error[];
  /** `name@version` of packages the registry already had at that exact version */
  alreadyPublished: string[];
};

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
  _tgzFiles: TgzToPublish[];

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
    return execShell(command, cwd, silent);
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

  /**
   * Run one of a package's publish lifecycle scripts.
   *
   * `FYNPO_PUBLISH` tells the script it is running under `fynpo publish` rather than someone
   * typing `npm publish` in the package directory. A package that guards against being
   * published by hand can accept it as a sanctioned publisher instead of failing the release -
   * publish-util's check.js does exactly that. Without it, such a guard stops the whole run at
   * whichever package holds it (FPO-55).
   *
   * It is set around the call rather than passed down because fyn.run executes in this process;
   * the scripts it spawns inherit process.env. The previous value is restored so nothing leaks
   * into the npm publish phase.
   */
  async runScript(pkg: FynpoPackageInfo, script: string) {
    if (_.get(pkg.pkgJson, ["scripts", script])) {
      const pkgFullDir = Path.join(this._fynpoRc.cwd, pkg.path);
      const savedEnv = process.env.FYNPO_PUBLISH;
      process.env.FYNPO_PUBLISH = "1";
      shell.pushd(pkgFullDir);
      try {
        await fyn.run(["run", script, "--cwd", pkgFullDir], 0, false);
      } finally {
        shell.popd();
        if (savedEnv === undefined) {
          delete process.env.FYNPO_PUBLISH;
        } else {
          process.env.FYNPO_PUBLISH = savedEnv;
        }
      }
    }
  }

  /**
   * Refuse to publish while any package being published holds a stale copy of a local dep.
   *
   * fyn installs a local package as a physical copy, so rebuilding a workspace package's `dist`
   * leaves consumers holding the previous build until the next bootstrap. The pack phase runs
   * every package's `prepublishOnly` in topo order, so the *source* dist is always current -
   * but a bundler resolving the dep through `node_modules` reads the copy, not the source.
   * That is how fynpo@3.0.3 shipped without the dep graph fix that `@fynpo/base@2.0.2` published
   * in the same release (FPO-59). Nothing failed; the bundle was just built from old code.
   *
   * This is a hard stop rather than the warning `fynpo run` prints: a release is the one moment
   * where the artifact outlives the mistake.
   */
  checkStaleLocalDeps() {
    if (process.env.FYNPO_ALLOW_STALE_LOCAL_DEPS) {
      return;
    }

    const toPublishPaths = this._packagesToPublish.map((x) => x.path);
    const depDatas = this._graph
      .getTopoSortPackages()
      .sorted.filter((depData) => toPublishPaths.includes(depData?.pkgInfo?.path));

    const stale = findStaleLocalDeps(depDatas, this._cwd);
    // Only an outdated *file* stops the release. A manifest-only difference is not reliably
    // staleness - fyn writes a reduced manifest for an installed copy - and blocking a release
    // on it would trade a silent bad publish for a stuck good one. Those still get warned about.
    const outdatedBuilds = stale.filter((s) => s.files.length > 0);
    const manifestOnly = stale.filter((s) => s.files.length === 0);

    if (manifestOnly.length) {
      formatStaleLocalDeps(manifestOnly).forEach((line) => printWarning(line));
    }

    if (!outdatedBuilds.length) {
      return;
    }

    printError(
      [
        "Stale local dependency copies - publishing now would bundle outdated code",
        ...formatStaleLocalDeps(outdatedBuilds).slice(1),
        "",
        "Run 'fynpo bootstrap' to refresh them, then re-run publish.",
        "If bootstrap cannot run because prepare already pointed ranges at unpublished versions,",
        "reset the [Publish] commit, bootstrap, then re-run changelog and prepare.",
        "Set FYNPO_ALLOW_STALE_LOCAL_DEPS=1 to publish anyway.",
      ].join("\n")
    );
    process.exit(1);
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
          this._tgzFiles.push({
            file: Path.join(pkgFullDir, tgzName),
            name: pkgInfo.name,
            version: pkgInfo.version,
          });
        }
      },
    });

    const failures: Error[] = [];
    const alreadyPublished: string[] = [];
    const tgzPaths = this._tgzFiles.map((x) => x.file);

    if (!this._dryRun) {
      logger.info(`Publishing these tgz files with npm`, tgzPaths);
      for (const tgz of this._tgzFiles) {
        const tag = this._distTag ? ` --tag ${this._distTag}` : "";
        const cmd = `npm publish${tag} ${tgz.file}`;
        logger.info(`===== publishing ${tgz.file} with command '${cmd}'`);
        const sh = this._sh(cmd, Path.dirname(tgz.file));
        try {
          await sh.promise;
          logger.info(`===== Successfully published ${tgz.file} =====`);
          this._cleanupFile(tgz.file);
        } catch (err) {
          // classify before dropping output - that is where npm says why it refused
          const output = [_.get(err, "output.stdout", ""), _.get(err, "output.stderr", "")].join(
            "\n"
          );
          delete err.output;
          if (utils.isAlreadyPublishedError(output, tgz.version)) {
            logger.info(
              `===== ${tgz.name}@${tgz.version} is already published at that version =====`
            );
            alreadyPublished.push(`${tgz.name}@${tgz.version}`);
            this._cleanupFile(tgz.file);
          } else {
            logger.error(`==== failed to publish '${tgz.file}' ====`, err);
            failures.push(err);
          }
        }
      }
    } else {
      logger.info(`Dry-run true, not doing actual npm publish, tgz files:`, tgzPaths);
    }

    return { failures, alreadyPublished };
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

    this.checkStaleLocalDeps();

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
      const { failures, alreadyPublished } = await this.publishPackages();

      if (alreadyPublished.length > 0) {
        printWarning(
          `Registry already had these at the version being published: ${alreadyPublished.join(
            ", "
          )}`
        );
      }

      if (failures.length > 0) {
        printError(`Some packages failed to publish - skipping git release tag`);
        // a release script reading the exit code has to see this as the failure it is (FPO-56)
        process.exit(1);
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
