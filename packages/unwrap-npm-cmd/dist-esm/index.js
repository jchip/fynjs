import { resolveNpmCmd } from "./resolve-npm-cmd.js";
import { quote, relative } from "./utils.js";
export { quote, relative, unquote } from "./utils.js";
export { resolveNpmCmd } from "./resolve-npm-cmd.js";
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
            newExe = resolveNpmCmd(exe, options);
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
        jsFile = relative(jsFile, options.cwd);
    }
    if (options && options.jsOnly) {
        return quote(jsFile);
    }
    return [quote(process.execPath), quote(jsFile)].join(" ");
}
export function unwrapNpmCmd(cmd, options = { path: process.env.PATH }) {
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
export default unwrapNpmCmd;
//# sourceMappingURL=index.js.map