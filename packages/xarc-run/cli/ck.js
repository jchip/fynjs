"use strict";

//
// chalker is ESM-only and uses top-level await (it optionally imports ESM-only chalk), so a CJS
// package like this one can no longer `require("chalker")` - node throws
// ERR_REQUIRE_ASYNC_MODULE, and bundlers/tsx cannot transform top-level await to CJS either.
//
// chalker is used here as a synchronous tagged template at a dozen log call sites, so awaiting
// at each one is not practical. Instead the CLI entry awaits `ck.load()` once, and the call
// sites keep calling this synchronously.
//
// Before load (or if chalker cannot be loaded at all) this degrades to stripping the color
// markers, which is exactly what chalker's own `remove()` does. Output stays readable and
// deterministic - it never starts plain and silently turns colored mid-run.
//

let impl = null;
let loading = null;

/** rebuild the string from a tagged template call, or pass a plain string through */
function joinTemplate(s, args) {
  if (!Array.isArray(s)) {
    return s === undefined || s === null ? "" : String(s);
  }

  let out = "";
  let i;
  for (i = 0; i < args.length; i++) {
    out += s[i] + String(args[i]);
  }

  return out + s[i];
}

/** chalker marker syntax is <green>text</> - drop the markers when we have no colors */
function stripMarkers(str) {
  return str.replace(/<[^>]*>/g, "");
}

function ck(s, ...args) {
  if (impl) {
    return impl(s, ...args);
  }

  return stripMarkers(joinTemplate(s, args));
}

/**
 * Load chalker. Safe to call more than once - concurrent callers share the one in flight
 * import. Never rejects: colors are optional, so a failure just leaves the marker-stripping
 * fallback in place.
 *
 * @returns the chalker function, or null if it could not be loaded
 */
ck.load = async function load() {
  if (impl) {
    return impl;
  }

  if (!loading) {
    loading = import("chalker")
      .then(mod => {
        impl = mod.default;
        return impl;
      })
      .catch(() => null);
  }

  return loading;
};

module.exports = ck;
