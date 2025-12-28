export { quote, relative, unquote } from "./utils.ts";
export { resolveNpmCmd } from "./resolve-npm-cmd.ts";
export type { ResolveResult, ResolveOptions } from "./resolve-npm-cmd.ts";
export interface UnwrapOptions {
    path?: string;
    relative?: boolean;
    cwd?: string;
    jsOnly?: boolean;
}
export declare function unwrapNpmCmd(cmd: string, options?: UnwrapOptions): string;
export default unwrapNpmCmd;
