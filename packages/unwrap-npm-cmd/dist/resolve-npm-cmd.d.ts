export interface ResolveResult {
    jsFile: string;
}
export interface ResolveOptions {
    path?: string;
}
export declare function resolveNpmCmd(exe: string, options?: ResolveOptions): string | ResolveResult;
