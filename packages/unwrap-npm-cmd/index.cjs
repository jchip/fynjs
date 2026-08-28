"use strict";

// ESM-only build; this shim keeps `require("unwrap-npm-cmd")` callable, matching
// the long-published `module.exports = function` shape. require(esm) yields the
// module namespace rather than the default export.
const m = require("./dist/index.js");

module.exports = Object.assign(m.default, m);
