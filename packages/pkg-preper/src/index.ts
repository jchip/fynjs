//
// With code copied from:
//
// https://github.com/npm/cli/blob/58ece8973f43c77b1f4f44ded0f49556ad30eb57/lib/pack.js
//
// Licensed under The Artistic License 2.0 as the original code.
//
// Heavily modified to allow custom callback hooks
//
// Prepare packages that did not come from npm registry, therefore may not
// have gone through the standard npm publish process, and npm scripts such
// as prepare may not have been executed.
//
// So if npm script prepare exist, then need to install dependencies (with dev)
// for the package, execute the prepare script, and finally pack files into
// tgz file for pacote.
//

import * as cacache from "cacache";
import * as Path from "path";
import { PassThrough } from "stream";
// @ts-ignore - mississippi has no types
import * as mississippi from "mississippi";
import * as tar from "tar";
import packlist from "npm-packlist";
import * as Fs from "opfs";

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

const readPkgJson = (dir: string): Promise<PackageJson> => {
  return Fs.readFile(Path.join(dir, "package.json")).then((data: Buffer) =>
    JSON.parse(data.toString().trim())
  );
};

const promisify = <T extends (...args: any[]) => any>(
  fn: T,
  context?: any
): ((...args: Parameters<T>) => Promise<any>) => {
  return (...args: Parameters<T>) => {
    return new Promise((resolve, reject) => {
      fn.call(context, ...args, (err: Error | null, result: any) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  };
};

const pipe = promisify(mississippi.pipe, mississippi);

class PkgPreper {
  private _tmpDir: string;
  private _installDependencies: InstallDependenciesCallback;

  constructor({ tmpDir, installDependencies }: PkgPreperOptions) {
    this._tmpDir = tmpDir;
    this._installDependencies = installDependencies;
  }

  packDirectory(mani: Manifest, dir: string, target: string): Promise<void> {
    return readPkgJson(dir).then((pkg) => {
      return cacache.tmp.withTmp(this._tmpDir, { tmpPrefix: "packing" }, (tmp: string) => {
        const tmpTarget = Path.join(tmp, Path.basename(target));

        const tarOpt: any = {
          file: tmpTarget,
          cwd: dir,
          prefix: "package/",
          portable: true,
          // Provide a specific date in the 1980s for the benefit of zip,
          // which is confounded by files dated at the Unix epoch 0.
          mtime: new Date("1985-10-26T08:15:00.000Z"),
          gzip: true,
        };

        return Promise.resolve(packlist({ path: dir }))
          .then((files) => {
            // NOTE: node-tar does some Magic Stuff depending on prefixes for files
            //       specifically with @ signs, so we just neutralize that one
            //       and any such future "features" by prepending `./`
            return tar.create(
              tarOpt,
              files.map((f) => `./${f}`)
            );
          })
          .then(() => Fs.rename(tmpTarget, target))
          .then(() => undefined);
      });
    });
  }

  //
  // dirPacker for pacote when retrieving packages from remote, particularly github
  // reference: https://github.com/npm/cli/blob/58ece8973f43c77b1f4f44ded0f49556ad30eb57/lib/pack.js#L293
  //
  depDirPacker(manifest: Manifest, dir: string): PassThrough {
    const stream = new PassThrough();

    readPkgJson(dir)
      .then((pkg) => {
        if (pkg.scripts && pkg.scripts.prepare) {
          return this._installDependencies(
            dir,
            `preparing gitdep package ${pkg.name} from ${manifest._resolved}`
          );
        }
        return Promise.resolve();
      })
      .then(() => stream.emit("prepared"))
      .then(() => {
        return cacache.tmp.withTmp(
          this._tmpDir,
          { tmpPrefix: "pacote-packing" },
          (tmp: string) => {
            const tmpTar = Path.join(tmp, "package.tgz");
            return this.packDirectory(manifest, dir, tmpTar).then(() => {
              return pipe(Fs.createReadStream(tmpTar), stream);
            });
          }
        );
      })
      .catch((err) => {
        stream.emit("error", err);
      });

    return stream;
  }

  getDirPackerCb(): (manifest: Manifest, dir: string) => PassThrough {
    return (m, d) => this.depDirPacker(m, d);
  }
}

export default PkgPreper;
export { PkgPreper };
export type { PkgPreperOptions, Manifest, PackageJson, InstallDependenciesCallback };
