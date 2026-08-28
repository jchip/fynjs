import { PassThrough } from "stream";
interface PackageJson {
    name?: string;
    version?: string;
    scripts?: {
        prepare?: string;
        [key: string]: string | undefined;
    };
    [key: string]: any;
}
interface Manifest {
    _resolved?: string;
    [key: string]: any;
}
type InstallDependenciesCallback = (dir: string, message: string) => Promise<any>;
interface PkgPreperOptions {
    tmpDir: string;
    installDependencies: InstallDependenciesCallback;
}
declare class PkgPreper {
    private _tmpDir;
    private _installDependencies;
    constructor({ tmpDir, installDependencies }: PkgPreperOptions);
    packDirectory(mani: Manifest, dir: string, target: string): Promise<void>;
    depDirPacker(manifest: Manifest, dir: string): PassThrough;
    getDirPackerCb(): (manifest: Manifest, dir: string) => PassThrough;
}
export default PkgPreper;
export { PkgPreper };
export type { PkgPreperOptions, Manifest, PackageJson, InstallDependenciesCallback };
