//
// Test color state must not depend on the invoking harness: xrun sets
// FORCE_COLOR=1 for child processes, which would make the in-process fyn CLI
// emit ANSI codes that scenario assertions matching plain text can't handle.
//
process.env.FORCE_COLOR = "0";

//
// Fail any test that writes into this package's own node_modules. Other spec files import from
// it at the same time, so such a write makes them fail to load at random.
//
import Fs from "node:fs";
import Path from "node:path";

const guarded = Path.resolve(import.meta.dirname, "../node_modules") + Path.sep;
// vitest and vite keep their caches here
const allowed = [".vite", ".vite-temp", ".vitest"].map(d => guarded + d);

const check = (op: string, p: unknown): void => {
  if (typeof p !== "string") return;
  const full = Path.resolve(p);
  if (full.startsWith(guarded) && !allowed.some(a => full.startsWith(a))) {
    throw new Error(`a test called ${op} in fyn's own node_modules: ${full}`);
  }
};

/** wrap fs method `name` to check the path args at `paths`; a promise method rejects instead of throwing */
const guard = (obj: any, name: string, paths: number[], isPromise: boolean): void => {
  const orig = obj[name];
  obj[name] = function (...args: unknown[]) {
    try {
      for (const i of paths) check(name, args[i]);
    } catch (err) {
      if (isPromise) return Promise.reject(err);
      throw err;
    }
    return orig.apply(this, args);
  };
};

for (const [name, paths] of Object.entries({
  writeFile: [0],
  appendFile: [0],
  link: [1],
  symlink: [1],
  copyFile: [1],
  rename: [0, 1],
  unlink: [0],
  mkdir: [0],
  rm: [0],
  rmdir: [0],
  utimes: [0]
})) {
  guard(Fs.promises, name, paths, true);
  guard(Fs, `${name}Sync`, paths, false);
}
