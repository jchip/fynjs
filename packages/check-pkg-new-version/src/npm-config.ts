import ini from "ini";
import os from "os";
import Path from "path";
import { promises as Fs } from "fs";

/**
 * Load a npm ini rc file from dir
 *
 * @param dir - directory
 * @param rcFile - file name, default to `".npmrc"`
 *
 * @returns ini rc data
 */
async function loadIni(dir: string, rcFile = ".npmrc"): Promise<Record<string, string>> {
  try {
    const iniFile = Path.join(dir, rcFile);
    const iniData = await Fs.readFile(iniFile, "utf-8");
    const iniRc = ini.parse(iniData);
    return iniRc;
  } catch {
    return {};
  }
}

/**
 * load .npmrc from homedir
 *
 * @returns npmrc
 */
export async function getNpmRcConfig(): Promise<Record<string, string>> {
  return { ...(await loadIni(os.homedir())), ...(await loadIni(process.cwd())) };
}
