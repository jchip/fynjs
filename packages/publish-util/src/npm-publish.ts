import { spawn } from "child_process";
import { getInfo } from "./utils.ts";
import * as assert from "assert";
import * as Fs from "fs/promises";
import * as Path from "path";

function runCmd(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
      }
    });
    child.on("error", reject);
  });
}

interface GetArgOptions {
  opt: string;
  msg?: string;
  argv: string[];
  value?: boolean;
  valids?: string[];
}

function getArg({ opt, msg, argv, value = true, valids = [] }: GetArgOptions): string[] {
  const tagIx = argv.indexOf(opt);

  if (tagIx >= 0) {
    if (value) {
      const val = argv[tagIx + 1];
      if (valids.length > 0) {
        assert.ok(
          valids.includes(val),
          `${opt} has a value ${val} but it must be one of: ${valids.join(", ")}`
        );
      } else {
        assert.ok(val, `${opt} must specify a ${msg}`);
      }
      argv.splice(tagIx, 2);

      return [opt, val];
    } else {
      argv.splice(tagIx, 1);
    }

    return [opt];
  }

  return [];
}

async function removeFile(name?: string): Promise<void> {
  try {
    if (name) {
      await Fs.unlink(name);
    }
  } catch {
    // ignore errors
  }
}

export interface NpmPublishOptions {
  exit?: boolean;
  silent?: boolean;
}

export async function npmPublish({
  exit = true,
  silent = false,
}: NpmPublishOptions = {}): Promise<number> {
  const noop = (): void => {};
  process.on("SIGINT", noop);
  const argv = [...process.argv.slice(2)];

  const { pkgDir, pkgFile, pkg, pkgData } = await getInfo();

  const dryRun = getArg({ opt: "--dry-run", value: false, argv }).length > 0;
  const tag = getArg({ opt: "--tag", msg: "tag", argv });
  const access = getArg({
    opt: "--access",
    msg: "access",
    argv,
    valids: ["public", "restricted"],
  });

  let changedPkg = false;
  let exitCode = 0;

  const pkgName = (pkg.name as string) || "unknown";
  const pkgVersion = (pkg.version as string) || "0.0.0";
  const tgzName = pkgName.replace(/@/g, "").replace(/\//g, "-");
  const tgzFile = `${tgzName}-${pkgVersion}.tgz`;
  const fullTgzFile = Path.join(pkgDir, tgzFile);

  const saveDir = process.cwd();

  const restore = async (): Promise<void> => {
    try {
      if (changedPkg) {
        if (!silent) {
          console.log("Restoring", pkgFile);
        }
        await Fs.writeFile(pkgFile, pkgData);
      }
    } catch {
      // ignore errors
    }

    try {
      process.chdir(saveDir);
    } catch {
      // ignore errors
    }

    process.removeListener("SIGINT", noop);
  };

  try {
    process.env.BY_PUBLISH_UTIL = "1";
    process.chdir(pkgDir);

    const scripts = (pkg.scripts || {}) as Record<string, string>;

    if (scripts.prepublish) {
      console.error(
        "Warning: You have 'prepublish' npm script which is deprecated - npm publish will not run it."
      );
      delete scripts.prepublish;
      changedPkg = true;
    }

    if (dryRun) {
      delete scripts.prepare;
      changedPkg = true;
    }

    if (changedPkg) {
      await Fs.writeFile(pkgFile, JSON.stringify(pkg, null, 2));
    }

    if (scripts.prepublishOnly) {
      await runCmd("npm", ["run", "prepublishOnly"]);
    }

    await removeFile(fullTgzFile);

    await runCmd("npm", ["pack"]);

    if (scripts.publish) {
      await runCmd("npm", ["run", "publish"]);
    }

    if (!dryRun) {
      const publishArgs = ["publish", ...tag, ...access, fullTgzFile, ...argv];
      if (!silent) {
        console.log("publishing args:", publishArgs.join(" "));
      }
      await runCmd("npm", publishArgs);
    } else {
      console.log("dry-run", tgzFile, "args:", [...tag, ...access, ...argv]);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("SIGINT")) {
      console.log("");
    } else {
      console.error("publish failed!", err);
    }
    exitCode = 1;
  } finally {
    await restore();
    await removeFile(fullTgzFile);
    if (exit) {
      process.exit(exitCode);
    }
  }

  return exitCode;
}
