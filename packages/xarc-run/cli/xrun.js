"use strict";

const { xrunMain } = require("./xrun-main");
const ck = require("./ck");

//
// chalker is ESM-only with top-level await, so it can only be loaded asynchronously. Load it
// once here, before any task runs, so the dozen synchronous `ck` log call sites keep working.
// See cli/ck.js for the fallback when it is not loaded.
//
module.exports = async function xrun(...args) {
  await ck.load();
  return xrunMain(...args);
};
