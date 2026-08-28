export { quote, relative, unquote } from "./utils.js";
export { resolveNpmCmd } from "./resolve-npm-cmd.js";
export type { ResolveResult, ResolveOptions } from "./resolve-npm-cmd.js";
export interface UnwrapOptions {
    path?: string;
    relative?: boolean;
    cwd?: string;
    jsOnly?: boolean;
}
export declare function unwrapNpmCmd(cmd: string, options?: UnwrapOptions): string;
export default unwrapNpmCmd;
