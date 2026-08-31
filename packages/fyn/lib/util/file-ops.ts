import Promise from "./aveazul";
import lockfile from "lockfile";
import wrapWin32Fs from "./file-ops-win32";
import fs from "fs";

//
// fyn's fs facade.
//
// This was the `opfs` package, which existed to promisify callback fs back when node had no
// fs.promises, and which picked up mkdirp/rimraf/bluebird through a require() driven by the
// owner package.json - dependency sniffing that only ever made bundling harder. Node covers
// all of it now, so the wrapper lives here and opfs is gone.
//
// The shape is what opfs exposed, so no call site changes:
//  - the promise fs methods, resolved as aveazul promises so `Fs.readdir(dir).each(...)` works
//  - the sync methods, constants and classes, straight off `fs`
//  - `exists()`, which fs.promises has no counterpart for
//  - the `$` namespace for the extras: mkdirp, rimraf, acquireLock, releaseLock
//

const fsPromises = fs.promises;

// these return async iterators rather than promises, so they must not be wrapped
const NOT_PROMISE = ["watch", "glob"];

const fileOps: any = { ...fs };

for (const name of Object.keys(fsPromises)) {
  const func = fsPromises[name];
  if (typeof func !== "function" || NOT_PROMISE.includes(name)) {
    continue;
  }
  fileOps[name] = (...args: unknown[]) => Promise.resolve(func.apply(fsPromises, args));
}

fileOps.exists = (path: string) =>
  Promise.resolve(fsPromises.access(path).then(
    () => true,
    () => false
  ));

fileOps.$ = {
  // stays synchronous, as it was under opfs - callers rely on the directory existing
  // on return whether or not they await
  mkdirp: (path: string) => fs.mkdirSync(path, { recursive: true }),
  rimraf: (path: string) => Promise.resolve(fsPromises.rm(path, { recursive: true, force: true })),
  acquireLock: Promise.promisify(lockfile.lock, { context: lockfile }),
  releaseLock: Promise.promisify(lockfile.unlock, { context: lockfile })
};

export default wrapWin32Fs(fileOps);
