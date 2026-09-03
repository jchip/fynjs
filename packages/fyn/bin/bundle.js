"use strict";

//
// Resolve the release bundle, and refuse to run on a node older than package.json engines.
//
// This used to gate on node >= 8 and load v8-compile-cache. Both were left over from the CJS
// webpack bundle: the gate named a version fyn stopped supporting long ago, and
// v8-compile-cache patches `Module.prototype._compile`, which an ESM bundle loaded through
// `import()` never goes through - it produced no cache entries at all.
//
const MIN_NODE = "22.12.0";

const cmp = (a, b) => {
  const pa = a.split(".").map(n => parseInt(n, 10));
  const pb = b.split(".").map(n => parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
};

if (cmp(process.versions.node.split("-")[0], MIN_NODE) < 0) {
  console.error(
    `fyn requires node >= ${MIN_NODE}, and this is ${process.versions.node}.`
  );
  process.exit(1);
}

module.exports = "../dist/fyn.mjs";
