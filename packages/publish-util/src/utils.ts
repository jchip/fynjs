import * as Fs from "fs/promises";
import * as Os from "os";
import * as Path from "path";
import { findUp } from "find-up";
import _ from "lodash";

export interface PackageInfo {
  pkgDir: string;
  pkg: Record<string, unknown>;
  pkgData: Buffer;
  tmpDir: string;
  saveName: string;
  saveFile: string;
  pkgFile: string;
}

export async function getInfo(cwd: string = process.env.INIT_CWD || process.cwd()): Promise<PackageInfo> {
  const pkgFile = await findUp("package.json", { cwd });
  if (!pkgFile) {
    throw new Error(`No package.json found starting from directory: ${cwd}`);
  }
  const pkgDir = Path.dirname(pkgFile);
  const pkgData = await Fs.readFile(pkgFile);
  const pkg = JSON.parse(pkgData.toString()) as Record<string, unknown>;

  const tmpDir = Os.tmpdir();
  const pkgName = (pkg.name as string) || "unknown";
  const saveName = `package-util-${pkgName.replace(/[@\/]/g, "_")}_pkg.json`;
  const saveFile = Path.join(tmpDir, saveName);

  return { pkgDir, pkg, pkgData, tmpDir, saveName, saveFile, pkgFile };
}

function transferField(f: string, from: Record<string, unknown>, to: Record<string, unknown>): void {
  if (f.startsWith("/")) {
    const parts = f.split("/");

    if (parts.length === 3) {
      const regex = new RegExp(parts[1], parts[2]);
      Object.keys(from).forEach((fk) => {
        if (fk.match(regex)) {
          to[fk] = from[fk];
        }
      });
      return;
    }
  }
  to[f] = from[f];
}

function deleteFields(f: string, obj: Record<string, unknown>): void {
  if (f.startsWith("/")) {
    const parts = f.split("/");

    if (parts.length === 3) {
      const regex = new RegExp(parts[1], parts[2]);
      Object.keys(obj).forEach((fk) => {
        if (fk.match(regex)) {
          delete obj[fk];
        }
      });
      return;
    }
  }

  delete obj[f];
}

export type RenameSpec = Record<string, string | string[]>;

export function renameFromObj(obj: Record<string, unknown>, rename?: RenameSpec): void {
  if (rename) {
    for (const key in rename) {
      const data = _.get(obj, key);
      if (data !== undefined && rename[key]) {
        _.unset(obj, key);
        _.set(obj, rename[key], data);
      }
    }
  }
}

export type RemoveSpec = (string | Record<string, RemoveSpec>)[];

export function removeFromObj(obj: Record<string, unknown>, fields: RemoveSpec): void {
  for (const f of fields) {
    if (typeof f === "string") {
      deleteFields(f, obj);
    } else {
      Object.keys(f).forEach((f2) => {
        removeFromObj(obj[f2] as Record<string, unknown>, f[f2] as RemoveSpec);
      });
    }
  }
}

export type ExtractSpec = (string | Record<string, ExtractSpec>)[];

export function extractFromObj(
  obj: Record<string, unknown>,
  fields: ExtractSpec,
  output: Record<string, unknown> = {}
): Record<string, unknown> {
  for (const f of fields) {
    if (typeof f === "string") {
      transferField(f, obj, output);
      continue;
    }

    for (const f2 of Object.keys(f)) {
      const obj2 = obj[f2];
      // falsy is just a primitive, safe to assign
      if (!obj2) {
        output[f2] = obj2;
        continue;
      }

      const t = typeof obj2;
      if (
        t === "number" ||
        t === "string" ||
        t === "boolean" ||
        t === "bigint" ||
        t === "symbol"
      ) {
        // assign primitive
        output[f2] = obj2;
      } else {
        // extract into potential object
        const constructor = (obj2 as object).constructor as new () => Record<string, unknown>;
        output[f2] = extractFromObj(
          obj2 as Record<string, unknown>,
          f[f2] as ExtractSpec,
          new constructor()
        );
      }
    }
  }

  return output;
}

// https://docs.npmjs.com/cli/v7/configuring-npm/package-json
export const keepStandardFields = [
  "name",
  "version",
  "description",
  "keywords",
  "homepage",
  "bugs",
  "license",
  "author",
  "contributors",
  "funding",
  "files",
  "main",
  "browser",
  "bin",
  "man",
  "directories",
  "repository",
  "scripts",
  "config",
  "dependencies",
  // "devDependencies",
  "peerDependencies",
  "peerDependenciesMeta",
  "bundledDependencies",
  "optionalDependencies",
  "engines",
  "os",
  "cpu",
  "private",
  "publishConfig",
  //   "workspaces"

  // extras
  "module",
  "type", // module type
  "types", // typescript types

  // ESM
  "exports", // subpath exports entry point
  "imports", // subpath imports entry point
];
