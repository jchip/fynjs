"use strict";

// Re-export from the built CJS module
const mod = require("./dist-cjs/index.cjs");

// Backward compatibility fix: ensure module.exports works for old code
// that expects: const mod = require("unwrap-npm-cmd"); mod(...)
// while still supporting: const { unwrapNpmCmd } = require("unwrap-npm-cmd");
// This is needed because the old published version had module.exports = function...

const unwrapNpmCmd = mod.unwrapNpmCmd || mod.default || mod;

// Create wrapper function for old export style
function oldExport(...args) {
  return unwrapNpmCmd(...args);
}

// Set module.exports to the wrapper function (for old code expecting default export)
module.exports = oldExport;

// Restore named exports for destructuring (for new code)
Object.assign(module.exports, {
  unwrapNpmCmd: unwrapNpmCmd,
  default: unwrapNpmCmd,
  quote: mod.quote,
  relative: mod.relative,
  unquote: mod.unquote,
  resolveNpmCmd: mod.resolveNpmCmd
});
