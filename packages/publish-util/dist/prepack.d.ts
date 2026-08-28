import { ExtractSpec, RemoveSpec, RenameSpec } from "./utils.js";
export interface PrePackConfig {
    rename?: RenameSpec;
    keep?: ExtractSpec;
    remove?: RemoveSpec;
    removeExtraKeys?: boolean;
    autoPostPack?: boolean;
    silent?: boolean;
}
export declare function prePackObj(pkg: Record<string, unknown>, config?: PrePackConfig): void;
export declare function prePack(): Promise<void>;
