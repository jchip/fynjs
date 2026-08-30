
import Fs from "fs";
import Path from "path";
import _ from "lodash";
import xsh from "xsh";
import { logger } from "./logger";
import { readChangelogVersions } from "./read-changelog-versions";
import Promise from "aveazul";
import Chalk from "chalk";
import assert from "assert";
import semver from "semver";
import * as utils from "./utils";
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
   * @returns true if any section was actually changed
   */
  updateDep(pkg, name, ver): boolean {
    let changed = false;

    ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"].forEach(
      (sec) => {
        const deps = pkg[sec];
        if (_.isEmpty(deps) || !deps.hasOwnProperty(name)) {
          return;
        }

        let semType = "";
        const sem = deps[name][0];

        if (sem.match(/[\^~]/)) {
          semType = sem;
        } else if (!sem.match(/[0-9]/)) {
          return;
        }

        const updated = `${semType}${ver}`;
        if (deps[name] !== updated) {
          deps[name] = updated;
          changed = true;
        }
      }
    );

    return changed;
  }

  checkGitClean = () => {
    return this._sh(`git diff --quiet`)
      .then(() => (this._gitClean = true))
      .catch(() => (this._gitClean = false));
  };

  _sh(command) {
    return xsh.exec(
      {
        silent: true,
        cwd: this._cwd,
        env: Object.assign({}, process.env, { PWD: this._cwd }),
      },
      command
    );
  }

  _checkNupdateTag(pkg, newV) {
    const { pkgJson } = pkg;
    const fynpoTags = _.get(this._fynpoRc, "command.publish.tags");
    const versionTagging = _.get(this._fynpoRc, "command.publish.versionTagging", {});
    const existPubConfig = _.get(pkgJson, "publishConfig");

    let updated;

    if (fynpoTags) {
      Object.keys(fynpoTags).find((tag) => {
        const tagInfo = fynpoTags[tag];
        if (tagInfo.enabled === false) {
          return undefined;
        }

        let enabled = _.get(tagInfo, ["packages", pkgJson.name]);

        if (enabled === undefined && tagInfo.regex) {
          enabled = Boolean(tagInfo.regex.find((r) => new RegExp(r).exec(pkgJson.name)));
        }

        const tagPkgs = _.get(tagInfo, "packages");
        if (tagInfo.enabled === false || !tagPkgs.hasOwnProperty(pkgJson.name)) {
          return undefined;
        }

        if (!enabled) {
          // npm tag not enabled for package
          if (pkgJson.publishConfig) {
            // remove tag from package.json if it exist
            delete pkgJson.publishConfig.tag;
          }
          // default to latest tag
          return (updated = "latest");
        }

        // enabled, update tag in package.json
        pkgJson.publishConfig = Object.assign({}, pkgJson.publishConfig, { tag });
        return (updated = tag);
      });
    }

    if (versionTagging.hasOwnProperty(pkgJson.name)) {
      assert(!updated, `package ${pkgJson.name} has both tag and versionTagging`);
      const semv = semver.parse(newV);
      const tag = `ver${semv.major}`;
      pkgJson.publishConfig = Object.assign({}, pkgJson.publishConfig, { tag });
      updated = tag;
    }

    // reset exist tag to latest in case lerna config
    if (existPubConfig && !updated && existPubConfig.tag && existPubConfig.tag !== "latest") {
      logger.warn(
        Chalk.red(
          `Pkg ${pkgJson.name} has exist publishConfig.tag ${existPubConfig.tag} \
that's not latest but none set in fynpo config`
        )
      );
      // existPubConfig.tag = "latest";
    }

    pkgJson.version = newV;
  }

  commitAndTagUpdates = (packages) => {
    if (!this._options.commit) {
      logger.warn("commit option disabled, skip committing updates.");
      return;
    }

    if (!this._gitClean) {
      logger.warn("Your git branch is not clean, skip committing updates.");
      return;
    }

    return this._sh(`git add ${packages.map((x) => `"${x}"`).join(" ")}`)
      .then((output) => {
        logger.info("git add", output);
        return this._sh(
          `git commit -n -m "${utils.makePublishCommitSubject(this._isSelective())}"` +
            ` -m " - ${this._tags.join("\n - ")}"`
        );
      })
      .then((output) => {
        logger.info("git commit", output);

        if (this._options.tag !== true) {
          return false;
        }

        return Promise.each(this._tags, (tag) => {
          logger.info("tagging", tag);
          return this._sh(`git tag ${tag}`).then((tagOut) => {
            logger.info("tag", tag, "output", tagOut);
          });
        });
      });
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

    await this.commitAndTagUpdates(packages);

    printSuccess("Package versions updated and committed");
    printNextSteps([
      `Review git status: ${printCommand("git status")}`,
      `Review package changes: ${printCommand("git diff HEAD~1 --stat")}`,
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
