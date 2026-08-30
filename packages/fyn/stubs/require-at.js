"use strict";

//
// Faithful reimplementation of `require-at`, used only when bundling.
//
// The real package does `const xrequire = eval("require")`, which makes node refuse to load the
// ESM bundle: with top-level await present (chalker -> optional-import -> ESM-only chalk), an
// eval'd `require` leaves the module format ambiguous and node throws
// ERR_AMBIGUOUS_MODULE_SYNTAX.
//
// fyn no longer imports require-at directly, but optional-require's ESM build still does, so
// this alias covers the transitive path. Behavior matches the original: same directory stat and
// dirname fallback, same per-directory cache, same (dir[, request]) signature.
//
const Path = require("path");
const Fs = require("fs");
const { createRequire } = require("module");
const { fileURLToPath } = require("url");

const cache = new Map();

//
// Accept a `file://` URL, or the half-converted path optional-require produces from one.
//
// optional-require 2.1.0 runs this at import time:
//
//   const appPath = setAppPathAtTopNodeModules(import.meta.url);   // unchanged when the
//   const optionalRequire = makeOptionalRequire(appPath);          // path has no /node_modules/
//
// and its `_getRequire` converts that string with `new URL(x).pathname`. On POSIX that yields
// `/Users/...` and resolves fine. On Windows it yields `/C:/Users/...` - a leading slash before
// the drive letter - which `Path.resolve` turns into `C:\C:\Users\...`; that stat fails, and
// optional-require's `catch` then retries with the raw `file://` string, so the failure surfaces
// as a stat on `C:\Users\<you>\file:\C:\Users\...` and fyn dies before running anything.
//
// `fileURLToPath` is the API that handles the drive-letter form. Normalizing here fixes every
// caller inside the bundle rather than just the ones fyn owns.
//
const normalizeDir = dir => {
  if (typeof dir !== "string") {
    return dir;
  }

  if (dir.startsWith("file://")) {
    return fileURLToPath(dir);
  }

  // `new URL("file:///C:/x").pathname` -> "/C:/x"
  if (/^[\\/][a-zA-Z]:[\\/]/.test(dir)) {
    return dir.slice(1);
  }

  return dir;
};

function requireAt(dir, request) {
  const makeIt = (xdir, checked) => {
    let xRequire = requireAt.cache && requireAt.cache.get(xdir);

    if (!xRequire) {
      let stat;
      try {
        stat = Fs.statSync(xdir);
      } catch (e) {
        throw new Error(`require-at: stat '${xdir}' failed: ${e.message}`);
      }

      if (!stat || !stat.isDirectory()) {
        if (checked) throw new Error(`require-at: not a directory: '${dir}'`);
        return makeIt(Path.dirname(xdir), true);
      }

      // dummy filename so specifiers resolve from xdir itself - createRequire resolves
      // against the dirname of the path it is given
      xRequire = createRequire(Path.join(xdir, "._require-at_"));

      requireAt.cache && requireAt.cache.set(xdir, xRequire);
    }

    return request ? xRequire(request) : xRequire;
  };

  return makeIt(Path.resolve(normalizeDir(dir)), false);
}

requireAt.cache = cache;

module.exports = requireAt;
