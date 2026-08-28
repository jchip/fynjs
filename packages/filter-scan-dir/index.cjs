"use strict";

// ESM-only build; this shim keeps `require("filter-scan-dir")` callable,
// because require(esm) yields the module namespace rather than a function.
const m = require("./dist/index.js");

module.exports = Object.assign(m.filterScanDir, m);
