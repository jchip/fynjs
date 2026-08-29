"use strict";

//
// The release bundle is ESM (dist/fyn.mjs) because chalker uses top-level await to optionally
// load ESM-only chalk, and no CJS output format can represent module-scope await.
//
// This file stays CJS so package.json can remain type: commonjs. Reaching an ESM bundle from
// CJS costs one async hop, so run/fun return promises - which is what bin/fyn.js and
// bin/fun.js already expected.
//
const Path = require("path");
const { pathToFileURL } = require("url");

const bundle = require("./bundle");

// resolve to an absolute file URL so the import does not depend on the caller's cwd
const bundleUrl = pathToFileURL(Path.join(__dirname, bundle)).href;

const loadBundle = () => import(bundleUrl).then(m => m.default || m);

module.exports = {
  run: (...args) => loadBundle().then(m => m.run(...args)),
  fun: (...args) => loadBundle().then(m => m.fun(...args))
};
