"use strict";

// Re-export from the built CJS module
const mod = require("./dist-cjs/index.cjs");

// Backward compatibility wrapper for default export style
const defaultExport = mod.default || mod;

function oldExport(...args) {
  return defaultExport(...args);
}

module.exports = oldExport;
Object.assign(module.exports, {
  default: defaultExport,
  ...mod
});
