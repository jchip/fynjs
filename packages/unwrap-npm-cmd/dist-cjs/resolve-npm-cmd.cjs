"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveNpmCmd = resolveNpmCmd;
const tslib_1 = require("tslib");
const fs_1 = tslib_1.__importDefault(require("fs"));
const which_1 = tslib_1.__importDefault(require("which"));
const path_1 = tslib_1.__importDefault(require("path"));
const utils_ts_1 = require("./utils.cjs");
const nodeJsVer = parseInt(process.versions.node.split(".")[0]);
function resolveNpmCmd(exe, options) {
    var _a, _b;
    // look for the windows CMD batch npm generates for JS
    const resolvedExe = which_1.default.sync(exe, options);
    if (path_1.default.extname(resolvedExe).toLowerCase() !== ".cmd") {
        // since we already did the work to find it, use found full path
        return (0, utils_ts_1.quote)(resolvedExe);
    }
    // read the batch and find the node.exe execution line
    const script = fs_1.default.readFileSync(resolvedExe)
        .toString()
        .split("\n")
        .map((x) => x.trim());
    const binName = path_1.default.basename(resolvedExe).toLowerCase();
    const resolvedDir = path_1.default.dirname(resolvedExe);
    // handle npm
    let nodeCmd;
    if (binName === "npm.cmd") {
        nodeCmd = (_a = script.find((l) => l.startsWith(`SET "NPM_CLI_JS=`))) === null || _a === void 0 ? void 0 : _a.replace(/NPM_CLI_JS=/, "");
    }
    else if (binName === "npx.cmd") {
        nodeCmd = (_b = script.find((l) => l.startsWith(`SET "NPX_CLI_JS=`))) === null || _b === void 0 ? void 0 : _b.replace(/NPX_CLI_JS=/, "");
    }
    else {
        nodeCmd =
            script.find((l) => l.startsWith(`"%~dp0\\node.exe"`)) ||
                script.find((l) => l.startsWith(`"%_prog%"`));
    }
    if (!nodeCmd) {
        return (0, utils_ts_1.quote)(resolvedExe);
    }
    // update JS script from batch file
    const a = nodeCmd.split(" ").filter((x) => x)[1];
    const b = a.replace(`%~dp0`, resolvedDir).replace(`%dp0%`, resolvedDir);
    let jsFile;
    if (nodeJsVer < 18) {
        jsFile = path_1.default.normalize(b);
    }
    else {
        // starting with version 18, the behavior changed when there're escaping quotes
        jsFile = (0, utils_ts_1.quote)(path_1.default.normalize((0, utils_ts_1.unquote)(b)));
    }
    return { jsFile };
}
//# sourceMappingURL=resolve-npm-cmd.cjs.map