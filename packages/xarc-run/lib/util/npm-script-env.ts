import Path from "path";
import { myPkgDir } from "../my-pkg.js";

interface MakeNpmScriptEnvOptions {
  pkgPath: string;
  pkgJson: { name?: string; version?: string };
  scriptName: string;
  scriptCmd: string;
  initCwd: string;
}

export default function makeNpmScriptEnv({
  pkgPath,
  pkgJson,
  scriptName,
  scriptCmd,
  initCwd
}: MakeNpmScriptEnvOptions): Record<string, string> {
  const node = process.env.NODE || process.execPath;

  const env: Record<string, string> = {
    npm_lifecycle_event: scriptName,
    npm_lifecycle_script: scriptCmd,
    npm_execpath: Path.join(myPkgDir, "bin", "xrun.js"),
    npm_node_execpath: node,
    NODE: node,
    npm_package_json: pkgPath,
    INIT_CWD: initCwd,
    PWD: Path.dirname(pkgPath)
  };

  if (pkgJson.name) {
    env.npm_package_name = pkgJson.name;
  }
  if (pkgJson.version) {
    env.npm_package_version = pkgJson.version;
  }

  return env;
}
