"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveNpmCmd = exports.unquote = exports.relative = exports.quote = void 0;
exports.unwrapNpmCmd = unwrapNpmCmd;
const resolve_npm_cmd_ts_1 = require("./resolve-npm-cmd.cjs");
const utils_ts_1 = require("./utils.cjs");
var utils_ts_2 = require("./utils.cjs");
Object.defineProperty(exports, "quote", { enumerable: true, get: function () { return utils_ts_2.quote; } });
Object.defineProperty(exports, "relative", { enumerable: true, get: function () { return utils_ts_2.relative; } });
Object.defineProperty(exports, "unquote", { enumerable: true, get: function () { return utils_ts_2.unquote; } });
var resolve_npm_cmd_ts_2 = require("./resolve-npm-cmd.cjs");
Object.defineProperty(exports, "resolveNpmCmd", { enumerable: true, get: function () { return resolve_npm_cmd_ts_2.resolveNpmCmd; } });
const RESOLVE_CACHE = {};
function unwrapExe(exe, options) {
    const pathKey = options.path || "";
    let pathCache = RESOLVE_CACHE[pathKey];
    if (!pathCache) {
        pathCache = RESOLVE_CACHE[pathKey] = {};
    }
    let newExe;
    if (pathCache[exe]) {
        newExe = pathCache[exe];
    }
    else {
        try {
            newExe = (0, resolve_npm_cmd_ts_1.resolveNpmCmd)(exe, options);
            pathCache[exe] = newExe;
        }
        catch (_err) {
            pathCache[exe] = exe;
            return exe;
        }
    }
    if (typeof newExe === "string") {
        return newExe;
    }
    let { jsFile } = newExe;
    if (options && options.relative) {
        jsFile = (0, utils_ts_1.relative)(jsFile, options.cwd);
    }
    if (options && options.jsOnly) {
        return (0, utils_ts_1.quote)(jsFile);
    }
    return [(0, utils_ts_1.quote)(process.execPath), (0, utils_ts_1.quote)(jsFile)].join(" ");
}
function unwrapNpmCmd(cmd, options = { path: process.env.PATH }) {
    if (process.platform !== "win32") {
        return cmd;
    }
    const cmdParts = cmd.split(" ");
    const exe = unwrapExe(cmdParts[0], options);
    if (exe !== cmdParts[0]) {
        return [exe].concat(cmdParts.slice(1)).join(" ");
    }
    else {
        return cmd;
    }
}
exports.default = unwrapNpmCmd;
//# sourceMappingURL=index.cjs.map