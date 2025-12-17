// @ts-nocheck
"use strict";

const chalk = require("chalk");
const CliLogger = require("../lib/cli-logger").default;
const logger = require("../lib/logger").default;
const Promise = require("aveazul");
const logFormat = require("../lib/util/log-format").default;
const PkgStatProvider = require("../lib/pkg-stat-provider");
const { FETCH_META } = require("../lib/log-items");

const PACKAGE_JSON = "~package.json";

const formatPkgId = pkg => {
  if (pkg.name === PACKAGE_JSON) {
    return chalk.cyan(pkg.name);
  }
  const top = pkg.promoted ? "" : "⬇";
  return `${logFormat.pkgId(pkg)}${top}`;
};

class ShowStat {
  constructor({ fyn }) {
    this._fyn = fyn;
    this._fyn._options.buildLocal = false;
    this._statProvider = new PkgStatProvider({ fyn });
  }

  _show(pkgIds) {
    return Promise.each(pkgIds, async pkgId => {
      const matches = this._statProvider.findMatchingVersions(pkgId);

      if (matches.versions.length === 0) {
        logger.prefix("").info(chalk.yellow(pkgId), "is not installed");
      } else {
        logger
          .prefix("")
          .info(
            chalk.green.bgRed(pkgId),
            "matched these installed versions",
            matches.versions.map(formatPkgId).join(" ")
          );

        for (const match of matches.versions) {
          const stat = await this._statProvider.getPackageStat(match.name, match.version);
          if (!stat) continue;

          // Show dependents
          if (stat.dependents.length > 0) {
            logger
              .prefix("")
              .info(
                "=>",
                logFormat.pkgId({ name: stat.name, version: stat.version }),
                `has ${stat.dependents.length} dependents:`,
                stat.dependents.map(formatPkgId).join(" ")
              );
          }

          // Show circular dependencies
          if (stat.circularDeps && stat.circularDeps.length > 0) {
            for (const circular of stat.circularDeps) {
              logger.prefix("").info("stat detected circular dependency:", circular.join(" "));
            }
          }

          // Show dependency paths
          const paths = stat.allPaths;
          const briefPaths = stat.significantPaths;

          if (paths.length > 0) {
            const formattedPaths = this._statProvider.formatPaths(briefPaths);
            const msg =
              paths.length === briefPaths.length
                ? `these dependency paths:`
                : `${paths.length} dependency paths, showing the ${briefPaths.length} most significant ones below:`;

            logger.prefix("").info(`=> ${stat.name}@${stat.version} has ${msg}`);
            logger.prefix("").info(formattedPaths.map(p => `  > ${p}`).join("\n"));
          }
        }
      }
    }).then(() => {
      logger.info(chalk.green(`stat completed for ${pkgIds.join(" ")}`));
    });
  }

  showStat(pkgIds) {
    const spinner = CliLogger.spinners[1];
    logger.addItem({ name: FETCH_META, color: "green", spinner });
    logger.updateItem(FETCH_META, "resolving dependencies...");
    return Promise.resolve(this._fyn.resolveDependencies())
      .then(() => {
        logger.removeItem(FETCH_META);
        return this._show(pkgIds);
      })
      .catch(err => {
        logger.error(err);
      })
      .finally(() => {
        logger.removeItem(FETCH_META);
      });
  }
}

module.exports = (fyn, pkgIds) => {
  return new ShowStat({ fyn }).showStat(pkgIds);
};
