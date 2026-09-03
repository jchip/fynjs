import _ from "lodash";
import Path from "path";
import Fs from "fs";
import Chalk from "chalk";
import assert from "assert";
import semver from "semver";
import { logger } from "../logger";
import { makePublishFilter } from "../utils";

export const checkNupdateTag = (pkg, newV, opts) => {
  const { pkgJson } = pkg;
  const fynpoTags = _.get(opts.fynpoRc, "command.publish.tags");
  const versionTagging = _.get(opts.fynpoRc, "command.publish.versionTagging", {});
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
};

/**
 * Point a dependency range at a newly released version, keeping its semver prefix.
 *
 * @returns true if any section was actually changed
 */
export const updateDep = (pkg, name, ver): boolean => {
  let changed = false;

  ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"].forEach((sec) => {
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
  });

  return changed;
};

export const updatePackageVersions = ({ versions, tags, collated }) => {
  if (_.isEmpty(versions)) {
    logger.error("No versions found in CHANGELOG.md");
    return undefined;
  }

  // The readPackages-shaped package objects (pkgJson/pkgDir/path/version) live
  // on the dep graph carried through the collate pipeline. `collated.opts.data`
  // was never populated, which previously left this a no-op (no version bumped).
  const graph = _.get(collated, "opts.graph");
  const cwd = _.get(collated, "opts.cwd", process.cwd());

  const packages = [];
  const updated = [];

  const publishFilter = makePublishFilter(_.get(collated, "opts.fynpoRc"));

  _.each(versions, (newV, name) => {
    const pkg = graph && graph.getPackageByName(name);
    if (!pkg || newV === pkg.version) return;

    if (pkg.private === true) {
      logger.info("skipping private package", pkg.name);
      return;
    }

    if (!publishFilter(pkg)) {
      logger.info("skipping package excluded from publishing", pkg.name);
      return;
    }

    checkNupdateTag(pkg, newV, collated.opts);

    _.each(versions, (ver, name2) => {
      updateDep(pkg.pkgJson, name2, ver);
    });

    updated.push(pkg);
    // must match where the file is actually written below - a monorepo whose
    // packages don't live under `packages/` would otherwise stage the wrong path
    packages.push(Path.join(pkg.path, "package.json"));
  });

  //
  // Private packages never show up in `versions` - they don't publish, so the changelog has
  // no entry for them. Their dependencies on packages that DID bump still have to be
  // rewritten: a private package left on `chalker: ^1.3.1` after chalker releases 2.0.0 has
  // nothing in the workspace satisfying it, and the next install fails to resolve it.
  // Nothing about the package itself changes - no version, no publishConfig.
  //
  _.each(_.get(graph, "packages.byName", {}), (infos: any) => {
    const pkg = _.first(infos as any[]);
    if (!pkg || pkg.private !== true) {
      return;
    }

    const before = JSON.stringify(pkg.pkgJson);
    _.each(versions, (ver, name2) => {
      updateDep(pkg.pkgJson, name2, ver);
    });

    if (JSON.stringify(pkg.pkgJson) === before) {
      return;
    }

    logger.info("updated workspace dep ranges in private package", pkg.name);
    updated.push(pkg);
    packages.push(Path.join(pkg.path, "package.json"));
  });

  // all updated, write to disk
  updated.forEach((pkg) => {
    Fs.writeFileSync(
      Path.join(cwd, pkg.path, "package.json"),
      `${JSON.stringify(pkg.pkgJson, null, 2)}\n`
    );
  });

  return Promise.resolve({ packages, tags });
};
