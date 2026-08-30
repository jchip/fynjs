"use strict";

//
// chalk 6 is ESM-only and this package is CJS.
//
// node >= 22.12 (this package's engines floor) can `require()` an ESM module as long as it has
// no top-level await, which chalk does not have. What comes back is the module *namespace*, so
// the callable chalk sits on `.default` rather than being the export itself.
//
// Centralized here so that interop detail is stated once instead of at each call site, where
// a bare `.default` reads like a mistake and invites someone to "fix" it.
//
module.exports = require("chalk").default;
