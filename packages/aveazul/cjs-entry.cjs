"use strict";

// ESM-only build; this shim keeps `require("aveazul")` returning the AveAzul class,
// because require(esm) yields the module namespace rather than the default export.
const m = require("./dist/index.js");

module.exports = Object.assign(m.default, m);
