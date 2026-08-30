
import { logger } from "../logger";
import { execSync } from "../child-process";
import { minimatch } from "minimatch";
import Path from "path";
import slash from "slash";
import _ from "lodash";
import { FynpoDepGraph } from "@fynpo/base";

import {
  makePublishTagSearchTerm,
  makePublishFilter,
  makeForeignRepoDetector,
  expandSelection,
} from "../utils";

const ifTagExists = (opts) => {
  let result = false;

  const tagTmpl = _.get(opts, "command.publish.gitTagTemplate");
  const searchTerm = makePublishTagSearchTerm(tagTmpl);

  try {
    result = !!execSync("git", ["tag", "--list", searchTerm], { cwd: opts.cwd });
  } catch (err) {
    logger.warn("Can't find latest release tag from this branch!");
  }

  return result;
};

const getLatestTag = (opts) => {
  const tagTmpl = _.get(opts, "command.publish.gitTagTemplate");
  const searchTerm = makePublishTagSearchTerm(tagTmpl);

  // --tags flag includes lightweight (unannotated) tags, not just annotated ones
  const describeArgs = (firstParent: boolean) =>
    ["describe", "--tags", "--long"]
      .concat(firstParent ? ["--first-parent"] : [])
      .concat(["--match", searchTerm]);

  const describe = (firstParent: boolean) => {
    try {
      return execSync("git", describeArgs(firstParent), { cwd: opts.cwd });
    } catch {
      return undefined;
    }
  };

  //
  // `--first-parent` keeps the boundary on this branch's own line, so a tag that arrived
  // on a merged side branch can't be mistaken for the last release. But a monorepo that
  // pulled another repo's history in through a merge has its release tags sitting on
  // second parents, where `git describe --first-parent` fails outright rather than
  // finding them - it used to take the whole command down with a raw execa error naming
  // neither the tag nor the problem (FPO-46).
  //
  // So: ask the strict way first and keep today's answer whenever it has one, and only
  // widen the search when it doesn't.
  //
  let offFirstParent = false;
  let stdout = describe(true);

  if (!stdout) {
    stdout = describe(false);
    offFirstParent = Boolean(stdout);
  }

  if (!stdout) {
    logger.warn(
      `Found release tags matching '${searchTerm}' but none of them describe HEAD - \
they are on other branches. Proceeding with no release boundary, so every package \
counts as changed and every commit is in range.`
    );
    return { tagName: undefined, commitCount: undefined, sha: undefined };
  }

  const [, tagName, commitCount, sha] = /^(.*)-(\d+)-g([0-9a-f]+)$/.exec(stdout) || [];

  if (!tagName) {
    logger.warn(`Could not read a release tag out of 'git describe' output: ${stdout}`);
  } else if (offFirstParent) {
    logger.warn(
      `Release tag ${tagName} is not on this branch's first-parent line - it came in \
through a merge. Using it as the release boundary anyway.`
    );
  }

  return { tagName, commitCount, sha };
};

const addDependents = (name, changed, graph: FynpoDepGraph, canPublish) => {
  const pkg = graph.getPackageByName(name);
  const dependentsByPath = graph.depMapByPath[pkg.path].dependentsByPath;

  Object.keys(dependentsByPath).forEach((path) => {
    const dep = graph.packages.byPath[path].name;
    // a dependent that can't be published must not be pulled back into the
    // changed set just because something it depends on changed
    if (!canPublish(dep)) {
      return;
    }
    if (!changed.pkgs.includes(dep)) {
      changed.pkgs.push(dep);
    }
    changed.depMap[dep] ??= [];
    changed.depMap[dep].push(name);
    // which section of the dependent's package.json the link comes from, so the bump
    // cascade can tell a runtime dep from a build time only one (FPO-45)
    changed.depSections[dep] ??= {};
    changed.depSections[dep][name] = dependentsByPath[path].depSection;
  });
};

const addVersionLocks = (name, changed, opts, canPublish) => {
  const verLocks = opts.versionLockMap[name];
  changed.verLocks[name] = [];

  if (verLocks) {
    for (const lockPkgName of _.without(verLocks, name)) {
      if (!canPublish(lockPkgName)) {
        continue;
      }
      if (!changed.pkgs.includes(lockPkgName)) {
        changed.pkgs.push(lockPkgName);
      }
      changed.verLocks[name].push(lockPkgName);
    }
  }
};

export const getUpdatedPackages = (graph: FynpoDepGraph, opts) => {
  let latestTag;
  const changed = {
    pkgs: [],
    depMap: {},
    depSections: {},
    verLocks: {},
    forceUpdated: [],
    latestTag: undefined,
  };
  const packages = graph.packages.byName || {};
  const forced = opts.forcePublish || [];
  const execOpts = {
    cwd: opts.cwd,
  };

  // `command.publish.includePackages` / `excludePackages`. Filtering here keeps every
  // downstream consumer consistent - the changed list that's printed, the changelog,
  // the version bumps, and the `[Publish]` commit body that publish later parses.
  // `packages` is keyed by name and each value is an array, since the same name can
  // exist at more than one path; a name is publishable if any of its paths is.
  const rc = opts.fynpoRc || opts;
  const publishFilter = makePublishFilter(rc);

  // packages living in a nested git repo can't be released from here at all
  const allowForeign = _.get(rc, "command.publish.allowForeignRepos", false);
  const foreignRepoOf = makeForeignRepoDetector(opts.cwd || process.cwd());
  const foreign: string[] = [];
  const isForeign = (info) => {
    const root = info && foreignRepoOf(info.path);
    if (root && !foreign.includes(info.path)) {
      foreign.push(info.path);
    }
    return Boolean(root) && !allowForeign;
  };

  // `--only` narrows the release to a subset. Expanded across version lock groups, because
  // publishing half a lock group would break the invariant the locks exist to enforce.
  const selection = expandSelection(opts.only, _.get(rc, "versionLocks", []));
  if (selection) {
    const unknown = [...selection].filter((name) => !packages[name]);
    if (unknown.length) {
      logger.error(`--only names packages that do not exist here: ${unknown.join(", ")}`);
      process.exit(1);
    }
    logger.info(`Selective release, only publishing: ${[...selection].join(", ")}`);
  }

  const canPublish = (name: string): boolean => {
    if (selection && !selection.has(name)) {
      return false;
    }
    const infos = [].concat(packages[name] || []);
    return infos.some((info) => publishFilter(info) && !isForeign(info));
  };
  const publishableNames = Object.keys(packages).filter(canPublish);

  if (foreign.length > 0) {
    const what = allowForeign ? "allowForeignRepos is set, keeping" : "cannot be released from here";
    logger.warn(
      `${foreign.length} package(s) are in a nested git repo - ${what}:\n  ${foreign.join("\n  ")}`
    );
  }

  const skipped = Object.keys(packages).length - publishableNames.length;
  if (skipped > 0) {
    logger.info(`Excluded ${skipped} package(s) from publishing`);
  }

  if (ifTagExists(opts)) {
    const { tagName, commitCount } = getLatestTag(opts);
    changed.latestTag = tagName;

    if (commitCount === "0" && forced.length === 0) {
      logger.info("No commits since previous release. Skipping change detection");
      return changed;
    }

    latestTag = tagName;
  }

  if (!latestTag || forced.includes("*") || opts.lockAll) {
    if (forced.includes("*")) {
      logger.info("Force updating all the packages.");
    }
    if (opts.lockAll) {
      logger.info("All packages are version locked.");
    }
    logger.info("Assuming all packages changed.");
    const pkgNames = publishableNames;
    pkgNames.forEach((name) => {
      changed.pkgs.push(name);
    });
    // A repo wide lock group belongs to `lockAll` only. Building one for `!latestTag` or
    // `--force-publish *` as well made every package inherit the repo wide MAXIMUM bump
    // type, so a single [maj] commit anywhere majored the entire monorepo (FPO-44). Those
    // two conditions only mean "assume everything changed" - each package still earns its
    // own bump, with the configured locks applied below like the tagged path does.
    if (opts.lockAll) {
      pkgNames.forEach((name) => {
        changed.verLocks[name] = pkgNames;
      });
    } else {
      pkgNames.forEach((name) => {
        addVersionLocks(name, changed, opts, canPublish);
      });
    }
  } else {
    logger.info(`Detecting changed packages since the release tag: ${latestTag}`);

    const ignoreChanges = opts.ignoreChanges || [];
    if (ignoreChanges.length) {
      logger.info("Ignoring changes in files matching patterns:", ignoreChanges);
    }
    const filterFunctions = ignoreChanges.map((p) =>
      minimatch.filter(`!${p}`, {
        matchBase: true,
        dot: true,
      })
    );

    const isForced = (name) => {
      if (forced.includes("*") || forced.includes(name)) {
        logger.info(`force updating package: ${name}`);
        changed.forceUpdated.push(name);
        return true;
      }
      return false;
    };

    const isChanged = (name) => {
      const pkg = packages[name][0];

      const args = ["diff", "--name-only", `${latestTag}...HEAD`];
      // `pkg.path` is repo-relative, so it has to be resolved against the repo before being
      // made relative to it - Path.relative would otherwise resolve it against process.cwd()
      // and produce `packages/xaa/packages/xaa` for anyone running fynpo from inside a
      // package, where git matches nothing and every package looks unchanged (FPO-47)
      const base = execOpts.cwd || process.cwd();
      const pathArg = slash(Path.relative(base, Path.resolve(base, pkg.path)));
      if (pathArg) {
        args.push("--", pathArg);
      }

      const diff = execSync("git", args, execOpts);
      if (diff === "") {
        return false;
      }

      let changedFiles = diff.split("\n");
      if (filterFunctions.length) {
        for (const filerFn of filterFunctions) {
          changedFiles = changedFiles.filter(filerFn);
        }
      }

      return changedFiles.length > 0;
    };

    publishableNames.forEach((name) => {
      if (isForced(name) || isChanged(name)) {
        changed.pkgs.push(name);
      }
    });

    changed.pkgs.forEach((name) => {
      addVersionLocks(name, changed, opts, canPublish);
    });
  }

  changed.pkgs.forEach((name) => {
    addDependents(name, changed, graph, canPublish);
  });

  return changed;
};
