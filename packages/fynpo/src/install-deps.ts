import Path from "path";
import VisualExec from "visual-exec";
import { isCI } from "./is-ci";
import _ from "lodash";
import { logger } from "./logger";
import { FynpoPackageInfo } from "@fynpo/base";
import { getFynExecutable, startFynMetaMemoizer } from "./utils";

export class InstallDeps {
  fynOptArgs: string[];
  topDir: string;

  constructor(topDir: string, fynOpts: string[]) {
    this.topDir = topDir;
    let logLevelOpts = "";
    if (fynOpts.indexOf("-q") < 0 && fynOpts.indexOf("--log-level") < 0) {
      logLevelOpts = "-q d";
    }

    this.fynOptArgs = [isCI ? "--pg simple" : ""].concat(
      fynOpts,
      logLevelOpts,
      `install`,
      `--sl`,
      `--no-build-local`,
      `--audit-file .fyn-audit.json`
    );
  }

  /**
   * Get the command to run fyn install
   * @returns
   */
  async getInstallCommand() {
    const command = [process.argv[0], getFynExecutable()]
      .concat(this.fynOptArgs, await startFynMetaMemoizer())
      .filter((x) => x)
      .join(" ");

    return command;
  }

  /**
   * Run fyn install with VisualExec
   * @param pkgInfo
   * @param displayTitle
   */
  async runVisualInstall(pkgInfo: FynpoPackageInfo, displayTitle: string) {
    const pkgDir = Path.join(this.topDir, pkgInfo.path);
    const ve = new VisualExec({
      displayTitle,
      cwd: pkgDir,
      command: await this.getInstallCommand(),
      visualLogger: logger,
    });

    ve.logFinalOutput = _.noop;

    try {
      await ve.execute();
    } catch (err: any) {
      // Ensure error has command context for better error reporting
      if (err && !err.command) {
        err.command = await this.getInstallCommand();
      }
      // the install runs with --sl, so the whole output is already on disk - say where.
      // What VisualExec shows is only the tail.
      logger.error(`Failed to install dependencies for ${pkgInfo.name}`);
      logger.error(`Check debug log for details: ${Path.join(pkgDir, "fyn-debug.log")}`);
      throw err;
    }
  }
}
