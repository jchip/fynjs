export interface PackageInfo {
    pkgDir: string;
    pkg: Record<string, unknown>;
    pkgData: Buffer;
    tmpDir: string;
    saveName: string;
    saveFile: string;
    pkgFile: string;
}
export declare function getInfo(cwd?: string): Promise<PackageInfo>;
export type RenameSpec = Record<string, string | string[]>;
export declare function renameFromObj(obj: Record<string, unknown>, rename?: RenameSpec): void;
export type RemoveSpec = (string | Record<string, RemoveSpec>)[];
export declare function removeFromObj(obj: Record<string, unknown>, fields: RemoveSpec): void;
export type ExtractSpec = (string | Record<string, ExtractSpec>)[];
export declare function extractFromObj(obj: Record<string, unknown>, fields: ExtractSpec, output?: Record<string, unknown>): Record<string, unknown>;
export declare const keepStandardFields: string[];
