"use strict";

// ESM-only build; this shim keeps `require("aveazul")` returning the AveAzul class,
// because require(esm) yields the module namespace rather than the default export.
const m = require("./dist/index.js");
const AveAzul = m.default;

// Add the other named exports without overwriting class statics. The named
// `promisify`/`promisifyAll` return native promises; the class ones must win.
for (const key of Object.keys(m)) {
  if (!(key in AveAzul)) AveAzul[key] = m[key];
}

module.exports = AveAzul;
