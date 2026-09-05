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

const cache = new Map();

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

  return makeIt(Path.resolve(dir), false);
}

requireAt.cache = cache;

module.exports = requireAt;
