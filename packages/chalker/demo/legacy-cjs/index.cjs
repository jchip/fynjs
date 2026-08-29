"use strict";

process.env.FORCE_COLOR = "1";

const assert = require("assert");

// chalker is a real ESM-only package (Node "require(esm)": Node >=22.12 lets a CJS
// file require() an ESM module, but the result is the module namespace object -
// same shape `await import()` would give - not the default export itself.
const chalker = require("chalker");

assert.equal(typeof chalker, "function");
assert.equal(chalker.remove("<red>plain</red>"), "plain");
assert.equal(chalker("<red>ok</red>"), "\u001b[31mok\u001b[39m");
assert.match(chalker("<orange.bg(gold).hsl(32,100,50).bgHsv(120,100,50)>ok</>"), /\u001b\[[\d;]+mok/);

console.log("legacy-cjs ok");
