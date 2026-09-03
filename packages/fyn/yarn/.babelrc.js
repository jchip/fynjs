"use strict";

//
// yarn/src is yarn's flow-typed lockfile parser, compiled to CJS for yarn/index.js to require.
//
// The target tracks package.json engines (node >=22.12.0). It used to say node 8, which made
// babel emit its ES5 helper preamble - _defineProperty, _toPrimitive and friends - for source
// that runs as-is on any node fyn supports. Only the ESM-to-CJS transform is actually needed
// here, and preset-env keeps doing that at any target.
//
module.exports = {
  presets: ["@babel/preset-flow", ["@babel/preset-env", { targets: { node: "22" } }]]
};
