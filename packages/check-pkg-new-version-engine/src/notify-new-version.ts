import isInstallGlobally from "is-installed-globally";
import { NotifyData } from "./types.js";

/**
 * Simple notifying using console.
 *
 * @param data - notify data
 *
 */
export function internalNotify(data: NotifyData): void {
  const globalFlag = isInstallGlobally ? "-g " : "";
  process.on("exit", () => {
    console.log(`

    New version '${data.name}' available ${data.version} -> ${data.newVersion}
    Run 'npm i ${globalFlag}${data.name}@${data.newVersion}' to update.

`);
  });
}
