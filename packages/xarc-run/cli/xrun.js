"use strict";

const { xrunMain } = require("./xrun-main");

//
// Kept synchronous: tests and programmatic callers invoke this directly and expect it to run
// to completion. chalker is loaded asynchronously by bin/xrun.js before this is called - see
// cli/ck.js for the marker-stripping fallback when it has not been loaded.
//
module.exports = xrunMain;
