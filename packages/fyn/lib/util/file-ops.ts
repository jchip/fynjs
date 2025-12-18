import Promise from "./aveazul";
import opfs from "opfs";
import lockfile from "lockfile";
import wrapWin32Opfs from "./file-ops-win32";
import fs from "fs";

opfs._opfsSetPromise(Promise);

opfs.$.acquireLock = Promise.promisify(lockfile.lock, { context: lockfile });
opfs.$.releaseLock = Promise.promisify(lockfile.unlock, { context: lockfile });

// Add rimraf implementation using fs.rm (Node.js 14.14+)
// Replace the opfs rimraf wrapper with native fs.rm
opfs.$.rimraf = async (path: string) => {
  return fs.promises.rm(path, { recursive: true, force: true });
};

// Add mkdirp implementation using fs.mkdirSync (Node.js 10.12+)
// Replace the opfs mkdirp wrapper with native fs.mkdirSync
opfs.$.mkdirp = (path: string) => {
  return fs.mkdirSync(path, { recursive: true });
};

export default wrapWin32Opfs(opfs);