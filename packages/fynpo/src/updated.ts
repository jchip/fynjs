/* reuses some of the logics from https://github.com/lerna/lerna/blob/main/commands/changed/index.js */
import * as utils from "./utils.ts";
import { logger } from "./logger.ts";
import { getUpdatedPackages } from "./utils/get-updated-packages.ts";
import * as _ from "lodash-es";
import { FynpoDepGraph } from "@fynpo/base";

export class Updated {
  _cwd;
  _options;
  name;
  _versionLockMap;
  _graph: FynpoDepGraph;

  constructor(opts, graph: FynpoDepGraph) {
    this.name = "updated";
    this._cwd = opts.cwd;
    this._graph = graph;
    const fynpoRc: any = opts;

    const versionLocks = _.get(fynpoRc, "versionLocks", []);
    if (versionLocks[0] && versionLocks[0] === "*") {
      this._versionLockMap = utils.makeVersionLockMap([["name:/.*/"]], graph);
    } else {
      this._versionLockMap = utils.makeVersionLockMap(versionLocks, graph);
    }

    const commandConfig = (fynpoRc as any).command || {};
    const overrides = commandConfig[this.name];
    this._options = _.defaults(opts, overrides, fynpoRc);
  }

  exec() {
    const opts = Object.assign({}, this._options, {
      cwd: this._cwd,
      versionLockMap: this._versionLockMap,
    });

    const { pkgs: updates } = getUpdatedPackages(this._graph, opts);

    if (!updates.length) {
      logger.info(`No changed packages!`);
      return;
    }

    const messages = updates.map((name) => ` - ${name}`);
    logger.info(`Changed packages: \n${messages.join("\n")}`);
  }
}
